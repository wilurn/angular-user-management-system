import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Request, Req, Headers, Ip } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserResponseDto } from '../users/dto/user-response.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * User login endpoint
   * @param loginDto - Login credentials
   * @param ip - Client IP address
   * @param userAgent - Client user agent
   * @returns AuthResponseDto with JWT token and user data
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto & { sessionId: string }> {
    return this.authService.login(loginDto, ip, userAgent);
  }

  /**
   * User registration endpoint
   * @param registerDto - Registration data
   * @param ip - Client IP address
   * @param userAgent - Client user agent
   * @returns AuthResponseDto with JWT token and user data
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto & { sessionId: string }> {
    return this.authService.register(registerDto, ip, userAgent);
  }

  /**
   * Get current user profile (requires authentication)
   * @param req - Request object with user from JWT
   * @returns UserResponseDto
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req): Promise<UserResponseDto> {
    return req.user;
  }

  /**
   * Validate current token (requires authentication)
   * @param req - Request object with user from JWT
   * @returns Success message with user data
   */
  @Get('validate')
  @UseGuards(JwtAuthGuard)
  async validateToken(@Request() req): Promise<{ valid: boolean; user: UserResponseDto }> {
    return {
      valid: true,
      user: req.user,
    };
  }

  /**
   * Logout from current session
   * @param sessionId - Session ID to invalidate
   * @returns Success message
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body('sessionId') sessionId: string): Promise<{ message: string }> {
    await this.authService.logout(sessionId);
    return { message: 'Logged out successfully' };
  }

  /**
   * Logout from all sessions (requires authentication)
   * @param req - Request object with user from JWT
   * @returns Success message
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Request() req): Promise<{ message: string }> {
    await this.authService.logoutAll(req.user.id);
    return { message: 'Logged out from all sessions successfully' };
  }

  /**
   * Get all active sessions for current user (requires authentication)
   * @param req - Request object with user from JWT
   * @returns Array of session data
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@Request() req) {
    return this.authService.getUserSessions(req.user.id);
  }

  /**
   * Refresh session expiration
   * @param sessionId - Session ID to refresh
   * @returns Success status
   */
  @Post('refresh-session')
  @HttpCode(HttpStatus.OK)
  async refreshSession(@Body('sessionId') sessionId: string): Promise<{ success: boolean }> {
    const success = await this.authService.refreshSession(sessionId);
    return { success };
  }
}