import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async checkHealth() {
    const dbHealthy = await this.prismaService.healthCheck();
    const connectionStatus = this.prismaService.getConnectionStatus();
    
    return {
      status: dbHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      connection: connectionStatus,
    };
  }

  @Get('database')
  async checkDatabase() {
    const healthCheck = await this.prismaService.detailedHealthCheck();
    
    if (!healthCheck.isHealthy) {
      throw new HttpException(
        {
          status: 'error',
          message: 'Database connection failed',
          error: healthCheck.error,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    
    return {
      status: 'ok',
      database: 'connected',
      responseTime: healthCheck.responseTime,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('database/detailed')
  async checkDatabaseDetailed() {
    const healthCheck = await this.prismaService.detailedHealthCheck();
    const connectionStatus = this.prismaService.getConnectionStatus();
    
    return {
      ...healthCheck,
      connection: connectionStatus,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('database/operations')
  async testDatabaseOperations() {
    const operationsTest = await this.prismaService.testDatabaseOperations();
    
    const allOperationsWorking = 
      operationsTest.canRead && 
      operationsTest.canWrite && 
      operationsTest.canDelete;
    
    if (!allOperationsWorking) {
      throw new HttpException(
        {
          status: 'error',
          message: 'Some database operations failed',
          operations: operationsTest,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    
    return {
      status: 'ok',
      message: 'All database operations working correctly',
      operations: operationsTest,
      timestamp: new Date().toISOString(),
    };
  }
}