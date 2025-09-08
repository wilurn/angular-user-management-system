import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ConfigModule } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';

describe('Prisma Models Validation', () => {
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

  describe('User Model', () => {
    describe('Required Fields Validation', () => {
      it('should require email field', async () => {
        await expect(
          service.user.create({
            data: {
              name: 'Test User',
              password: 'hashedPassword123',
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require name field', async () => {
        await expect(
          service.user.create({
            data: {
              email: 'test@example.com',
              password: 'hashedPassword123',
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require password field', async () => {
        await expect(
          service.user.create({
            data: {
              email: 'test@example.com',
              name: 'Test User',
            } as any,
          }),
        ).rejects.toThrow();
      });
    });

    describe('Enum Validation', () => {
      it('should accept valid Role enum values', async () => {
        const roles: Role[] = ['ADMIN', 'MANAGER', 'USER'];
        
        for (const role of roles) {
          const user = await service.user.create({
            data: {
              email: `${role.toLowerCase()}@example.com`,
              name: `${role} User`,
              password: 'hashedPassword123',
              role,
            },
          });
          
          expect(user.role).toBe(role);
        }
      });

      it('should accept valid UserStatus enum values', async () => {
        const statuses: UserStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
        
        for (const status of statuses) {
          const user = await service.user.create({
            data: {
              email: `${status.toLowerCase()}@example.com`,
              name: `${status} User`,
              password: 'hashedPassword123',
              status,
            },
          });
          
          expect(user.status).toBe(status);
        }
      });
    });

    describe('Unique Constraints', () => {
      it('should enforce unique email constraint', async () => {
        const email = 'unique@example.com';
        
        await service.user.create({
          data: {
            email,
            name: 'First User',
            password: 'hashedPassword123',
          },
        });

        await expect(
          service.user.create({
            data: {
              email,
              name: 'Second User',
              password: 'hashedPassword123',
            },
          }),
        ).rejects.toThrow();
      });
    });

    describe('Default Values', () => {
      it('should set default role to USER', async () => {
        const user = await service.user.create({
          data: {
            email: 'default@example.com',
            name: 'Default User',
            password: 'hashedPassword123',
          },
        });

        expect(user.role).toBe('USER');
      });

      it('should set default status to ACTIVE', async () => {
        const user = await service.user.create({
          data: {
            email: 'default@example.com',
            name: 'Default User',
            password: 'hashedPassword123',
          },
        });

        expect(user.status).toBe('ACTIVE');
      });

      it('should set createdAt and updatedAt automatically', async () => {
        const beforeCreate = new Date();
        
        const user = await service.user.create({
          data: {
            email: 'timestamps@example.com',
            name: 'Timestamp User',
            password: 'hashedPassword123',
          },
        });

        const afterCreate = new Date();

        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);
        expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
        expect(user.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      });
    });

    describe('Optional Fields', () => {
      it('should handle null phone number', async () => {
        const user = await service.user.create({
          data: {
            email: 'nophone@example.com',
            name: 'No Phone User',
            password: 'hashedPassword123',
            phone: null,
          },
        });

        expect(user.phone).toBeNull();
      });

      it('should handle null profile picture', async () => {
        const user = await service.user.create({
          data: {
            email: 'nopic@example.com',
            name: 'No Picture User',
            password: 'hashedPassword123',
            profilePicture: null,
          },
        });

        expect(user.profilePicture).toBeNull();
      });

      it('should handle null address', async () => {
        const user = await service.user.create({
          data: {
            email: 'noaddress@example.com',
            name: 'No Address User',
            password: 'hashedPassword123',
            address: null,
          },
        });

        expect(user.address).toBeNull();
      });

      it('should handle null lastLoginAt', async () => {
        const user = await service.user.create({
          data: {
            email: 'nologin@example.com',
            name: 'No Login User',
            password: 'hashedPassword123',
          },
        });

        expect(user.lastLoginAt).toBeNull();
      });
    });
  });

  describe('AuditLog Model', () => {
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

    describe('Required Fields Validation', () => {
      it('should require action field', async () => {
        await expect(
          service.auditLog.create({
            data: {
              entityType: 'User',
              entityId: testUser.id,
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require entityType field', async () => {
        await expect(
          service.auditLog.create({
            data: {
              action: 'CREATE',
              entityId: testUser.id,
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require entityId field', async () => {
        await expect(
          service.auditLog.create({
            data: {
              action: 'CREATE',
              entityType: 'User',
            } as any,
          }),
        ).rejects.toThrow();
      });
    });

    describe('JSON Fields', () => {
      it('should handle complex JSON in oldValues', async () => {
        const oldValues = {
          name: 'Old Name',
          email: 'old@example.com',
          nested: {
            property: 'value',
            array: [1, 2, 3],
          },
        };

        const auditLog = await service.auditLog.create({
          data: {
            action: 'UPDATE',
            entityType: 'User',
            entityId: testUser.id,
            oldValues,
          },
        });

        expect(auditLog.oldValues).toEqual(oldValues);
      });

      it('should handle complex JSON in newValues', async () => {
        const newValues = {
          name: 'New Name',
          email: 'new@example.com',
          metadata: {
            source: 'api',
            timestamp: new Date().toISOString(),
          },
        };

        const auditLog = await service.auditLog.create({
          data: {
            action: 'UPDATE',
            entityType: 'User',
            entityId: testUser.id,
            newValues,
          },
        });

        expect(auditLog.newValues).toEqual(newValues);
      });

      it('should handle null JSON values', async () => {
        const auditLog = await service.auditLog.create({
          data: {
            action: 'DELETE',
            entityType: 'User',
            entityId: testUser.id,
            oldValues: null,
            newValues: null,
          },
        });

        expect(auditLog.oldValues).toBeNull();
        expect(auditLog.newValues).toBeNull();
      });
    });

    describe('Relations', () => {
      it('should create audit log with user relation', async () => {
        const auditLog = await service.auditLog.create({
          data: {
            action: 'LOGIN',
            entityType: 'User',
            entityId: testUser.id,
            userId: testUser.id,
          },
          include: {
            user: true,
          },
        });

        expect(auditLog.user).toBeDefined();
        expect(auditLog.user?.id).toBe(testUser.id);
        expect(auditLog.user?.email).toBe(testUser.email);
      });

      it('should create audit log without user relation', async () => {
        const auditLog = await service.auditLog.create({
          data: {
            action: 'SYSTEM_MAINTENANCE',
            entityType: 'System',
            entityId: 'system-1',
            adminId: testUser.id,
          },
        });

        expect(auditLog.userId).toBeNull();
        expect(auditLog.adminId).toBe(testUser.id);
      });
    });
  });

  describe('UserSession Model', () => {
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

    describe('Required Fields Validation', () => {
      it('should require userId field', async () => {
        await expect(
          service.userSession.create({
            data: {
              token: 'test-token',
              expiresAt: new Date(),
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require token field', async () => {
        await expect(
          service.userSession.create({
            data: {
              userId: testUser.id,
              expiresAt: new Date(),
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require expiresAt field', async () => {
        await expect(
          service.userSession.create({
            data: {
              userId: testUser.id,
              token: 'test-token',
            } as any,
          }),
        ).rejects.toThrow();
      });
    });

    describe('Unique Constraints', () => {
      it('should enforce unique token constraint', async () => {
        const token = 'unique-token-123';
        
        await service.userSession.create({
          data: {
            userId: testUser.id,
            token,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        await expect(
          service.userSession.create({
            data: {
              userId: testUser.id,
              token,
              expiresAt: new Date(Date.now() + 3600000),
            },
          }),
        ).rejects.toThrow();
      });
    });

    describe('Default Values', () => {
      it('should set default isActive to true', async () => {
        const session = await service.userSession.create({
          data: {
            userId: testUser.id,
            token: 'default-active-token',
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        expect(session.isActive).toBe(true);
      });

      it('should set createdAt automatically', async () => {
        const beforeCreate = new Date();
        
        const session = await service.userSession.create({
          data: {
            userId: testUser.id,
            token: 'timestamp-token',
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        const afterCreate = new Date();

        expect(session.createdAt).toBeInstanceOf(Date);
        expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
        expect(session.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      });
    });

    describe('Cascade Delete', () => {
      it('should delete sessions when user is deleted', async () => {
        const session = await service.userSession.create({
          data: {
            userId: testUser.id,
            token: 'cascade-token',
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
  });

  describe('PasswordReset Model', () => {
    describe('Required Fields Validation', () => {
      it('should require email field', async () => {
        await expect(
          service.passwordReset.create({
            data: {
              token: 'reset-token',
              expiresAt: new Date(),
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require token field', async () => {
        await expect(
          service.passwordReset.create({
            data: {
              email: 'reset@example.com',
              expiresAt: new Date(),
            } as any,
          }),
        ).rejects.toThrow();
      });

      it('should require expiresAt field', async () => {
        await expect(
          service.passwordReset.create({
            data: {
              email: 'reset@example.com',
              token: 'reset-token',
            } as any,
          }),
        ).rejects.toThrow();
      });
    });

    describe('Unique Constraints', () => {
      it('should enforce unique token constraint', async () => {
        const token = 'unique-reset-token';
        
        await service.passwordReset.create({
          data: {
            email: 'reset1@example.com',
            token,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        await expect(
          service.passwordReset.create({
            data: {
              email: 'reset2@example.com',
              token,
              expiresAt: new Date(Date.now() + 3600000),
            },
          }),
        ).rejects.toThrow();
      });
    });

    describe('Default Values', () => {
      it('should set default used to false', async () => {
        const passwordReset = await service.passwordReset.create({
          data: {
            email: 'default@example.com',
            token: 'default-token',
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        expect(passwordReset.used).toBe(false);
      });

      it('should set createdAt automatically', async () => {
        const beforeCreate = new Date();
        
        const passwordReset = await service.passwordReset.create({
          data: {
            email: 'timestamp@example.com',
            token: 'timestamp-token',
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        const afterCreate = new Date();

        expect(passwordReset.createdAt).toBeInstanceOf(Date);
        expect(passwordReset.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
        expect(passwordReset.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      });
    });

    describe('Multiple Resets', () => {
      it('should allow multiple password resets for same email with different tokens', async () => {
        const email = 'multiple@example.com';
        
        const reset1 = await service.passwordReset.create({
          data: {
            email,
            token: 'token-1',
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        const reset2 = await service.passwordReset.create({
          data: {
            email,
            token: 'token-2',
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        expect(reset1.email).toBe(email);
        expect(reset2.email).toBe(email);
        expect(reset1.token).not.toBe(reset2.token);
      });
    });
  });
});