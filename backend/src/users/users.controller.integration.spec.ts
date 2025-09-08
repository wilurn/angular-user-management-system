import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { UsersModule } from './users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Role, UserStatus } from '@prisma/client';

describe('UsersController (Integration)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  // Test users for different roles
  const adminUser = {
    email: 'admin@example.com',
    name: 'Admin User',
    password: 'Password123!',
    role: Role.ADMIN,
  };

  const managerUser = {
    email: 'manager@example.com',
    name: 'Manager User',
    password: 'Password123!',
    role: Role.MANAGER,
  };

  const regularUser = {
    email: 'user@example.com',
    name: 'Regular User',
    password: 'Password123!',
    role: Role.USER,
  };

  const testUser = {
    email: 'test@example.com',
    name: 'Test User',
    phone: '+1234567890',
    password: 'Password123!',
    role: Role.USER,
    address: '123 Test St',
  };

  let adminToken: string;
  let managerToken: string;
  let userToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        ThrottlerModule.forRoot([{
          ttl: 60000,
          limit: 1000, // High limit for tests
        }]),
        PrismaModule,
        SecurityModule,
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    
    await app.init();
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await prismaService.user.deleteMany();

    // Create test users and get tokens
    const adminResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(adminUser);
    adminToken = adminResponse.body.accessToken;

    const managerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(managerUser);
    managerToken = managerResponse.body.accessToken;

    const userResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(regularUser);
    userToken = userResponse.body.accessToken;

    // Create a test user for operations
    const testUserResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testUser);
    testUserId = testUserResponse.body.id;
  });

  afterAll(async () => {
    // Clean up the database after all tests
    await prismaService.user.deleteMany();
    await prismaService.$disconnect();
    await app.close();
  });

  describe('POST /users', () => {
    const newUser = {
      email: 'newuser@example.com',
      name: 'New User',
      phone: '+19876543210',
      password: 'Password123!',
      role: Role.USER,
      address: '456 New St',
    };

    it('should create a new user as admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newUser)
        .expect(201);

      expect(response.body).toMatchObject({
        email: newUser.email,
        name: newUser.name,
        phone: newUser.phone,
        role: newUser.role,
        address: newUser.address,
        status: UserStatus.ACTIVE,
      });
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 403 when manager tries to create user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(newUser)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('should return 403 when regular user tries to create user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newUser)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(401);
    });

    it('should return 400 for invalid email', async () => {
      const invalidUser = { ...newUser, email: 'invalid-email' };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidUser)
        .expect(400);

      expect(response.body.message).toContain('Please provide a valid email address');
    });

    it('should return 400 for weak password', async () => {
      const weakPasswordUser = { ...newUser, password: '123' };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(weakPasswordUser)
        .expect(400);

      expect(response.body.message).toContain('Password must be at least 8 characters long');
    });

    it('should return 409 for duplicate email', async () => {
      // Create first user
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newUser)
        .expect(201);

      // Try to create user with same email
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newUser)
        .expect(409);

      expect(response.body.message).toContain('User with this email already exists');
    });
  });

  describe('GET /users', () => {
    beforeEach(async () => {
      // Create additional test users for pagination tests
      const users = [
        { email: 'user1@example.com', name: 'User One', password: 'Password123!', role: Role.USER },
        { email: 'user2@example.com', name: 'User Two', password: 'Password123!', role: Role.MANAGER },
        { email: 'user3@example.com', name: 'User Three', password: 'Password123!', role: Role.USER },
      ];

      for (const user of users) {
        await request(app.getHttpServer())
          .post('/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(user);
      }
    });

    it('should return paginated users as admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 10);
      expect(response.body).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check that password is not included
      response.body.data.forEach((user: any) => {
        expect(user).not.toHaveProperty('password');
      });
    });

    it('should return paginated users as manager', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 403 when regular user tries to list users', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('should support pagination parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should support search by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?search=User One')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].name).toContain('User One');
    });

    it('should support search by email', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?search=user1@example.com')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].email).toContain('user1@example.com');
    });

    it('should support filtering by role', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users?role=${Role.MANAGER}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.data.forEach((user: any) => {
        expect(user.role).toBe(Role.MANAGER);
      });
    });

    it('should support filtering by status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users?status=${UserStatus.ACTIVE}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.data.forEach((user: any) => {
        expect(user.status).toBe(UserStatus.ACTIVE);
      });
    });

    it('should support sorting', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?sortBy=name&sortOrder=asc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(1);
      // Check if sorted by name ascending
      for (let i = 1; i < response.body.data.length; i++) {
        expect(response.body.data[i].name >= response.body.data[i - 1].name).toBe(true);
      }
    });

    it('should return 400 for invalid pagination parameters', async () => {
      await request(app.getHttpServer())
        .get('/users?page=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/users?limit=101')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('should return user by id as admin', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testUserId,
        email: testUser.email,
        name: testUser.name,
        phone: testUser.phone,
        role: testUser.role,
        address: testUser.address,
      });
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return user by id as manager', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(response.body.id).toBe(testUserId);
    });

    it('should allow user to view their own profile', async () => {
      // Get the regular user's ID
      const userProfile = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      const userId = userProfile.body.id;

      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.id).toBe(userId);
    });

    it('should return 403 when user tries to view another user profile', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied. Users can only view their own profile');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.message).toContain('User with ID non-existent-id not found');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .expect(401);
    });
  });

  describe('PUT /users/:id', () => {
    const updateData = {
      name: 'Updated Name',
      phone: '+1111111111',
      address: '789 Updated St',
    };

    it('should update user as admin', async () => {
      const response = await request(app.getHttpServer())
        .put(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testUserId,
        name: updateData.name,
        phone: updateData.phone,
        address: updateData.address,
      });
    });

    it('should allow admin to update role and status', async () => {
      const adminUpdateData = {
        ...updateData,
        role: Role.MANAGER,
        status: UserStatus.INACTIVE,
      };

      const response = await request(app.getHttpServer())
        .put(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(adminUpdateData)
        .expect(200);

      expect(response.body.role).toBe(Role.MANAGER);
      expect(response.body.status).toBe(UserStatus.INACTIVE);
    });

    it('should update user as manager but not role/status', async () => {
      const response = await request(app.getHttpServer())
        .put(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe(updateData.name);
    });

    it('should return 403 when manager tries to update role', async () => {
      const managerUpdateData = {
        ...updateData,
        role: Role.ADMIN,
      };

      const response = await request(app.getHttpServer())
        .put(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send(managerUpdateData)
        .expect(403);

      expect(response.body.message).toContain('Managers cannot change user roles or status');
    });

    it('should allow user to update their own profile', async () => {
      // Get the regular user's ID
      const userProfile = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      const userId = userProfile.body.id;

      const response = await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe(updateData.name);
    });

    it('should return 403 when user tries to update another user', async () => {
      const response = await request(app.getHttpServer())
        .put(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(403);

      expect(response.body.message).toContain('Access denied. Users can only update their own profile');
    });

    it('should return 403 when user tries to update their own role', async () => {
      // Get the regular user's ID
      const userProfile = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      const userId = userProfile.body.id;

      const userUpdateData = {
        ...updateData,
        role: Role.ADMIN,
      };

      const response = await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(userUpdateData)
        .expect(403);

      expect(response.body.message).toContain('Users cannot change their own role or status');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .put('/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.message).toContain('User with ID non-existent-id not found');
    });

    it('should return 400 for invalid phone number', async () => {
      const invalidUpdateData = {
        ...updateData,
        phone: 'invalid-phone',
      };

      const response = await request(app.getHttpServer())
        .put(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidUpdateData)
        .expect(400);

      expect(response.body.message).toContain('Please provide a valid phone number');
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete user as admin', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is deleted
      await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should return 403 when manager tries to delete user', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('should return 403 when user tries to delete user', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('should return 403 when admin tries to delete themselves', async () => {
      // Get admin user ID
      const adminProfile = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${adminToken}`);
      
      const adminId = adminProfile.body.id;

      const response = await request(app.getHttpServer())
        .delete(`/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      expect(response.body.message).toContain('Cannot delete your own account');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .delete('/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.message).toContain('User with ID non-existent-id not found');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${testUserId}`)
        .expect(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should handle missing required fields', async () => {
      const incompleteUser = {
        name: 'Incomplete User',
        // missing email, password, role
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(incompleteUser)
        .expect(400);

      expect(response.body.message).toContain('Please provide a valid email address');
    });

    it('should reject extra fields in request body', async () => {
      const userWithExtraFields = {
        ...testUser,
        email: 'extra@example.com',
        extraField: 'should be rejected',
        anotherExtra: 123,
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userWithExtraFields)
        .expect(400);

      expect(response.body.message).toContain('property extraField should not exist');
    });
  });
});