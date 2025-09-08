import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('Database Connectivity Integration Tests', () => {
  let service: PrismaService;
  let app: INestApplication;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    service = module.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    await service.$disconnect();
    await app.close();
    await module.close();
  });

  describe('PrismaService Connection Management', () => {
    it('should be defined and connected', () => {
      expect(service).toBeDefined();
      expect(service.getConnectionStatus().isConnected).toBe(true);
    });

    it('should perform basic health check successfully', async () => {
      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should perform detailed health check successfully', async () => {
      const healthCheck = await service.detailedHealthCheck();

      expect(healthCheck).toBeDefined();
      expect(healthCheck.isHealthy).toBe(true);
      expect(healthCheck.connectionStatus).toBe('connected');
      expect(healthCheck.responseTime).toBeGreaterThan(0);
      expect(healthCheck.error).toBeUndefined();
    });

    it('should test all database operations successfully', async () => {
      const operationsTest = await service.testDatabaseOperations();

      expect(operationsTest).toBeDefined();
      expect(operationsTest.canRead).toBe(true);
      expect(operationsTest.canWrite).toBe(true);
      expect(operationsTest.canDelete).toBe(true);
      expect(operationsTest.errors).toHaveLength(0);
    });

    it('should return correct connection status', () => {
      const status = service.getConnectionStatus();

      expect(status).toBeDefined();
      expect(status.isConnected).toBe(true);
      expect(status.retries).toBe(0);
      expect(status.maxRetries).toBe(5);
    });
  });

  describe('Database Schema Validation', () => {
    it('should have all required models available', () => {
      expect(service.user).toBeDefined();
      expect(service.auditLog).toBeDefined();
      expect(service.userSession).toBeDefined();
      expect(service.passwordReset).toBeDefined();
    });

    it('should be able to perform CRUD operations on User model', async () => {
      // Create
      const user = await service.user.create({
        data: {
          email: 'crud-test@example.com',
          name: 'CRUD Test User',
          password: 'hashedPassword123',
        },
      });
      expect(user).toBeDefined();
      expect(user.email).toBe('crud-test@example.com');

      // Read
      const foundUser = await service.user.findUnique({
        where: { id: user.id },
      });
      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(user.id);

      // Update
      const updatedUser = await service.user.update({
        where: { id: user.id },
        data: { name: 'Updated CRUD User' },
      });
      expect(updatedUser.name).toBe('Updated CRUD User');

      // Delete
      await service.user.delete({
        where: { id: user.id },
      });

      const deletedUser = await service.user.findUnique({
        where: { id: user.id },
      });
      expect(deletedUser).toBeNull();
    });

    it('should handle database constraints properly', async () => {
      const userData = {
        email: 'constraint-test@example.com',
        name: 'Constraint Test User',
        password: 'hashedPassword123',
      };

      // Create first user
      const user1 = await service.user.create({ data: userData });
      expect(user1).toBeDefined();

      // Try to create second user with same email (should fail)
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
  });

  describe('Database Performance', () => {
    beforeEach(async () => {
      // Clean up any existing test data
      await service.user.deleteMany({
        where: {
          email: {
            contains: 'performance-test',
          },
        },
      });
    });

    it('should perform indexed queries efficiently', async () => {
      // Create test data
      const users = [];
      for (let i = 0; i < 10; i++) {
        users.push({
          email: `performance-test-${i}@example.com`,
          name: `Performance User ${i}`,
          password: 'hashedPassword123',
          role: i % 3 === 0 ? 'ADMIN' : i % 3 === 1 ? 'MANAGER' : 'USER',
        });
      }

      await service.user.createMany({ data: users });

      // Test email index performance
      const startTime = Date.now();
      const userByEmail = await service.user.findUnique({
        where: { email: 'performance-test-5@example.com' },
      });
      const emailQueryTime = Date.now() - startTime;

      expect(userByEmail).toBeDefined();
      expect(emailQueryTime).toBeLessThan(100); // Should be fast due to unique index

      // Test role index performance
      const roleStartTime = Date.now();
      const adminUsers = await service.user.findMany({
        where: { role: 'ADMIN' },
      });
      const roleQueryTime = Date.now() - roleStartTime;

      expect(adminUsers.length).toBeGreaterThan(0);
      expect(roleQueryTime).toBeLessThan(100); // Should be fast due to role index

      // Cleanup
      await service.user.deleteMany({
        where: {
          email: {
            contains: 'performance-test',
          },
        },
      });
    });

    it('should handle concurrent operations', async () => {
      const concurrentOperations = [];

      // Create multiple concurrent read operations
      for (let i = 0; i < 5; i++) {
        concurrentOperations.push(
          service.user.findMany({
            take: 1,
          }),
        );
      }

      // Execute all operations concurrently
      const results = await Promise.all(concurrentOperations);

      // All operations should complete successfully
      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('Health Endpoints Integration', () => {
    it('should return healthy status from /health endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeGreaterThan(0);
      expect(response.body.connection).toBeDefined();
      expect(response.body.connection.isConnected).toBe(true);
    });

    it('should return database health from /health/database endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/database')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
      expect(response.body.responseTime).toBeGreaterThan(0);
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return detailed database health from /health/database/detailed endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/database/detailed')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.isHealthy).toBe(true);
      expect(response.body.connectionStatus).toBe('connected');
      expect(response.body.responseTime).toBeGreaterThan(0);
      expect(response.body.connection).toBeDefined();
      expect(response.body.connection.isConnected).toBe(true);
      expect(response.body.timestamp).toBeDefined();
    });

    it('should test database operations from /health/database/operations endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/database/operations')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe('ok');
      expect(response.body.message).toBe(
        'All database operations working correctly',
      );
      expect(response.body.operations).toBeDefined();
      expect(response.body.operations.canRead).toBe(true);
      expect(response.body.operations.canWrite).toBe(true);
      expect(response.body.operations.canDelete).toBe(true);
      expect(response.body.operations.errors).toHaveLength(0);
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database query errors gracefully', async () => {
      // Test with invalid query that should fail gracefully
      try {
        await service.$queryRaw`SELECT * FROM non_existent_table`;
      } catch (error) {
        expect(error).toBeDefined();
        // Service should still be functional after error
        const healthCheck = await service.healthCheck();
        expect(healthCheck).toBe(true);
      }
    });

    it('should handle constraint violations gracefully', async () => {
      const userData = {
        email: 'error-test@example.com',
        name: 'Error Test User',
        password: 'hashedPassword123',
      };

      // Create first user
      const user1 = await service.user.create({ data: userData });

      // Try to create duplicate user
      try {
        await service.user.create({ data: userData });
      } catch (error) {
        expect(error).toBeDefined();
        // Service should still be functional after error
        const healthCheck = await service.healthCheck();
        expect(healthCheck).toBe(true);
      }

      // Cleanup
      await service.user.delete({ where: { id: user1.id } });
    });
  });

  describe('Cleanup Operations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await service.user.create({
        data: {
          email: 'cleanup-test@example.com',
          name: 'Cleanup Test User',
          password: 'hashedPassword123',
        },
      });
    });

    afterEach(async () => {
      // Clean up test user if it still exists
      try {
        await service.user.delete({
          where: { id: testUser.id },
        });
      } catch (error) {
        // User might already be deleted, ignore error
      }
    });

    it('should cleanup expired sessions successfully', async () => {
      // Create expired session
      await service.userSession.create({
        data: {
          userId: testUser.id,
          token: 'expired-cleanup-token',
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      });

      // Create active session
      await service.userSession.create({
        data: {
          userId: testUser.id,
          token: 'active-cleanup-token',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });

      const cleanedCount = await service.cleanupExpiredSessions();
      expect(cleanedCount).toBeGreaterThanOrEqual(1);

      // Verify only active session remains
      const remainingSessions = await service.userSession.findMany({
        where: { userId: testUser.id },
      });
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].token).toBe('active-cleanup-token');

      // Cleanup remaining session
      await service.userSession.deleteMany({
        where: { userId: testUser.id },
      });
    });

    it('should cleanup expired password resets successfully', async () => {
      // Create expired reset
      await service.passwordReset.create({
        data: {
          email: 'expired-reset@example.com',
          token: 'expired-reset-token',
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      });

      // Create active reset
      await service.passwordReset.create({
        data: {
          email: 'active-reset@example.com',
          token: 'active-reset-token',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });

      const cleanedCount = await service.cleanupExpiredPasswordResets();
      expect(cleanedCount).toBeGreaterThanOrEqual(1);

      // Verify only active reset remains
      const remainingResets = await service.passwordReset.findMany({
        where: {
          email: {
            in: ['expired-reset@example.com', 'active-reset@example.com'],
          },
        },
      });
      expect(remainingResets).toHaveLength(1);
      expect(remainingResets[0].token).toBe('active-reset-token');

      // Cleanup remaining reset
      await service.passwordReset.deleteMany({
        where: {
          email: {
            in: ['expired-reset@example.com', 'active-reset@example.com'],
          },
        },
      });
    });
  });
});
