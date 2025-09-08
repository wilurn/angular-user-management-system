import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard, ROLES_KEY } from './roles.guard';
import { Role, UserStatus } from '@prisma/client';
import { UserResponseDto } from '../../users/dto/user-response.dto';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockUser: UserResponseDto = {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockExecutionContext = (user?: UserResponseDto, requiredRoles?: Role[]) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    if (requiredRoles) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);
    }

    return context;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true when no roles are required', () => {
      const context = mockExecutionContext(mockUser);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      const context = mockExecutionContext(undefined, [Role.ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('User not authenticated'),
      );
    });

    it('should throw ForbiddenException when user account is not active', () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      const context = mockExecutionContext(inactiveUser, [Role.USER]);

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Account is not active'),
      );
    });

    it('should throw ForbiddenException when user account is suspended', () => {
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      const context = mockExecutionContext(suspendedUser, [Role.USER]);

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Account is not active'),
      );
    });

    it('should return true when user has required role', () => {
      const context = mockExecutionContext(mockUser, [Role.USER]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return true when user has one of multiple required roles', () => {
      const adminUser = { ...mockUser, role: Role.ADMIN };
      const context = mockExecutionContext(adminUser, [Role.ADMIN, Role.MANAGER]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
      const context = mockExecutionContext(mockUser, [Role.ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Access denied. Required roles: ADMIN'),
      );
    });

    it('should throw ForbiddenException when user does not have any of multiple required roles', () => {
      const context = mockExecutionContext(mockUser, [Role.ADMIN, Role.MANAGER]);

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Access denied. Required roles: ADMIN, MANAGER'),
      );
    });

    it('should handle MANAGER role correctly', () => {
      const managerUser = { ...mockUser, role: Role.MANAGER };
      const context = mockExecutionContext(managerUser, [Role.MANAGER]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should handle ADMIN role correctly', () => {
      const adminUser = { ...mockUser, role: Role.ADMIN };
      const context = mockExecutionContext(adminUser, [Role.ADMIN]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});