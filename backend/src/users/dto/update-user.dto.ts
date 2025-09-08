import {
  IsString,
  IsOptional,
  IsEnum,
  Matches,
  MinLength,
} from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name?: string;

  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Please provide a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Role must be one of: ADMIN, MANAGER, USER' })
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus, {
    message: 'Status must be one of: ACTIVE, INACTIVE, SUSPENDED',
  })
  status?: UserStatus;

  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Profile picture must be a string' })
  profilePicture?: string;
}
