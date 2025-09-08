import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AuthMiddleware } from './auth.middleware';
import { UsersService } from '../../users/users.service';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Role, UserStatus } from '@prisma/client';
import { JwtPayload } from '../strategies/jwt.strategy';

describe('AuthMiddleware', () => {
  let middleware: AuthMiddleware;
  let jwtService: JwtService;
  let usersService: UsersService;

  const mockUser: UserResponseDto = {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJwtPayload: JwtPayload = {
    sub: '1',
    email: 'test@example.com',
    role: 'USER',
  };

  const mockRequest = (authHeader?: string) => ({
    headers: {
      authorization: authHeader,
    },
  }) as Request;

  const mockResponse = {} as Response;
  const mockNext: NextFunction = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthMiddleware,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    middleware = module.get<AuthMiddleware>(AuthMiddleware);
    jwtService = module.get<JwtService>(JwtService);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should call next() when no authorization header is present', async () => {
      const req = mockRequest();

      await middleware.use(req, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next() when authorization header does not start with Bearer', async () => {
      const req = mockRequest('Basic token123');

      await middleware.use(req, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next() when token is empty', async () => {
      const req = mockRequest('Bearer ');

      await middleware.use(req, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should add user to request when valid token is provided', async () => {
      const req = mockRequest('Bearer valid-token');
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockJwtPayload);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUser);

      await middleware.use(req, mockResponse, mockNext);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(usersService.findOne).toHaveBeenCalledWith('1');
      expect(req.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not add user to request when user is not found', async () => {
      const req = mockRequest('Bearer valid-token');
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockJwtPayload);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(null);

      await middleware.use(req, mockResponse, mockNext);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(usersService.findOne).toHaveBeenCalledWith('1');
      expect(req.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not add user to request when user status is not ACTIVE', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      const req = mockRequest('Bearer valid-token');
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockJwtPayload);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(inactiveUser);

      await middleware.use(req, mockResponse, mockNext);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(usersService.findOne).toHaveBeenCalledWith('1');
      expect(req.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not add user to request when user is suspended', async () => {
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      const req = mockRequest('Bearer valid-token');
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockJwtPayload);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(suspendedUser);

      await middleware.use(req, mockResponse, mockNext);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(usersService.findOne).toHaveBeenCalledWith('1');
      expect(req.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() when JWT verification fails', async () => {
      const req = mockRequest('Bearer invalid-token');
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await middleware.use(req, mockResponse, mockNext);

      expect(jwtService.verify).toHaveBeenCalledWith('invalid-token');
      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() when user service throws error', async () => {
      const req = mockRequest('Bearer valid-token');
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockJwtPayload);
      jest.spyOn(usersService, 'findOne').mockRejectedValue(new Error('Database error'));

      await middleware.use(req, mockResponse, mockNext);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(usersService.findOne).toHaveBeenCalledWith('1');
      expect(req.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle different user roles correctly', async () => {
      const adminUser = { ...mockUser, role: Role.ADMIN };
      const adminPayload = { ...mockJwtPayload, role: 'ADMIN' };
      const req = mockRequest('Bearer admin-token');
      jest.spyOn(jwtService, 'verify').mockReturnValue(adminPayload);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(adminUser);

      await middleware.use(req, mockResponse, mockNext);

      expect(req.user).toEqual(adminUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle manager role correctly', async () => {
      const managerUser = { ...mockUser, role: Role.MANAGER };
      const managerPayload = { ...mockJwtPayload, role: 'MANAGER' };
      const req = mockRequest('Bearer manager-token');
      jest.spyOn(jwtService, 'verify').mockReturnValue(managerPayload);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(managerUser);

      await middleware.use(req, mockResponse, mockNext);

      expect(req.user).toEqual(managerUser);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});