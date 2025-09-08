import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Roles } from './roles.decorator';
import { ROLES_KEY } from '../guards/roles.guard';

describe('Roles Decorator', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('should set metadata with single role', () => {
    class TestController {
      @Roles(Role.ADMIN)
      testMethod() {}
    }

    const roles = reflector.get<Role[]>(ROLES_KEY, TestController.prototype.testMethod);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('should set metadata with multiple roles', () => {
    class TestController {
      @Roles(Role.ADMIN, Role.MANAGER)
      testMethod() {}
    }

    const roles = reflector.get<Role[]>(ROLES_KEY, TestController.prototype.testMethod);
    expect(roles).toEqual([Role.ADMIN, Role.MANAGER]);
  });

  it('should set metadata with all roles', () => {
    class TestController {
      @Roles(Role.ADMIN, Role.MANAGER, Role.USER)
      testMethod() {}
    }

    const roles = reflector.get<Role[]>(ROLES_KEY, TestController.prototype.testMethod);
    expect(roles).toEqual([Role.ADMIN, Role.MANAGER, Role.USER]);
  });

  it('should work on class level', () => {
    @Roles(Role.ADMIN)
    class TestController {
      testMethod() {}
    }

    const roles = reflector.get<Role[]>(ROLES_KEY, TestController);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('should return undefined when no roles are set', () => {
    class TestController {
      testMethod() {}
    }

    const roles = reflector.get<Role[]>(ROLES_KEY, TestController.prototype.testMethod);
    expect(roles).toBeUndefined();
  });
});