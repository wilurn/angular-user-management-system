import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SecurityService } from '../security/security.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly securityService: SecurityService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Authenticate user with email and password
   * @param loginDto - Login credentials
   * @param ipAddress - Client IP address
   * @param userAgent - Client user agent
   * @returns AuthResponseDto with JWT token and user data
   */
  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto & { sessionId: string }> {
    const { email, password } = loginDto;

    // Find user by email (need to get the full user with password for comparison)
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is active
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Verify password
    const isPasswordValid = await this.securityService.comparePasswords(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    // Generate JWT token
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Create user response (without password)
    const userResponse = new UserResponseDto(user);

    // Create session
    const sessionId = await this.sessionService.createSession(
      userResponse,
      accessToken,
      ipAddress,
      userAgent,
    );

    return {
      ...new AuthResponseDto(accessToken, userResponse),
      sessionId,
    };
  }

  /**
   * Register a new user
   * @param registerDto - Registration data
   * @param ipAddress - Client IP address
   * @param userAgent - Client user agent
   * @returns AuthResponseDto with JWT token and user data
   */
  async register(
    registerDto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto & { sessionId: string }> {
    // Validate password strength
    const passwordValidation = this.securityService.validatePasswordStrength(
      registerDto.password,
    );
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.errors);
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create the user using UsersService
    const newUser = await this.usersService.create(registerDto);

    // Generate JWT token
    const payload: JwtPayload = {
      sub: newUser.id,
      email: newUser.email,
      role: newUser.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Create session
    const sessionId = await this.sessionService.createSession(
      newUser,
      accessToken,
      ipAddress,
      userAgent,
    );

    return {
      ...new AuthResponseDto(accessToken, newUser),
      sessionId,
    };
  }

  /**
   * Validate JWT token and return user
   * @param token - JWT token
   * @returns UserResponseDto if token is valid
   */
  async validateToken(token: string): Promise<UserResponseDto> {
    try {
      const payload = this.jwtService.verify(token) as JwtPayload;
      const user = await this.usersService.findOne(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Generate JWT token for a user
   * @param user - User data
   * @returns JWT token string
   */
  generateToken(user: UserResponseDto): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Logout user by invalidating session
   * @param sessionId - Session ID to invalidate
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessionService.invalidateSession(sessionId);
  }

  /**
   * Logout user from all sessions
   * @param userId - User ID to logout from all sessions
   */
  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.invalidateAllUserSessions(userId);
  }

  /**
   * Validate session and return user
   * @param sessionId - Session ID to validate
   * @returns UserResponseDto if session is valid
   */
  async validateSession(sessionId: string): Promise<UserResponseDto | null> {
    return await this.sessionService.validateSessionToken(sessionId);
  }

  /**
   * Refresh session expiration
   * @param sessionId - Session ID to refresh
   * @returns boolean indicating success
   */
  async refreshSession(sessionId: string): Promise<boolean> {
    return await this.sessionService.refreshSession(sessionId);
  }

  /**
   * Get all active sessions for a user
   * @param userId - User ID
   * @returns Array of session data
   */
  async getUserSessions(userId: string) {
    return await this.sessionService.getUserSessions(userId);
  }

  /**
   * Verify user credentials without generating token
   * @param email - User email
   * @param password - User password
   * @returns UserResponseDto if credentials are valid
   */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const isPasswordValid = await this.securityService.comparePasswords(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return new UserResponseDto(user);
  }
}
