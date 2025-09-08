import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SessionService, SessionData } from './session.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Role, UserStatus } from '@prisma/client';

describe('SessionService', () => {
  let service: SessionService;
  let redisService: jest.Mocked<RedisService>;
  let prismaService: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser: UserResponseDto = {
    id: 'user-1',
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

  const mockSessionData: SessionData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    jwtToken: 'jwt-token',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  };

  beforeEach(async () => {
    const mockRedisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      hset: jest.fn(),
      hget: jest.fn(),
      hgetall: jest.fn(),
      hdel: jest.fn(),
      expire: jest.fn(),
    };

    const mockPrismaService = {
      userSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const mockJwtService = {
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(86400), // 24 hours
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    redisService = module.get(RedisService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new session successfully', async () => {
      redisService.set.mockResolvedValue(undefined);
      redisService.hset.mockResolvedValue(1);
      redisService.expire.mockResolvedValue(true);
      prismaService.userSession.create.mockResolvedValue({
        id: 'session-id',
        userId: 'user-1',
        token: 'jwt-token',
        expiresAt: new Date(),
        createdAt: new Date(),
        isActive: true,
      });

      const sessionId = await service.createSession(
        mockUser,
        'jwt-token',
        '127.0.0.1',
        'test-agent',
      );

      expect(sessionId).toBeDefined();
      expect(sessionId).toHaveLength(64); // 32 bytes * 2 (hex)
      expect(redisService.set).toHaveBeenCalled();
      expect(redisService.hset).toHaveBeenCalled();
      expect(prismaService.userSession.create).toHaveBeenCalled();
    });

    it('should continue with Redis-only session if database fails', async () => {
      redisService.set.mockResolvedValue(undefined);
      redisService.hset.mockResolvedValue(1);
      redisService.expire.mockResolvedValue(true);
      prismaService.userSession.create.mockRejectedValue(new Error('DB Error'));

      const sessionId = await service.createSession(mockUser, 'jwt-token');

      expect(sessionId).toBeDefined();
      expect(redisService.set).toHaveBeenCalled();
    });
  });

  describe('validateSession', () => {
    it('should validate session from Redis successfully', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockSessionData));

      const result = await service.validateSession('session-id');

      expect(result).toBeDefined();
      expect(result?.userId).toBe(mockSessionData.userId);
      expect(result?.email).toBe(mockSessionData.email);
      expect(result?.jwtToken).toBe(mockSessionData.jwtToken);
      expect(redisService.get).toHaveBeenCalledWith('session:session-id');
    });

    it('should return null for non-existent session', async () => {
      redisService.get.mockResolvedValue(null);
      prismaService.userSession.findUnique.mockResolvedValue(null);

      const result = await service.validateSession('session-id');

      expect(result).toBeNull();
    });

    it('should restore session from database if not in Redis', async () => {
      redisService.get.mockResolvedValue(null);
      prismaService.userSession.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'user-1',
        token: 'jwt-token',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        createdAt: new Date(),
        isActive: true,
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          role: Role.USER,
          status: UserStatus.ACTIVE,
          phone: null,
          password: 'hashed',
          profilePicture: null,
          address: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: null,
        },
      });
      redisService.set.mockResolvedValue(undefined);

      const result = await service.validateSession('session-id');

      expect(result).toBeDefined();
      expect(result?.userId).toBe('user-1');
      expect(redisService.set).toHaveBeenCalled(); // Session restored to Redis
    });

    it('should return null for expired session', async () => {
      const expiredSessionData = {
        ...mockSessionData,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      };
      redisService.get.mockResolvedValue(JSON.stringify(expiredSessionData));
      redisService.del.mockResolvedValue(1);
      redisService.hdel.mockResolvedValue(1);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.validateSession('session-id');

      expect(result).toBeNull();
      expect(redisService.del).toHaveBeenCalled(); // Session invalidated
    });

    it('should handle invalid JSON in session data', async () => {
      redisService.get.mockResolvedValue('invalid-json');
      redisService.del.mockResolvedValue(1);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.validateSession('session-id');

      expect(result).toBeNull();
      expect(redisService.del).toHaveBeenCalled(); // Session invalidated
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate session successfully', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockSessionData));
      redisService.hdel.mockResolvedValue(1);
      redisService.del.mockResolvedValue(1);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 1 });

      await service.invalidateSession('session-id');

      expect(redisService.del).toHaveBeenCalledWith('session:session-id');
      expect(redisService.hdel).toHaveBeenCalledWith('user_sessions:user-1', 'session-id');
      expect(prismaService.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-id' },
        data: { isActive: false },
      });
    });

    it('should handle session invalidation when session data is not found', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.del.mockResolvedValue(1);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 1 });

      await service.invalidateSession('session-id');

      expect(redisService.del).toHaveBeenCalledWith('session:session-id');
      expect(prismaService.userSession.updateMany).toHaveBeenCalled();
    });
  });

  describe('invalidateAllUserSessions', () => {
    it('should invalidate all user sessions', async () => {
      redisService.hgetall.mockResolvedValue({
        'session-1': 'session:session-1',
        'session-2': 'session:session-2',
      });
      redisService.get.mockResolvedValue(JSON.stringify(mockSessionData));
      redisService.hdel.mockResolvedValue(1);
      redisService.del.mockResolvedValue(1);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 2 });

      await service.invalidateAllUserSessions('user-1');

      expect(redisService.hgetall).toHaveBeenCalledWith('user_sessions:user-1');
      expect(redisService.del).toHaveBeenCalledTimes(3); // 2 sessions + user sessions hash
      expect(prismaService.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        data: { isActive: false },
      });
    });
  });

  describe('refreshSession', () => {
    it('should refresh session successfully', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockSessionData));
      redisService.set.mockResolvedValue(undefined);
      redisService.expire.mockResolvedValue(true);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refreshSession('session-id');

      expect(result).toBe(true);
      expect(redisService.set).toHaveBeenCalled();
      expect(prismaService.userSession.updateMany).toHaveBeenCalled();
    });

    it('should return false for invalid session', async () => {
      redisService.get.mockResolvedValue(null);
      prismaService.userSession.findUnique.mockResolvedValue(null);

      const result = await service.refreshSession('session-id');

      expect(result).toBe(false);
    });
  });

  describe('validateSessionToken', () => {
    it('should validate session token successfully', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockSessionData));
      jwtService.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com', role: 'USER' });
      prismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: Role.USER,
        status: UserStatus.ACTIVE,
        phone: null,
        password: 'hashed',
        profilePicture: null,
        address: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      });

      const result = await service.validateSessionToken('session-id');

      expect(result).toBeDefined();
      expect(result?.id).toBe('user-1');
      expect(jwtService.verify).toHaveBeenCalledWith('jwt-token');
    });

    it('should return null for invalid JWT token', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockSessionData));
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      redisService.del.mockResolvedValue(1);
      redisService.hdel.mockResolvedValue(1);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.validateSessionToken('session-id');

      expect(result).toBeNull();
      expect(redisService.del).toHaveBeenCalled(); // Session invalidated
    });

    it('should return null for inactive user', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockSessionData));
      jwtService.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com', role: 'USER' });
      prismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: Role.USER,
        status: UserStatus.INACTIVE,
        phone: null,
        password: 'hashed',
        profilePicture: null,
        address: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      });
      redisService.del.mockResolvedValue(1);
      redisService.hdel.mockResolvedValue(1);
      prismaService.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.validateSessionToken('session-id');

      expect(result).toBeNull();
      expect(redisService.del).toHaveBeenCalled(); // Session invalidated
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      const expiredSessions = [
        { id: 'session-1', userId: 'user-1' },
        { id: 'session-2', userId: 'user-2' },
      ];
      prismaService.userSession.findMany.mockResolvedValue(expiredSessions);
      redisService.del.mockResolvedValue(1);
      redisService.hdel.mockResolvedValue(1);
      prismaService.userSession.deleteMany.mockResolvedValue({ count: 2 });

      await service.cleanupExpiredSessions();

      expect(prismaService.userSession.findMany).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalledTimes(2);
      expect(redisService.hdel).toHaveBeenCalledTimes(2);
      expect(prismaService.userSession.deleteMany).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      prismaService.userSession.findMany.mockRejectedValue(new Error('DB Error'));

      await expect(service.cleanupExpiredSessions()).resolves.not.toThrow();
    });
  });
});