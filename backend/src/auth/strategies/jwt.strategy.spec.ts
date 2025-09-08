import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Role, UserStatus } from '@prisma/client';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<UsersService>;
  let configService: jest.Mocked<ConfigService>;

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

  beforeEach(async () => {
    const mockUsersService = {
      findOne: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: mockUsersService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    usersService = module.get(UsersService);
    configService = module.get(ConfigService);

    // Mock the config service to return JWT secret
    configService.get.mockReturnValue('test-secret');
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    const mockPayload: JwtPayload = {
      sub: 'user-1',
      email: 'test@example.com',
      role: 'USER',
    };

    it('should successfully validate a JWT payload for active user', async () => {
      usersService.findOne.mockResolvedValue(mockUserResponse);

      const result = await strategy.validate(mockPayload);

      expect(result).toEqual(mockUserResponse);
      expect(usersService.findOne).toHaveBeenCalledWith(mockPayload.sub);
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      usersService.findOne.mockResolvedValue(null);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(UnauthorizedException);
      expect(usersService.findOne).toHaveBeenCalledWith(mockPayload.sub);
    });

    it('should throw UnauthorizedException when user account is inactive', async () => {
      const inactiveUser = { ...mockUserResponse, status: UserStatus.INACTIVE };
      usersService.findOne.mockResolvedValue(inactiveUser);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(UnauthorizedException);
      expect(usersService.findOne).toHaveBeenCalledWith(mockPayload.sub);
    });

    it('should throw UnauthorizedException when user account is suspended', async () => {
      const suspendedUser = { ...mockUserResponse, status: UserStatus.SUSPENDED };
      usersService.findOne.mockResolvedValue(suspendedUser);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(UnauthorizedException);
      expect(usersService.findOne).toHaveBeenCalledWith(mockPayload.sub);
    });

    it('should handle service errors gracefully', async () => {
      usersService.findOne.mockRejectedValue(new Error('Database error'));

      await expect(strategy.validate(mockPayload)).rejects.toThrow('Database error');
      expect(usersService.findOne).toHaveBeenCalledWith(mockPayload.sub);
    });
  });
});