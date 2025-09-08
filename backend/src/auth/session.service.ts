import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { randomBytes } from 'crypto';

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  jwtToken: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionTtl: number;
  private readonly sessionPrefix = 'session:';
  private readonly userSessionsPrefix = 'user_sessions:';

  constructor(
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Default session TTL to 24 hours (86400 seconds)
    this.sessionTtl = this.configService.get<number>('SESSION_TTL', 86400);
  }

  /**
   * Create a new session for a user
   */
  async createSession(
    user: UserResponseDto,
    jwtToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const expiresAt = new Date(Date.now() + this.sessionTtl * 1000);

    const sessionData: SessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
      jwtToken,
      createdAt: new Date(),
      expiresAt,
      ipAddress,
      userAgent,
    };

    // Store session in Redis
    const sessionKey = this.getSessionKey(sessionId);
    await this.redisService.set(
      sessionKey,
      JSON.stringify(sessionData),
      this.sessionTtl,
    );

    // Add session to user's session list
    const userSessionsKey = this.getUserSessionsKey(user.id);
    await this.redisService.hset(userSessionsKey, sessionId, sessionKey);
    await this.redisService.expire(userSessionsKey, this.sessionTtl);

    // Store session in database for persistence
    try {
      await this.prismaService.userSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          token: jwtToken,
          expiresAt,
          isActive: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to store session in database:', error);
      // Continue with Redis-only session if database fails
    }

    this.logger.log(`Session created for user ${user.id}: ${sessionId}`);
    return sessionId;
  }

  /**
   * Validate and retrieve session data
   */
  async validateSession(sessionId: string): Promise<SessionData | null> {
    const sessionKey = this.getSessionKey(sessionId);
    const sessionDataStr = await this.redisService.get(sessionKey);

    if (!sessionDataStr) {
      // Try to get from database if not in Redis
      const dbSession = await this.prismaService.userSession.findUnique({
        where: { id: sessionId, isActive: true },
        include: { user: true },
      });

      if (!dbSession || dbSession.expiresAt < new Date()) {
        return null;
      }

      // Restore session to Redis
      const sessionData: SessionData = {
        userId: dbSession.userId,
        email: dbSession.user.email,
        role: dbSession.user.role,
        jwtToken: dbSession.token,
        createdAt: dbSession.createdAt,
        expiresAt: dbSession.expiresAt,
      };

      const ttl = Math.floor((dbSession.expiresAt.getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redisService.set(sessionKey, JSON.stringify(sessionData), ttl);
        return sessionData;
      }

      return null;
    }

    try {
      const sessionData: SessionData = JSON.parse(sessionDataStr);
      
      // Check if session has expired
      if (new Date(sessionData.expiresAt) < new Date()) {
        await this.invalidateSession(sessionId);
        return null;
      }

      return sessionData;
    } catch (error) {
      this.logger.error('Failed to parse session data:', error);
      await this.invalidateSession(sessionId);
      return null;
    }
  }

  /**
   * Invalidate a specific session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    const sessionKey = this.getSessionKey(sessionId);
    
    // Get session data to find user ID
    const sessionDataStr = await this.redisService.get(sessionKey);
    if (sessionDataStr) {
      try {
        const sessionData: SessionData = JSON.parse(sessionDataStr);
        
        // Remove from user's session list
        const userSessionsKey = this.getUserSessionsKey(sessionData.userId);
        await this.redisService.hdel(userSessionsKey, sessionId);
      } catch (error) {
        this.logger.error('Failed to parse session data during invalidation:', error);
      }
    }

    // Remove session from Redis
    await this.redisService.del(sessionKey);

    // Mark session as inactive in database
    try {
      await this.prismaService.userSession.updateMany({
        where: { id: sessionId },
        data: { isActive: false },
      });
    } catch (error) {
      this.logger.error('Failed to invalidate session in database:', error);
    }

    this.logger.log(`Session invalidated: ${sessionId}`);
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    const userSessionsKey = this.getUserSessionsKey(userId);
    const userSessions = await this.redisService.hgetall(userSessionsKey);

    // Invalidate each session
    const invalidationPromises = Object.keys(userSessions).map(sessionId =>
      this.invalidateSession(sessionId)
    );

    await Promise.all(invalidationPromises);

    // Remove user sessions hash
    await this.redisService.del(userSessionsKey);

    // Mark all user sessions as inactive in database
    try {
      await this.prismaService.userSession.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    } catch (error) {
      this.logger.error('Failed to invalidate user sessions in database:', error);
    }

    this.logger.log(`All sessions invalidated for user: ${userId}`);
  }

  /**
   * Refresh session expiration
   */
  async refreshSession(sessionId: string): Promise<boolean> {
    const sessionData = await this.validateSession(sessionId);
    if (!sessionData) {
      return false;
    }

    // Update expiration time
    const newExpiresAt = new Date(Date.now() + this.sessionTtl * 1000);
    sessionData.expiresAt = newExpiresAt;

    const sessionKey = this.getSessionKey(sessionId);
    await this.redisService.set(
      sessionKey,
      JSON.stringify(sessionData),
      this.sessionTtl,
    );

    // Update user sessions expiration
    const userSessionsKey = this.getUserSessionsKey(sessionData.userId);
    await this.redisService.expire(userSessionsKey, this.sessionTtl);

    // Update database session
    try {
      await this.prismaService.userSession.updateMany({
        where: { id: sessionId },
        data: { expiresAt: newExpiresAt },
      });
    } catch (error) {
      this.logger.error('Failed to refresh session in database:', error);
    }

    return true;
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    const userSessionsKey = this.getUserSessionsKey(userId);
    const sessionKeys = await this.redisService.hgetall(userSessionsKey);

    const sessions: SessionData[] = [];
    
    for (const sessionId of Object.keys(sessionKeys)) {
      const sessionData = await this.validateSession(sessionId);
      if (sessionData) {
        sessions.push(sessionData);
      }
    }

    return sessions;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      // Clean up expired sessions from database
      const expiredSessions = await this.prismaService.userSession.findMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isActive: false },
          ],
        },
      });

      // Remove expired sessions from Redis
      for (const session of expiredSessions) {
        const sessionKey = this.getSessionKey(session.id);
        await this.redisService.del(sessionKey);
        
        const userSessionsKey = this.getUserSessionsKey(session.userId);
        await this.redisService.hdel(userSessionsKey, session.id);
      }

      // Delete expired sessions from database
      await this.prismaService.userSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isActive: false },
          ],
        },
      });

      this.logger.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions:', error);
    }
  }

  /**
   * Validate JWT token from session
   */
  async validateSessionToken(sessionId: string): Promise<UserResponseDto | null> {
    const sessionData = await this.validateSession(sessionId);
    if (!sessionData) {
      return null;
    }

    try {
      // Verify JWT token
      const payload = this.jwtService.verify(sessionData.jwtToken) as JwtPayload;
      
      // Get fresh user data
      const user = await this.prismaService.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'ACTIVE') {
        await this.invalidateSession(sessionId);
        return null;
      }

      return new UserResponseDto(user);
    } catch (error) {
      this.logger.error('Invalid JWT token in session:', error);
      await this.invalidateSession(sessionId);
      return null;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Get Redis key for session
   */
  private getSessionKey(sessionId: string): string {
    return `${this.sessionPrefix}${sessionId}`;
  }

  /**
   * Get Redis key for user sessions
   */
  private getUserSessionsKey(userId: string): string {
    return `${this.userSessionsPrefix}${userId}`;
  }
}