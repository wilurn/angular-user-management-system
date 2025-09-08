import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ConfigModule } from '@nestjs/config';

describe('PrismaService', () => {
  let service: PrismaService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await service.$disconnect();
    await module.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test in proper order due to foreign key constraints
    await service.auditLog.deleteMany();
    await service.userSession.deleteMany();
    await service.passwordReset.deleteMany();
    await service.user.deleteMany();
  });

  describe('Database Connection', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should connect to database successfully', async () => {
      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('User Model Validations', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedPassword123',
        role: 'USER' as const,
        status: 'ACTIVE' as const,
      };

      const user = await service.user.create({
        data: userData,
      });

      expect(user).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.name).toBe(userData.name);
      expect(user.role).toBe(userData.role);
      expect(user.status).toBe(userData.status);
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should enforce unique email constraint', async () => {
      const userData = {
        email: 'duplicate@example.com',
        name: 'Test User 1',
        password: 'hashedPassword123',
      };

      await service.user.create({ data: userData });

      await expect(
        service.user.create({
          data: {
            ...userData,
            name: 'Test User 2',
          },
        }),
      ).rejects.toThrow();
    });

    it('should set default values correctly', async () => {
      const userData = {
        email: 'defaults@example.com',
        name: 'Default User',
        password: 'hashedPassword123',
      };

      const user = await service.user.create({
        data: userData,
      });

      expect(user.role).toBe('USER');
      expect(user.status).toBe('ACTIVE');
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should handle optional fields correctly', async () => {
      const userData = {
        email: 'optional@example.com',
        name: 'Optional User',
        password: 'hashedPassword123',
        phone: '+1234567890',
        address: '123 Test Street',
        profilePicture: 'profile.jpg',
      };

      const user = await service.user.create({
        data: userData,
      });

      expect(user.phone).toBe(userData.phone);
      expect(user.address).toBe(userData.address);
      expect(user.profilePicture).toBe(userData.profilePicture);
    });
  });

  describe('AuditLog Model Validations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await service.user.create({
        data: {
          email: 'audit@example.com',
          name: 'Audit User',
          password: 'hashedPassword123',
        },
      });
    });

    it('should create audit log with valid data', async () => {
      const auditData = {
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: testUser.id,
        userId: testUser.id,
        oldValues: null,
        newValues: { name: 'New Name' },
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      };

      const auditLog = await service.auditLog.create({
        data: auditData,
      });

      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe(auditData.action);
      expect(auditLog.entityType).toBe(auditData.entityType);
      expect(auditLog.entityId).toBe(auditData.entityId);
      expect(auditLog.userId).toBe(auditData.userId);
      expect(auditLog.ipAddress).toBe(auditData.ipAddress);
      expect(auditLog.userAgent).toBe(auditData.userAgent);
      expect(auditLog.createdAt).toBeDefined();
    });

    it('should handle JSON fields correctly', async () => {
      const oldValues = { name: 'Old Name', email: 'old@example.com' };
      const newValues = { name: 'New Name', email: 'new@example.com' };

      const auditLog = await service.auditLog.create({
        data: {
          action: 'UPDATE_USER',
          entityType: 'User',
          entityId: testUser.id,
          oldValues,
          newValues,
        },
      });

      expect(auditLog.oldValues).toEqual(oldValues);
      expect(auditLog.newValues).toEqual(newValues);
    });

    it('should create audit log without user relation', async () => {
      const auditLog = await service.auditLog.create({
        data: {
          action: 'SYSTEM_ACTION',
          entityType: 'System',
          entityId: 'system-1',
          adminId: testUser.id,
        },
      });

      expect(auditLog.userId).toBeNull();
      expect(auditLog.adminId).toBe(testUser.id);
    });
  });

  describe('UserSession Model Validations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await service.user.create({
        data: {
          email: 'session@example.com',
          name: 'Session User',
          password: 'hashedPassword123',
        },
      });
    });

    it('should create user session with valid data', async () => {
      const sessionData = {
        userId: testUser.id,
        token: 'unique-jwt-token-123',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };

      const session = await service.userSession.create({
        data: sessionData,
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe(sessionData.userId);
      expect(session.token).toBe(sessionData.token);
      expect(session.expiresAt).toEqual(sessionData.expiresAt);
      expect(session.isActive).toBe(true); // default value
      expect(session.createdAt).toBeDefined();
    });

    it('should enforce unique token constraint', async () => {
      const token = 'duplicate-token-123';
      const sessionData = {
        userId: testUser.id,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      };

      await service.userSession.create({ data: sessionData });

      // Create another user to test unique token constraint
      const anotherUser = await service.user.create({
        data: {
          email: 'another@example.com',
          name: 'Another User',
          password: 'hashedPassword123',
        },
      });

      await expect(
        service.userSession.create({
          data: {
            ...sessionData,
            userId: anotherUser.id,
          },
        }),
      ).rejects.toThrow();
    });

    it('should cascade delete sessions when user is deleted', async () => {
      const session = await service.userSession.create({
        data: {
          userId: testUser.id,
          token: 'cascade-test-token',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      expect(session).toBeDefined();

      await service.user.delete({
        where: { id: testUser.id },
      });

      const deletedSession = await service.userSession.findUnique({
        where: { id: session.id },
      });

      expect(deletedSession).toBeNull();
    });
  });

  describe('PasswordReset Model Validations', () => {
    it('should create password reset with valid data', async () => {
      const resetData = {
        email: 'reset@example.com',
        token: 'reset-token-123',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };

      const passwordReset = await service.passwordReset.create({
        data: resetData,
      });

      expect(passwordReset).toBeDefined();
      expect(passwordReset.email).toBe(resetData.email);
      expect(passwordReset.token).toBe(resetData.token);
      expect(passwordReset.expiresAt).toEqual(resetData.expiresAt);
      expect(passwordReset.used).toBe(false); // default value
      expect(passwordReset.createdAt).toBeDefined();
    });

    it('should enforce unique token constraint', async () => {
      const token = 'duplicate-reset-token';
      const resetData = {
        email: 'reset1@example.com',
        token,
        expiresAt: new Date(Date.now() + 3600000),
      };

      await service.passwordReset.create({ data: resetData });

      await expect(
        service.passwordReset.create({
          data: {
            ...resetData,
            email: 'reset2@example.com',
          },
        }),
      ).rejects.toThrow();
    });

    it('should allow multiple resets for same email with different tokens', async () => {
      const email = 'multiple@example.com';
      const expiresAt = new Date(Date.now() + 3600000);

      const reset1 = await service.passwordReset.create({
        data: {
          email,
          token: 'token-1',
          expiresAt,
        },
      });

      const reset2 = await service.passwordReset.create({
        data: {
          email,
          token: 'token-2',
          expiresAt,
        },
      });

      expect(reset1.email).toBe(email);
      expect(reset2.email).toBe(email);
      expect(reset1.token).not.toBe(reset2.token);
    });
  });

  describe('Cleanup Operations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await service.user.create({
        data: {
          email: 'cleanup@example.com',
          name: 'Cleanup User',
          password: 'hashedPassword123',
        },
      });
    });

    it('should cleanup expired sessions', async () => {
      // Create expired session
      const expiredSession = await service.userSession.create({
        data: {
          userId: testUser.id,
          token: 'expired-token',
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      });

      // Create active session
      const activeSession = await service.userSession.create({
        data: {
          userId: testUser.id,
          token: 'active-token',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });

      const cleanedCount = await service.cleanupExpiredSessions();
      expect(cleanedCount).toBe(1);

      const remainingSessions = await service.userSession.findMany({
        where: {
          userId: testUser.id,
        },
      });
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].id).toBe(activeSession.id);
    });

    it('should cleanup expired password resets', async () => {
      // Create expired reset
      await service.passwordReset.create({
        data: {
          email: 'expired@example.com',
          token: 'expired-reset-token',
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      });

      // Create active reset
      const activeReset = await service.passwordReset.create({
        data: {
          email: 'active@example.com',
          token: 'active-reset-token',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });

      const cleanedCount = await service.cleanupExpiredPasswordResets();
      expect(cleanedCount).toBe(1);

      const remainingResets = await service.passwordReset.findMany();
      expect(remainingResets).toHaveLength(1);
      expect(remainingResets[0].id).toBe(activeReset.id);
    });
  });

  describe('Database Indexes Performance', () => {
    beforeEach(async () => {
      // Create test data for performance testing
      const users = [];
      for (let i = 0; i < 10; i++) {
        users.push({
          email: `user${i}@example.com`,
          name: `User ${i}`,
          password: 'hashedPassword123',
          role: i % 3 === 0 ? 'ADMIN' : i % 3 === 1 ? 'MANAGER' : 'USER',
          status: i % 4 === 0 ? 'INACTIVE' : 'ACTIVE',
        });
      }

      await service.user.createMany({
        data: users,
      });
    });

    it('should efficiently query users by email', async () => {
      const startTime = Date.now();
      const user = await service.user.findUnique({
        where: { email: 'user5@example.com' },
      });
      const endTime = Date.now();

      expect(user).toBeDefined();
      expect(user?.email).toBe('user5@example.com');
      // Query should be fast due to unique index
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should efficiently query users by role and status', async () => {
      const startTime = Date.now();
      const users = await service.user.findMany({
        where: {
          role: 'USER',
          status: 'ACTIVE',
        },
      });
      const endTime = Date.now();

      expect(users.length).toBeGreaterThan(0);
      // Query should be fast due to composite index
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should efficiently search users by name', async () => {
      const startTime = Date.now();
      const users = await service.user.findMany({
        where: {
          name: {
            contains: 'User',
            mode: 'insensitive',
          },
        },
      });
      const endTime = Date.now();

      expect(users.length).toBeGreaterThanOrEqual(10);
      // Query should be reasonably fast due to name index
      expect(endTime - startTime).toBeLessThan(200);
    });
  });
});
