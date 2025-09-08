import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ConfigModule } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';

describe('Database Schema Integration Tests', () => {
  let service: PrismaService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
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

  describe('Complete User Workflow', () => {
    let testUserId: string;

    it('should create a complete user record with all relationships', async () => {
      // Create user
      const user = await service.user.create({
        data: {
          email: 'integration@test.com',
          name: 'Integration Test User',
          password: 'hashedPassword123',
          role: Role.USER,
          status: UserStatus.ACTIVE,
          phone: '+1234567890',
          address: '123 Test Street',
        },
      });

      testUserId = user.id;
      expect(user).toBeDefined();
      expect(user.email).toBe('integration@test.com');

      // Create user session
      const session = await service.userSession.create({
        data: {
          userId: user.id,
          token: 'integration-test-token',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe(user.id);

      // Create audit log
      const auditLog = await service.auditLog.create({
        data: {
          action: 'USER_LOGIN',
          entityType: 'User',
          entityId: user.id,
          userId: user.id,
          newValues: { loginTime: new Date().toISOString() },
          ipAddress: '127.0.0.1',
        },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog.userId).toBe(user.id);

      // Create password reset
      const passwordReset = await service.passwordReset.create({
        data: {
          email: user.email,
          token: 'integration-reset-token',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      expect(passwordReset).toBeDefined();
      expect(passwordReset.email).toBe(user.email);
    });

    it('should query user with all relationships', async () => {
      const userWithRelations = await service.user.findUnique({
        where: { id: testUserId },
        include: {
          auditLogs: true,
          sessions: true,
        },
      });

      expect(userWithRelations).toBeDefined();
      expect(userWithRelations?.auditLogs).toBeDefined();
      expect(userWithRelations?.sessions).toBeDefined();
      expect(userWithRelations?.auditLogs.length).toBeGreaterThan(0);
      expect(userWithRelations?.sessions.length).toBeGreaterThan(0);
    });

    it('should efficiently search using indexes', async () => {
      // Test email index
      const userByEmail = await service.user.findUnique({
        where: { email: 'integration@test.com' },
      });
      expect(userByEmail).toBeDefined();

      // Test role and status composite index
      const usersByRoleStatus = await service.user.findMany({
        where: {
          role: Role.USER,
          status: UserStatus.ACTIVE,
        },
      });
      expect(usersByRoleStatus.length).toBeGreaterThan(0);

      // Test audit log indexes
      const auditLogsByAction = await service.auditLog.findMany({
        where: { action: 'USER_LOGIN' },
      });
      expect(auditLogsByAction.length).toBeGreaterThan(0);
    });

    it('should cleanup test data', async () => {
      // Clean up in proper order due to foreign key constraints
      await service.auditLog.deleteMany({
        where: { userId: testUserId },
      });

      await service.userSession.deleteMany({
        where: { userId: testUserId },
      });

      await service.passwordReset.deleteMany({
        where: { email: 'integration@test.com' },
      });

      await service.user.delete({
        where: { id: testUserId },
      });

      // Verify cleanup
      const deletedUser = await service.user.findUnique({
        where: { id: testUserId },
      });
      expect(deletedUser).toBeNull();
    });
  });

  describe('Database Constraints and Validations', () => {
    it('should enforce unique email constraint', async () => {
      const userData = {
        email: 'unique-test@example.com',
        name: 'Unique Test User',
        password: 'hashedPassword123',
      };

      // Create first user
      const user1 = await service.user.create({ data: userData });
      expect(user1).toBeDefined();

      // Try to create second user with same email
      await expect(
        service.user.create({
          data: {
            ...userData,
            name: 'Another User',
          },
        }),
      ).rejects.toThrow();

      // Cleanup
      await service.user.delete({ where: { id: user1.id } });
    });

    it('should enforce foreign key constraints', async () => {
      // Try to create session with non-existent user
      await expect(
        service.userSession.create({
          data: {
            userId: 'non-existent-user-id',
            token: 'test-token',
            expiresAt: new Date(Date.now() + 3600000),
          },
        }),
      ).rejects.toThrow();

      // Try to create audit log with non-existent user
      await expect(
        service.auditLog.create({
          data: {
            action: 'TEST_ACTION',
            entityType: 'User',
            entityId: 'test-entity-id',
            userId: 'non-existent-user-id',
          },
        }),
      ).rejects.toThrow();
    });

    it('should enforce unique token constraints', async () => {
      const token = 'unique-test-token';

      // Create user for session
      const user = await service.user.create({
        data: {
          email: 'token-test@example.com',
          name: 'Token Test User',
          password: 'hashedPassword123',
        },
      });

      // Create first session
      const session1 = await service.userSession.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      // Try to create second session with same token
      await expect(
        service.userSession.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + 3600000),
          },
        }),
      ).rejects.toThrow();

      // Cleanup
      await service.userSession.delete({ where: { id: session1.id } });
      await service.user.delete({ where: { id: user.id } });
    });
  });

  describe('Performance with Indexes', () => {
    it('should perform well with indexed queries', async () => {
      const startTime = Date.now();

      // Query using indexed fields
      await Promise.all([
        service.user.findMany({
          where: { role: Role.ADMIN },
          take: 10,
        }),
        service.user.findMany({
          where: { status: UserStatus.ACTIVE },
          take: 10,
        }),
        service.auditLog.findMany({
          where: { action: 'USER_CREATED' },
          take: 10,
        }),
        service.userSession.findMany({
          where: { isActive: true },
          take: 10,
        }),
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // All queries should complete reasonably fast
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });
  });
});