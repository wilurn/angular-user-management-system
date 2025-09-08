import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Role, UserStatus } from '@prisma/client';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    phone: '+1234567890',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    profilePicture: null,
    address: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  };

  const mockUserResponse = new UserResponseDto(mockUser);
  const mockAuthResponse = new AuthResponseDto('jwt-token-123', mockUserResponse);
  const mockAuthResponseWithSession = { ...mockAuthResponse, sessionId: 'session-123' };

  beforeEach(async () => {
    const mockAuthService = {
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
      getUserSessions: jest.fn(),
      refreshSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login a user', async () => {
      authService.login.mockResolvedValue(mockAuthResponseWithSession);

      const result = await controller.login(loginDto, '127.0.0.1', 'test-agent');

      expect(result).toEqual(mockAuthResponseWithSession);
      expect(authService.login).toHaveBeenCalledWith(loginDto, '127.0.0.1', 'test-agent');
    });

    it('should handle login errors', async () => {
      const error = new Error('Invalid credentials');
      authService.login.mockRejectedValue(error);

      await expect(controller.login(loginDto, '127.0.0.1', 'test-agent')).rejects.toThrow(error);
      expect(authService.login).toHaveBeenCalledWith(loginDto, '127.0.0.1', 'test-agent');
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
      authService.register.mockResolvedValue(mockAuthResponseWithSession);

      const result = await controller.register(registerDto, '127.0.0.1', 'test-agent');

      expect(result).toEqual(mockAuthResponseWithSession);
      expect(authService.register).toHaveBeenCalledWith(registerDto, '127.0.0.1', 'test-agent');
    });

    it('should handle registration errors', async () => {
      const error = new Error('User already exists');
      authService.register.mockRejectedValue(error);

      await expect(controller.register(registerDto, '127.0.0.1', 'test-agent')).rejects.toThrow(error);
      expect(authService.register).toHaveBeenCalledWith(registerDto, '127.0.0.1', 'test-agent');
    });
  });

  describe('getProfile', () => {
    it('should return the current user profile', async () => {
      const mockRequest = { user: mockUserResponse };

      const result = await controller.getProfile(mockRequest);

      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('validateToken', () => {
    it('should validate the current token and return user data', async () => {
      const mockRequest = { user: mockUserResponse };

      const result = await controller.validateToken(mockRequest);

      expect(result).toEqual({
        valid: true,
        user: mockUserResponse,
      });
    });
  });

  describe('logout', () => {
    it('should logout from current session', async () => {
      authService.logout.mockResolvedValue(undefined);

      const result = await controller.logout('session-123');

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalledWith('session-123');
    });
  });

  describe('logoutAll', () => {
    it('should logout from all sessions', async () => {
      const mockRequest = { user: mockUserResponse };
      authService.logoutAll.mockResolvedValue(undefined);

      const result = await controller.logoutAll(mockRequest);

      expect(result).toEqual({ message: 'Logged out from all sessions successfully' });
      expect(authService.logoutAll).toHaveBeenCalledWith(mockUserResponse.id);
    });
  });

  describe('getSessions', () => {
    it('should get all active sessions for current user', async () => {
      const mockRequest = { user: mockUserResponse };
      const mockSessions = [
        {
          userId: 'user-1',
          email: 'test@example.com',
          role: 'USER',
          jwtToken: 'token-1',
          createdAt: new Date(),
          expiresAt: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'agent-1',
        },
      ];
      authService.getUserSessions.mockResolvedValue(mockSessions);

      const result = await controller.getSessions(mockRequest);

      expect(result).toEqual(mockSessions);
      expect(authService.getUserSessions).toHaveBeenCalledWith(mockUserResponse.id);
    });
  });

  describe('refreshSession', () => {
    it('should refresh session expiration', async () => {
      authService.refreshSession.mockResolvedValue(true);

      const result = await controller.refreshSession('session-123');

      expect(result).toEqual({ success: true });
      expect(authService.refreshSession).toHaveBeenCalledWith('session-123');
    });

    it('should return false for invalid session', async () => {
      authService.refreshSession.mockResolvedValue(false);

      const result = await controller.refreshSession('invalid-session');

      expect(result).toEqual({ success: false });
      expect(authService.refreshSession).toHaveBeenCalledWith('invalid-session');
    });
  });
});