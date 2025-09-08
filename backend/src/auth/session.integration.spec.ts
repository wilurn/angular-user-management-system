import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { SessionService } from './session.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Role, UserStatus } from '@prisma/client';

describe('SessionService Integration', () => {
  let module: TestingModule;
  let sessionService: SessionService;
  let redisService: RedisService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockUser: UserResponseDto = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    phone: null,
    profilePicture: null,
    address: null,
    lastLoginAt: null,
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            secret: configService.get<string>('JWT_SECRET') || 'test-secret',
            signOptions: {
              expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '1h',
            },
          }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        SessionService,
        RedisService,
        PrismaService,
      ],
    }).compile();

    sessionService = module.get<SessionService>(SessionService);
    redisService = module.get<RedisService>(RedisService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    // Initialize Redis connection
    await redisService.onModuleInit();
  });

  afterAll(async () => {
    // Clean up Redis connections
    await redisService.onModuleDestroy();
    await module.close();
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await redisService.deleteByPattern('session:*');
    await redisService.deleteByPattern('user_sessions:*');
    
    // Clean up database test data
    await prismaService.userSession.deleteMany({
      where: {
        userId: mockUser.id,
      },
    });
  });

  describe('Session Lifecycle', () => {
    it('should create, validate, and invalidate session successfully', async () => {
      // Generate JWT token
      const jwtToken = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Create session
      const sessionId = await sessionService.createSession(
        mockUser,
        jwtToken,
        '127.0.0.1',
        'test-agent',
      );

      expect(sessionId).toBeDefined();
      expect(sessionId).toHaveLength(64);

      // Validate session
      const sessionData = await sessionService.validateSession(sessionId);
      expect(sessionData).toBeDefined();
      expect(sessionData?.userId).toBe(mockUser.id);
      expect(sessionData?.email).toBe(mockUser.email);
      expect(sessionData?.jwtToken).toBe(jwtToken);
      expect(sessionData?.ipAddress).toBe('127.0.0.1');
      expect(sessionData?.userAgent).toBe('test-agent');

      // Validate session token
      const user = await sessionService.validateSessionToken(sessionId);
      expect(user).toBeDefined();
      expect(user?.id).toBe(mockUser.id);

      // Invalidate session
      await sessionService.invalidateSession(sessionId);

      // Verify session is invalidated
      const invalidatedSession = await sessionService.validateSession(sessionId);
      expect(invalidatedSession).toBeNull();
    });

    it('should handle multiple sessions for the same user', async () => {
      const jwtToken1 = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      const jwtToken2 = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Create two sessions
      const sessionId1 = await sessionService.createSession(
        mockUser,
        jwtToken1,
        '127.0.0.1',
        'agent-1',
      );

      const sessionId2 = await sessionService.createSession(
        mockUser,
        jwtToken2,
        '192.168.1.1',
        'agent-2',
      );

      // Both sessions should be valid
      const session1 = await sessionService.validateSession(sessionId1);
      const session2 = await sessionService.validateSession(sessionId2);

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1?.userAgent).toBe('agent-1');
      expect(session2?.userAgent).toBe('agent-2');

      // Get user sessions
      const userSessions = await sessionService.getUserSessions(mockUser.id);
      expect(userSessions).toHaveLength(2);

      // Invalidate all user sessions
      await sessionService.invalidateAllUserSessions(mockUser.id);

      // Both sessions should be invalidated
      const invalidatedSession1 = await sessionService.validateSession(sessionId1);
      const invalidatedSession2 = await sessionService.validateSession(sessionId2);

      expect(invalidatedSession1).toBeNull();
      expect(invalidatedSession2).toBeNull();
    });

    it('should refresh session expiration', async () => {
      const jwtToken = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Create session
      const sessionId = await sessionService.createSession(mockUser, jwtToken);

      // Get initial session data
      const initialSession = await sessionService.validateSession(sessionId);
      expect(initialSession).toBeDefined();

      const initialExpiresAt = initialSession?.expiresAt;

      // Wait a moment to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refresh session
      const refreshResult = await sessionService.refreshSession(sessionId);
      expect(refreshResult).toBe(true);

      // Get updated session data
      const refreshedSession = await sessionService.validateSession(sessionId);
      expect(refreshedSession).toBeDefined();

      const refreshedExpiresAt = refreshedSession?.expiresAt;

      // Expiration time should be updated
      expect(new Date(refreshedExpiresAt!).getTime()).toBeGreaterThan(
        new Date(initialExpiresAt!).getTime(),
      );
    });

    it('should handle session persistence across Redis restarts', async () => {
      const jwtToken = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Create session (should be stored in both Redis and database)
      const sessionId = await sessionService.createSession(mockUser, jwtToken);

      // Verify session exists in Redis
      const redisSession = await sessionService.validateSession(sessionId);
      expect(redisSession).toBeDefined();

      // Simulate Redis data loss by deleting from Redis
      await redisService.del(`session:${sessionId}`);
      await redisService.del(`user_sessions:${mockUser.id}`);

      // Session should still be recoverable from database
      const recoveredSession = await sessionService.validateSession(sessionId);
      expect(recoveredSession).toBeDefined();
      expect(recoveredSession?.userId).toBe(mockUser.id);

      // Session should be restored to Redis
      const redisRestoredSession = await redisService.get(`session:${sessionId}`);
      expect(redisRestoredSession).toBeDefined();
    });

    it('should handle expired sessions correctly', async () => {
      // Mock a very short session TTL for testing
      const originalTtl = (sessionService as any).sessionTtl;
      (sessionService as any).sessionTtl = 1; // 1 second

      const jwtToken = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Create session with short TTL
      const sessionId = await sessionService.createSession(mockUser, jwtToken);

      // Session should be valid initially
      const initialSession = await sessionService.validateSession(sessionId);
      expect(initialSession).toBeDefined();

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Session should be expired and automatically invalidated
      const expiredSession = await sessionService.validateSession(sessionId);
      expect(expiredSession).toBeNull();

      // Restore original TTL
      (sessionService as any).sessionTtl = originalTtl;
    });

    it('should cleanup expired sessions from database', async () => {
      const jwtToken = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Create session
      const sessionId = await sessionService.createSession(mockUser, jwtToken);

      // Manually mark session as expired in database
      await prismaService.userSession.updateMany({
        where: { id: sessionId },
        data: { expiresAt: new Date(Date.now() - 3600000) }, // 1 hour ago
      });

      // Run cleanup
      await sessionService.cleanupExpiredSessions();

      // Session should be removed from database
      const dbSession = await prismaService.userSession.findUnique({
        where: { id: sessionId },
      });
      expect(dbSession).toBeNull();

      // Session should also be removed from Redis
      const redisSession = await redisService.get(`session:${sessionId}`);
      expect(redisSession).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session IDs gracefully', async () => {
      const result = await sessionService.validateSession('invalid-session-id');
      expect(result).toBeNull();
    });

    it('should handle malformed session data in Redis', async () => {
      // Store invalid JSON in Redis
      await redisService.set('session:malformed', 'invalid-json');

      const result = await sessionService.validateSession('malformed');
      expect(result).toBeNull();

      // Invalid session should be cleaned up
      const cleanedSession = await redisService.get('session:malformed');
      expect(cleanedSession).toBeNull();
    });

    it('should continue operation when database is unavailable', async () => {
      const jwtToken = jwtService.sign({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Mock database error
      const originalCreate = prismaService.userSession.create;
      prismaService.userSession.create = jest.fn().mockRejectedValue(new Error('DB Error'));

      // Session creation should still succeed with Redis-only storage
      const sessionId = await sessionService.createSession(mockUser, jwtToken);
      expect(sessionId).toBeDefined();

      // Session should be valid from Redis
      const session = await sessionService.validateSession(sessionId);
      expect(session).toBeDefined();

      // Restore original method
      prismaService.userSession.create = originalCreate;
    });
  });
});