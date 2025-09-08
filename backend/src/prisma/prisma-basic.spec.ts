import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ConfigModule } from '@nestjs/config';

describe('PrismaService Basic Tests', () => {
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

  describe('Database Connection', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should connect to database successfully', async () => {
      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Schema Validation', () => {
    it('should have all required models available', () => {
      expect(service.user).toBeDefined();
      expect(service.auditLog).toBeDefined();
      expect(service.userSession).toBeDefined();
      expect(service.passwordReset).toBeDefined();
    });

    it('should be able to query users table', async () => {
      const users = await service.user.findMany({
        take: 1,
      });
      expect(Array.isArray(users)).toBe(true);
    });

    it('should be able to query audit logs table', async () => {
      const auditLogs = await service.auditLog.findMany({
        take: 1,
      });
      expect(Array.isArray(auditLogs)).toBe(true);
    });

    it('should be able to query user sessions table', async () => {
      const sessions = await service.userSession.findMany({
        take: 1,
      });
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should be able to query password resets table', async () => {
      const resets = await service.passwordReset.findMany({
        take: 1,
      });
      expect(Array.isArray(resets)).toBe(true);
    });
  });

  describe('Index Performance', () => {
    it('should efficiently query users by email index', async () => {
      const startTime = Date.now();
      await service.user.findMany({
        where: {
          email: {
            contains: '@example.com',
          },
        },
        take: 5,
      });
      const endTime = Date.now();
      
      // Query should be reasonably fast
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should efficiently query users by role index', async () => {
      const startTime = Date.now();
      await service.user.findMany({
        where: {
          role: 'USER',
        },
        take: 5,
      });
      const endTime = Date.now();
      
      // Query should be reasonably fast
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should efficiently query audit logs by action index', async () => {
      const startTime = Date.now();
      await service.auditLog.findMany({
        where: {
          action: 'USER_CREATED',
        },
        take: 5,
      });
      const endTime = Date.now();
      
      // Query should be reasonably fast
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe('Cleanup Operations', () => {
    it('should be able to cleanup expired sessions', async () => {
      const cleanedCount = await service.cleanupExpiredSessions();
      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should be able to cleanup expired password resets', async () => {
      const cleanedCount = await service.cleanupExpiredPasswordResets();
      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Enum Validation', () => {
    it('should validate Role enum values', async () => {
      const users = await service.user.findMany({
        where: {
          role: {
            in: ['ADMIN', 'MANAGER', 'USER'],
          },
        },
        take: 5,
      });
      
      users.forEach(user => {
        expect(['ADMIN', 'MANAGER', 'USER']).toContain(user.role);
      });
    });

    it('should validate UserStatus enum values', async () => {
      const users = await service.user.findMany({
        where: {
          status: {
            in: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
          },
        },
        take: 5,
      });
      
      users.forEach(user => {
        expect(['ACTIVE', 'INACTIVE', 'SUSPENDED']).toContain(user.status);
      });
    });
  });
});