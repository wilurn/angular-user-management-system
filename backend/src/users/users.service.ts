import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto';
import { User, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    try {
      // Check if user with email already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: createUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash the password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(createUserDto.password, saltRounds);

      // Create the user
      const user = await this.prisma.user.create({
        data: {
          ...createUserDto,
          password: hashedPassword,
        },
      });

      return new UserResponseDto(user);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error.code === 'P2002') {
        throw new ConflictException('User with this email already exists');
      }
      throw new BadRequestException('Failed to create user');
    }
  }

  async findAll(options: PaginationOptions = {}): Promise<PaginatedResult<UserResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    // Validate pagination parameters
    if (page < 1 || limit < 1) {
      throw new BadRequestException('Page and limit must be positive numbers');
    }

    if (limit > 100) {
      throw new BadRequestException('Limit cannot exceed 100');
    }

    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role as any;
    }

    if (status) {
      where.status = status as any;
    }

    // Build orderBy clause
    const orderBy: Prisma.UserOrderByWithRelationInput = {};
    if (sortBy === 'name' || sortBy === 'email' || sortBy === 'createdAt' || sortBy === 'role') {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = 'desc';
    }

    try {
      // Get total count and users in parallel
      const [total, users] = await Promise.all([
        this.prisma.user.count({ where }),
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy,
        }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        data: users.map(user => new UserResponseDto(user)),
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch users');
    }
  }

  async findOne(id: string): Promise<UserResponseDto> {
    if (!id) {
      throw new BadRequestException('User ID is required');
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      return new UserResponseDto(user);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch user');
    }
  }

  async findByEmail(email: string): Promise<UserResponseDto | null> {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      return user ? new UserResponseDto(user) : null;
    } catch (error) {
      throw new BadRequestException('Failed to fetch user by email');
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    if (!id) {
      throw new BadRequestException('User ID is required');
    }

    try {
      // Check if user exists
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Update the user
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
      });

      return new UserResponseDto(updatedUser);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      throw new BadRequestException('Failed to update user');
    }
  }

  async remove(id: string): Promise<void> {
    if (!id) {
      throw new BadRequestException('User ID is required');
    }

    try {
      // Check if user exists
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Delete the user (cascade will handle related records)
      await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      throw new BadRequestException('Failed to delete user');
    }
  }

  async updateLastLogin(id: string): Promise<void> {
    if (!id) {
      throw new BadRequestException('User ID is required');
    }

    try {
      await this.prisma.user.update({
        where: { id },
        data: { lastLoginAt: new Date() },
      });
    } catch (error) {
      // Don't throw error for last login update failure
      // This is a non-critical operation
      console.error('Failed to update last login:', error);
    }
  }

  async count(): Promise<number> {
    try {
      return await this.prisma.user.count();
    } catch (error) {
      throw new BadRequestException('Failed to count users');
    }
  }

  async countByStatus(): Promise<{ active: number; inactive: number; suspended: number }> {
    try {
      const [active, inactive, suspended] = await Promise.all([
        this.prisma.user.count({ where: { status: 'ACTIVE' } }),
        this.prisma.user.count({ where: { status: 'INACTIVE' } }),
        this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      ]);

      return { active, inactive, suspended };
    } catch (error) {
      throw new BadRequestException('Failed to count users by status');
    }
  }

  async countByRole(): Promise<{ admin: number; manager: number; user: number }> {
    try {
      const [admin, manager, user] = await Promise.all([
        this.prisma.user.count({ where: { role: 'ADMIN' } }),
        this.prisma.user.count({ where: { role: 'MANAGER' } }),
        this.prisma.user.count({ where: { role: 'USER' } }),
      ]);

      return { admin, manager, user };
    } catch (error) {
      throw new BadRequestException('Failed to count users by role');
    }
  }
}