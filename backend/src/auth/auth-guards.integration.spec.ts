import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Controller, Get, Post, UseGuards, MiddlewareConsumer, Module } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from './guards';
import { Roles, CurrentUser } from './decorators';
import { AuthMiddleware } from './middleware';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Role, UserStatus } from '@prisma/client';
import * as request from 'supertest';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock controller for testing
@Controller('test')
class TestController {
  @Get('public')
  publicEndpoint() {
    return { message: 'Public endpoint' };
  }

  @Get('protected')
  @UseGuards(JwtAuthGuard)
  protectedEndpoint(@CurrentUser() user: UserResponseDto) {
    return { message: 'Protected endpoint', user: user.email };
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminOnlyEndpoint(@CurrentUser() user: UserResponseDto) {
    return { message: 'Admin only endpoint', user: user.email };
  }

  @Get('admin-or-manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  adminOrManagerEndpoint(@CurrentUser() user: UserResponseDto) {
    return { message: 'Admin or Manager endpoint', user: user.email };
  }

  @Post('user-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  userOnlyEndpoint(@CurrentUser() user: UserResponseDto) {
    return { message: 'User only endpoint', user: user.email };
  }
}

// Test module
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: 'test-secret',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [TestController],
  providers: [
    JwtStrategy,
    {
      provide: UsersService,
      useValue: {
        findOne: jest.fn(),
      },
    },
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn().mockReturnValue('test-secret'),
      },
    },
  ],
})
class TestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}

describe('Auth Guards Integration', () => {
  let app: INestApplication;
  let usersService: UsersService;

  const mockUsers = {
    admin: {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin User',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserResponseDto,
    manager: {
      id: 'manager-1',
      email: 'manager@example.com',
      name: 'Manager User',
      role: Role.MANAGER,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserResponseDto,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Regular User',
      role: Role.USER,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserResponseDto,
    inactive: {
      id: 'inactive-1',
      email: 'inactive@example.com',
      name: 'Inactive User',
      role: Role.USER,
      status: UserStatus.INACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserResponseDto,
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    usersService = moduleFixture.get<UsersService>(UsersService);
    
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.clearAllMocks();
  });

  describe('Public endpoints', () => {
    it('should allow access to public endpoints without authentication', () => {
      return request(app.getHttpServer())
        .get('/test/public')
        .expect(200)
        .expect({ message: 'Public endpoint' });
    });
  });

  describe('Protected endpoints', () => {
    it('should deny access without JWT token', () => {
      return request(app.getHttpServer())
        .get('/test/protected')
        .expect(401);
    });

    it('should deny access with invalid JWT token', () => {
      return request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should allow access with valid JWT token for active user', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.user);

      // Create a valid JWT token for testing
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { sub: mockUsers.user.id, email: mockUsers.user.email, role: mockUsers.user.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      return request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect({ message: 'Protected endpoint', user: mockUsers.user.email });
    });

    it('should deny access for inactive user', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.inactive);

      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { sub: mockUsers.inactive.id, email: mockUsers.inactive.email, role: mockUsers.inactive.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      return request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('Role-based access control', () => {
    it('should allow admin access to admin-only endpoint', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.admin);

      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { sub: mockUsers.admin.id, email: mockUsers.admin.email, role: mockUsers.admin.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      return request(app.getHttpServer())
        .get('/test/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect({ message: 'Admin only endpoint', user: mockUsers.admin.email });
    });

    it('should deny regular user access to admin-only endpoint', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.user);

      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { sub: mockUsers.user.id, email: mockUsers.user.email, role: mockUsers.user.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      return request(app.getHttpServer())
        .get('/test/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should allow both admin and manager access to admin-or-manager endpoint', async () => {
      // Test admin access
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.admin);

      const jwt = require('jsonwebtoken');
      const adminToken = jwt.sign(
        { sub: mockUsers.admin.id, email: mockUsers.admin.email, role: mockUsers.admin.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      await request(app.getHttpServer())
        .get('/test/admin-or-manager')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect({ message: 'Admin or Manager endpoint', user: mockUsers.admin.email });

      // Test manager access
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.manager);

      const managerToken = jwt.sign(
        { sub: mockUsers.manager.id, email: mockUsers.manager.email, role: mockUsers.manager.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      return request(app.getHttpServer())
        .get('/test/admin-or-manager')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
        .expect({ message: 'Admin or Manager endpoint', user: mockUsers.manager.email });
    });

    it('should allow user access to user-only endpoint', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.user);

      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { sub: mockUsers.user.id, email: mockUsers.user.email, role: mockUsers.user.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      return request(app.getHttpServer())
        .post('/test/user-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(201)
        .expect({ message: 'User only endpoint', user: mockUsers.user.email });
    });

    it('should deny admin access to user-only endpoint', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUsers.admin);

      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { sub: mockUsers.admin.id, email: mockUsers.admin.email, role: mockUsers.admin.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      return request(app.getHttpServer())
        .post('/test/user-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});