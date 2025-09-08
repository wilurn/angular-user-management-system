import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Role, UserStatus } from '@prisma/client';

export class GetUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 10;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Role must be one of: ADMIN, MANAGER, USER' })
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'Status must be one of: ACTIVE, INACTIVE, SUSPENDED' })
  status?: UserStatus;

  @IsOptional()
  @IsString({ message: 'SortBy must be a string' })
  @IsEnum(['name', 'email', 'createdAt', 'role'], {
    message: 'SortBy must be one of: name, email, createdAt, role',
  })
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'], { message: 'SortOrder must be either asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}