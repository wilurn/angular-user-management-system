import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from './auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { SecurityModule } from '../security/security.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

describe('AuthController (Integration)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  const testUser = {
    email: 'test@example.com',
    name: 'Test User',
    password: 'Password123!',
    role: Role.USER,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        PrismaModule,
        UsersModule,
        SecurityModule,
        AuthModule,
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
  });

  afterAll(async () => {
    // Clean up the database after all tests
    await prismaService.user.deleteMany();
    await prismaService.$disconnect();
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should successfully register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
        status: 'ACTIVE',
      });
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 400 for invalid email format', async () => {
      const invalidUser = { ...testUser, email: 'invalid-email' };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(invalidUser)
        .expect(400);

      expect(response.body.message).toContain('Please provide a valid email address');
    });

    it('should return 400 for weak password', async () => {
      const weakPasswordUser = { ...testUser, password: '123' };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(weakPasswordUser)
        .expect(400);

      expect(response.body.message).toContain('Password must be at least 8 characters long');
    });

    it('should return 409 for duplicate email', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body.message).toContain('User with this email already exists');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
    });

    it('should successfully login with valid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
      });
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 401 for invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should return 401 for invalid password', async () => {
      const loginData = {
        email: testUser.email,
        password: 'wrongpassword',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should return 400 for missing email', async () => {
      const loginData = {
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.message).toContain('Please provide a valid email address');
    });

    it('should return 400 for missing password', async () => {
      const loginData = {
        email: testUser.email,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.message).toContain('Password must be a string');
    });
  });

  describe('GET /auth/profile', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login to get access token
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
      
      accessToken = registerResponse.body.accessToken;
    });

    it('should return user profile with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
      });
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 401 without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);

      expect(response.body.message).toContain('Invalid or missing token');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toContain('Invalid or missing token');
    });
  });

  describe('GET /auth/validate', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login to get access token
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
      
      accessToken = registerResponse.body.accessToken;
    });

    it('should validate token and return user data', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
      });
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toContain('Invalid or missing token');
    });
  });

  describe('Authentication Flow', () => {
    it('should complete full authentication flow: register -> login -> access protected route', async () => {
      // Step 1: Register
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(registerResponse.body).toHaveProperty('accessToken');
      const registerToken = registerResponse.body.accessToken;

      // Step 2: Access protected route with registration token
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${registerToken}`)
        .expect(200);

      // Step 3: Login with same credentials
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('accessToken');
      const loginToken = loginResponse.body.accessToken;

      // Step 4: Access protected route with login token
      const profileResponse = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${loginToken}`)
        .expect(200);

      expect(profileResponse.body).toMatchObject({
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
      });
    });
  });
});