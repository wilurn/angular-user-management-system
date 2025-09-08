import { Role, UserStatus } from '@prisma/client';
import { Exclude } from 'class-transformer';

export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  status: UserStatus;
  profilePicture?: string | null;
  address?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;

  constructor(partial: any) {
    Object.assign(this, partial);
    // Explicitly exclude password field
    delete (this as any).password;
  }
}