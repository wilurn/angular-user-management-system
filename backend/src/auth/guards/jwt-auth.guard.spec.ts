import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('handleRequest', () => {
    const mockContext = {} as ExecutionContext;
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
    };

    it('should return user when authentication is successful', () => {
      const result = guard.handleRequest(null, mockUser, null, mockContext);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when user is null', () => {
      expect(() => {
        guard.handleRequest(null, null, null, mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is undefined', () => {
      expect(() => {
        guard.handleRequest(null, undefined, null, mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should throw the original error when err is provided', () => {
      const originalError = new Error('Original error');

      expect(() => {
        guard.handleRequest(originalError, mockUser, null, mockContext);
      }).toThrow(originalError);
    });

    it('should throw UnauthorizedException when both err and user are null', () => {
      expect(() => {
        guard.handleRequest(null, null, null, mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should prioritize err over missing user', () => {
      const originalError = new Error('Original error');

      expect(() => {
        guard.handleRequest(originalError, null, null, mockContext);
      }).toThrow(originalError);
    });
  });
});