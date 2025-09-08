import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    phone: '+1234567890',
    password: 'hashedPassword',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    profilePicture: null,
    address: '123 Test St',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
    lastLoginAt: null,
  };

  const mockCreateUserDto: CreateUserDto = {
    email: 'test@example.com',
    name: 'Test User',
    phone: '+1234567890',
    role: Role.USER,
    password: 'Password123!',
    address: '123 Test St',
  };

  const mockUpdateUserDto: UpdateUserDto = {
    name: 'Updated User',
    phone: '+0987654321',
    role: Role.MANAGER,
    status: UserStatus.INACTIVE,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
    mockedBcrypt.hash.mockResolvedValue('hashedPassword');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.create(mockCreateUserDto);

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: mockCreateUserDto.email },
      });
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(mockCreateUserDto.password, 12);
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          ...mockCreateUserDto,
          password: 'hashedPassword',
        },
      });
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.email).toBe(mockUser.email);
      expect(result.password).toBeUndefined();
    });

    it('should throw ConflictException if user with email already exists', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(ConflictException);
      expect(prismaService.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException on Prisma P2002 error', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      const prismaError = new Error('Unique constraint failed');
      (prismaError as any).code = 'P2002';
      prismaService.user.create.mockRejectedValue(prismaError);

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException on other errors', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockRejectedValue(new Error('Database error'));

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    const mockUsers = [mockUser];
    const mockPaginationOptions = {
      page: 1,
      limit: 10,
      search: 'test',
      role: 'USER',
      status: 'ACTIVE',
      sortBy: 'name',
      sortOrder: 'asc' as const,
    };

    it('should return paginated users with default options', async () => {
      prismaService.user.count.mockResolvedValue(1);
      prismaService.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.data[0]).toBeInstanceOf(UserResponseDto);
    });

    it('should return paginated users with custom options', async () => {
      prismaService.user.count.mockResolvedValue(1);
      prismaService.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll(mockPaginationOptions);

      expect(prismaService.user.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'test', mode: 'insensitive' } },
          ],
          role: 'USER',
          status: 'ACTIVE',
        },
      });
      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'test', mode: 'insensitive' } },
          ],
          role: 'USER',
          status: 'ACTIVE',
        },
        skip: 0,
        take: 10,
        orderBy: { name: 'asc' },
      });
      expect(result.data).toHaveLength(1);
    });

    it('should throw BadRequestException for invalid pagination parameters', async () => {
      await expect(service.findAll({ page: 0, limit: 10 })).rejects.toThrow(BadRequestException);
      await expect(service.findAll({ page: 1, limit: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.findAll({ page: 1, limit: 101 })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on database error', async () => {
      prismaService.user.count.mockRejectedValue(new Error('Database error'));

      await expect(service.findAll()).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne('user-1');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(mockUser.id);
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if ID is not provided', async () => {
      await expect(service.findOne('')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on database error', async () => {
      prismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.findOne('user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result?.email).toBe(mockUser.email);
    });

    it('should return null if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should throw BadRequestException if email is not provided', async () => {
      await expect(service.findByEmail('')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on database error', async () => {
      prismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.findByEmail('test@example.com')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const updatedUser = { ...mockUser, ...mockUpdateUserDto };

    it('should update a user successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update('user-1', mockUpdateUserDto);

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: mockUpdateUserDto,
      });
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.name).toBe(mockUpdateUserDto.name);
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent-id', mockUpdateUserDto)).rejects.toThrow(NotFoundException);
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if ID is not provided', async () => {
      await expect(service.update('', mockUpdateUserDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException on Prisma P2025 error', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      prismaService.user.update.mockRejectedValue(prismaError);

      await expect(service.update('user-1', mockUpdateUserDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on other errors', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.update.mockRejectedValue(new Error('Database error'));

      await expect(service.update('user-1', mockUpdateUserDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete a user successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.delete.mockResolvedValue(mockUser);

      await service.remove('user-1');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(prismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(prismaService.user.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if ID is not provided', async () => {
      await expect(service.remove('')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException on Prisma P2025 error', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      prismaService.user.delete.mockRejectedValue(prismaError);

      await expect(service.remove('user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on other errors', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.delete.mockRejectedValue(new Error('Database error'));

      await expect(service.remove('user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login successfully', async () => {
      prismaService.user.update.mockResolvedValue(mockUser);

      await service.updateLastLogin('user-1');

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('should throw BadRequestException if ID is not provided', async () => {
      await expect(service.updateLastLogin('')).rejects.toThrow(BadRequestException);
    });

    it('should not throw error on database failure (non-critical operation)', async () => {
      prismaService.user.update.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(service.updateLastLogin('user-1')).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('count', () => {
    it('should return total user count', async () => {
      prismaService.user.count.mockResolvedValue(5);

      const result = await service.count();

      expect(result).toBe(5);
      expect(prismaService.user.count).toHaveBeenCalledWith();
    });

    it('should throw BadRequestException on database error', async () => {
      prismaService.user.count.mockRejectedValue(new Error('Database error'));

      await expect(service.count()).rejects.toThrow(BadRequestException);
    });
  });

  describe('countByStatus', () => {
    it('should return user count by status', async () => {
      prismaService.user.count
        .mockResolvedValueOnce(3) // active
        .mockResolvedValueOnce(1) // inactive
        .mockResolvedValueOnce(1); // suspended

      const result = await service.countByStatus();

      expect(result).toEqual({ active: 3, inactive: 1, suspended: 1 });
      expect(prismaService.user.count).toHaveBeenCalledTimes(3);
    });

    it('should throw BadRequestException on database error', async () => {
      prismaService.user.count.mockRejectedValue(new Error('Database error'));

      await expect(service.countByStatus()).rejects.toThrow(BadRequestException);
    });
  });

  describe('countByRole', () => {
    it('should return user count by role', async () => {
      prismaService.user.count
        .mockResolvedValueOnce(1) // admin
        .mockResolvedValueOnce(2) // manager
        .mockResolvedValueOnce(3); // user

      const result = await service.countByRole();

      expect(result).toEqual({ admin: 1, manager: 2, user: 3 });
      expect(prismaService.user.count).toHaveBeenCalledTimes(3);
    });

    it('should throw BadRequestException on database error', async () => {
      prismaService.user.count.mockRejectedValue(new Error('Database error'));

      await expect(service.countByRole()).rejects.toThrow(BadRequestException);
    });
  });
});