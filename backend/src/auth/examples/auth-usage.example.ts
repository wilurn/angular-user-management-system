import { Controller, Get, Post, Put, Delete, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../guards';
import { Roles, CurrentUser } from '../decorators';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Role } from '@prisma/client';

/**
 * Example controller demonstrating how to use authentication guards and decorators
 * This file serves as documentation and examples for developers
 */

@Controller('example')
export class AuthUsageExampleController {
  
  // Public endpoint - no authentication required
  @Get('public')
  publicEndpoint() {
    return { message: 'This is a public endpoint accessible to everyone' };
  }

  // Protected endpoint - requires valid JWT token
  @Get('protected')
  @UseGuards(JwtAuthGuard)
  protectedEndpoint(@CurrentUser() user: UserResponseDto) {
    return { 
      message: 'This endpoint requires authentication',
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    };
  }

  // Admin only endpoint
  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminOnlyEndpoint(@CurrentUser() user: UserResponseDto) {
    return { 
      message: 'This endpoint is only accessible to admins',
      adminUser: user.email
    };
  }

  // Multiple roles allowed
  @Get('admin-or-manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  adminOrManagerEndpoint(@CurrentUser() user: UserResponseDto) {
    return { 
      message: 'This endpoint is accessible to admins and managers',
      user: user.email,
      role: user.role
    };
  }

  // User role specific endpoint
  @Post('user-action')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  userActionEndpoint(@CurrentUser() user: UserResponseDto, @Body() data: any) {
    return { 
      message: 'This action is only available to regular users',
      user: user.email,
      data
    };
  }

  // Manager role specific endpoint
  @Put('manager-action')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  managerActionEndpoint(@CurrentUser() user: UserResponseDto, @Body() data: any) {
    return { 
      message: 'This action is only available to managers',
      manager: user.email,
      data
    };
  }

  // Multiple guards can be combined
  @Delete('sensitive-action')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  sensitiveActionEndpoint(@CurrentUser() user: UserResponseDto) {
    return { 
      message: 'This is a sensitive action requiring admin privileges',
      performedBy: user.email,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Usage Notes:
 * 
 * 1. JwtAuthGuard: 
 *    - Validates JWT tokens from Authorization header
 *    - Adds user object to request if token is valid
 *    - Throws UnauthorizedException if token is invalid or missing
 * 
 * 2. RolesGuard:
 *    - Must be used after JwtAuthGuard
 *    - Checks if authenticated user has required role(s)
 *    - Throws ForbiddenException if user doesn't have required role
 * 
 * 3. @Roles decorator:
 *    - Specifies which roles are allowed to access the endpoint
 *    - Can accept multiple roles: @Roles(Role.ADMIN, Role.MANAGER)
 *    - Must be used with RolesGuard to take effect
 * 
 * 4. @CurrentUser decorator:
 *    - Extracts the authenticated user from the request
 *    - Only works when JwtAuthGuard has been applied
 *    - Returns UserResponseDto object
 * 
 * 5. AuthMiddleware:
 *    - Automatically applied to all routes (configured in app module)
 *    - Adds user to request if valid token is present
 *    - Does not throw errors - lets guards handle authentication
 * 
 * Example HTTP requests:
 * 
 * // Public access
 * GET /example/public
 * 
 * // Authenticated access
 * GET /example/protected
 * Authorization: Bearer <jwt-token>
 * 
 * // Role-based access
 * GET /example/admin-only
 * Authorization: Bearer <admin-jwt-token>
 * 
 * // Multiple roles
 * GET /example/admin-or-manager
 * Authorization: Bearer <admin-or-manager-jwt-token>
 */