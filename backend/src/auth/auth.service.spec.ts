import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { UsersService } from '../users/users.service';
import { SecurityService } from '../security/security.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Role, UserStatus } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let securityService: jest.Mocked<SecurityService>;
  let jwtService: jest.Mocked<JwtService>;
  let prismaService: jest.Mocked<PrismaService>;
  let sessionService: jest.Mocked<SessionService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    phone: '+1234567890',
    password: 'hashedPassword123',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    profilePicture: null,
    address: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  };

  const mockUserResponse = new UserResponseDto(mockUser);

  beforeEach(async () => {
    const mockUsersService = {
      create: jest.fn(),
      findOne: jest.fn(),
      updateLastLogin: jest.fn(),
    };

    const mockSecurityService = {
      comparePasswords: jest.fn(),
      validatePasswordStrength: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const mockSessionService = {
      createSession: jest.fn(),
      invalidateSession: jest.fn(),
      invalidateAllUserSessions: jest.fn(),
      validateSession: jest.fn(),
      validateSessionToken: jest.fn(),
      refreshSession: jest.fn(),
      getUserSessions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: SecurityService, useValue: mockSecurityService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    securityService = module.get(SecurityService);
    jwtService = module.get(JwtService);
    prismaService = module.get(PrismaService);
    sessionService = module.get(SessionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login with valid credentials', async () => {
      const mockToken = 'jwt-token-123';
      const mockSessionId = 'session-123';
      
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      securityService.comparePasswords.mockResolvedValue(true);
      usersService.updateLastLogin.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValue(mockToken);
      sessionService.createSession.mockResolvedValue(mockSessionId);

      const result = await service.login(loginDto, '127.0.0.1', 'test-agent');

      expect(result).toEqual({
        accessToken: mockToken,
        sessionId: mockSessionId,
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
        }),
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email },
      });
      expect(securityService.comparePasswords).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.password,
      );
      expect(usersService.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
      expect(sessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
        }),
        mockToken,
        '127.0.0.1',
        'test-agent',
      );
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email },
      });
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      prismaService.user.findUnique.mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for suspended user', async () => {
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      prismaService.user.findUnique.mockResolvedValue(suspendedUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      securityService.comparePasswords.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(securityService.comparePasswords).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.password,
      );
    });
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      name: 'New User',
      password: 'Password123!',
      role: Role.USER,
    };

    it('should successfully register a new user', async () => {
      const mockToken = 'jwt-token-123';
      const mockSessionId = 'session-123';
      const newUser = new UserResponseDto({ ...mockUser, ...registerDto });

      securityService.validatePasswordStrength.mockReturnValue({
        isValid: true,
        errors: [],
      });
      prismaService.user.findUnique.mockResolvedValue(null);
      usersService.create.mockResolvedValue(newUser);
      jwtService.sign.mockReturnValue(mockToken);
      sessionService.createSession.mockResolvedValue(mockSessionId);

      const result = await service.register(registerDto, '127.0.0.1', 'test-agent');

      expect(result).toEqual({
        accessToken: mockToken,
        sessionId: mockSessionId,
        user: newUser,
      });
      expect(securityService.validatePasswordStrength).toHaveBeenCalledWith(
        registerDto.password,
      );
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(usersService.create).toHaveBeenCalledWith(registerDto);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: newUser.id,
        email: newUser.email,
        role: newUser.role,
      });
    });

    it('should throw BadRequestException for weak password', async () => {
      securityService.validatePasswordStrength.mockReturnValue({
        isValid: false,
        errors: ['Password must be at least 8 characters long'],
      });

      await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
      expect(securityService.validatePasswordStrength).toHaveBeenCalledWith(
        registerDto.password,
      );
    });

    it('should throw ConflictException for existing user', async () => {
      securityService.validatePasswordStrength.mockReturnValue({
        isValid: true,
        errors: [],
      });
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
    });
  });

  describe('validateToken', () => {
    const mockToken = 'jwt-token-123';
    const mockPayload = {
      sub: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
    };

    it('should successfully validate a valid token', async () => {
      jwtService.verify.mockReturnValue(mockPayload);
      usersService.findOne.mockResolvedValue(mockUserResponse);

      const result = await service.validateToken(mockToken);

      expect(result).toEqual(mockUserResponse);
      expect(jwtService.verify).toHaveBeenCalledWith(mockToken);
      expect(usersService.findOne).toHaveBeenCalledWith(mockPayload.sub);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.validateToken(mockToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      jwtService.verify.mockReturnValue(mockPayload);
      usersService.findOne.mockResolvedValue(null);

      await expect(service.validateToken(mockToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUserResponse, status: UserStatus.INACTIVE };
      jwtService.verify.mockReturnValue(mockPayload);
      usersService.findOne.mockResolvedValue(inactiveUser);

      await expect(service.validateToken(mockToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('generateToken', () => {
    it('should generate a JWT token for a user', () => {
      const mockToken = 'jwt-token-123';
      jwtService.sign.mockReturnValue(mockToken);

      const result = service.generateToken(mockUserResponse);

      expect(result).toBe(mockToken);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUserResponse.id,
        email: mockUserResponse.email,
        role: mockUserResponse.role,
      });
    });
  });

  describe('verifyCredentials', () => {
    const email = 'test@example.com';
    const password = 'password123';

    it('should successfully verify valid credentials', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      securityService.comparePasswords.mockResolvedValue(true);

      const result = await service.verifyCredentials(email, password);

      expect(result).toEqual(expect.objectContaining({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      }));
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(securityService.comparePasswords).toHaveBeenCalledWith(
        password,
        mockUser.password,
      );
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyCredentials(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      prismaService.user.findUnique.mockResolvedValue(inactiveUser);

      await expect(service.verifyCredentials(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      securityService.comparePasswords.mockResolvedValue(false);

      await expect(service.verifyCredentials(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});