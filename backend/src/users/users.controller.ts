import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UsersService, PaginationOptions } from './users.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto, GetUsersQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';



@Controller('users')
@UseGuards(ThrottlerGuard, JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: UserResponseDto,
  ): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  async findAll(@Query() query: GetUsersQueryDto) {
    const options: PaginationOptions = {
      page: query.page,
      limit: query.limit,
      search: query.search,
      role: query.role,
      status: query.status,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    return this.usersService.findAll(options);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.USER)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserResponseDto,
  ): Promise<UserResponseDto> {
    // Users can only view their own profile unless they are ADMIN or MANAGER
    if (currentUser.role === Role.USER && currentUser.id !== id) {
      throw new ForbiddenException('Access denied. Users can only view their own profile');
    }

    return this.usersService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.USER)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: UserResponseDto,
  ): Promise<UserResponseDto> {
    // Users can only update their own profile
    if (currentUser.role === Role.USER && currentUser.id !== id) {
      throw new ForbiddenException('Access denied. Users can only update their own profile');
    }

    // Managers cannot change roles or status
    if (currentUser.role === Role.MANAGER) {
      if (updateUserDto.role !== undefined || updateUserDto.status !== undefined) {
        throw new ForbiddenException('Access denied. Managers cannot change user roles or status');
      }
    }

    // Regular users cannot change their own role or status
    if (currentUser.role === Role.USER) {
      if (updateUserDto.role !== undefined || updateUserDto.status !== undefined) {
        throw new ForbiddenException('Access denied. Users cannot change their own role or status');
      }
    }

    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserResponseDto,
  ): Promise<void> {
    // Prevent users from deleting themselves
    if (currentUser.id === id) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    return this.usersService.remove(id);
  }
}