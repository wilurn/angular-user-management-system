import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private isConnected = false;
  private connectionRetries = 0;
  private readonly maxRetries = 5;
  private readonly retryDelay = 2000; // 2 seconds

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.isConnected = false;
      this.logger.log('Disconnected from database');
    } catch (error) {
      this.logger.error('Error disconnecting from database:', error);
    }
  }

  /**
   * Connect to database with retry logic
   */
  private async connectWithRetry(): Promise<void> {
    while (this.connectionRetries < this.maxRetries) {
      try {
        await this.$connect();
        this.isConnected = true;
        this.connectionRetries = 0;
        this.logger.log('Successfully connected to database');
        return;
      } catch (error) {
        this.connectionRetries++;
        this.logger.error(
          `Database connection attempt ${this.connectionRetries}/${this.maxRetries} failed:`,
          error,
        );

        if (this.connectionRetries >= this.maxRetries) {
          this.logger.error('Max connection retries reached. Giving up.');
          throw new Error(
            `Failed to connect to database after ${this.maxRetries} attempts: ${error}`,
          );
        }

        this.logger.log(
          `Retrying database connection in ${this.retryDelay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    isConnected: boolean;
    retries: number;
    maxRetries: number;
  } {
    return {
      isConnected: this.isConnected,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * Health check for database connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      this.isConnected = true;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Detailed health check with connection info
   */
  async detailedHealthCheck(): Promise<{
    isHealthy: boolean;
    connectionStatus: string;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      await this.$queryRaw`SELECT 1 as health_check`;
      const responseTime = Date.now() - startTime;

      return {
        isHealthy: true,
        connectionStatus: 'connected',
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Detailed health check failed:', error);

      return {
        isHealthy: false,
        connectionStatus: 'disconnected',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test database operations
   */
  async testDatabaseOperations(): Promise<{
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let canRead = false;
    let canWrite = false;
    let canDelete = false;

    try {
      // Test read operation
      await this.user.findMany({ take: 1 });
      canRead = true;
    } catch (error) {
      errors.push(
        `Read test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    try {
      // Test write operation with a test record
      const testUser = await this.user.create({
        data: {
          email: `health-check-${Date.now()}@test.com`,
          name: 'Health Check User',
          password: 'test-password',
        },
      });
      canWrite = true;

      // Test delete operation
      await this.user.delete({
        where: { id: testUser.id },
      });
      canDelete = true;
    } catch (error) {
      if (!canWrite) {
        errors.push(
          `Write test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      } else {
        errors.push(
          `Delete test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return {
      canRead,
      canWrite,
      canDelete,
      errors,
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.userSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired sessions`);
      }

      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up expired password reset tokens
   */
  async cleanupExpiredPasswordResets(): Promise<number> {
    try {
      const result = await this.passwordReset.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Cleaned up ${result.count} expired password reset tokens`,
        );
      }

      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired password resets:', error);
      throw error;
    }
  }
}
