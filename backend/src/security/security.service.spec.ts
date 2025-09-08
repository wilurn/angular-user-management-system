import { Test, TestingModule } from '@nestjs/testing';
import { SecurityService } from './security.service';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('SecurityService', () => {
  let service: SecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SecurityService],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
    
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hashPassword', () => {
    it('should hash a password using bcrypt with 12 salt rounds', async () => {
      const password = 'testPassword123!';
      const hashedPassword = 'hashedPassword123';
      
      mockedBcrypt.hash.mockResolvedValue(hashedPassword as never);

      const result = await service.hashPassword(password);

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });

    it('should handle bcrypt errors', async () => {
      const password = 'testPassword123!';
      const error = new Error('Bcrypt error');
      
      mockedBcrypt.hash.mockRejectedValue(error);

      await expect(service.hashPassword(password)).rejects.toThrow('Bcrypt error');
    });
  });

  describe('comparePasswords', () => {
    it('should return true when passwords match', async () => {
      const password = 'testPassword123!';
      const hashedPassword = 'hashedPassword123';
      
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.comparePasswords(password, hashedPassword);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should return false when passwords do not match', async () => {
      const password = 'testPassword123!';
      const hashedPassword = 'hashedPassword123';
      
      mockedBcrypt.compare.mockResolvedValue(false as never);

      const result = await service.comparePasswords(password, hashedPassword);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(false);
    });

    it('should handle bcrypt comparison errors', async () => {
      const password = 'testPassword123!';
      const hashedPassword = 'hashedPassword123';
      const error = new Error('Bcrypt comparison error');
      
      mockedBcrypt.compare.mockRejectedValue(error);

      await expect(service.comparePasswords(password, hashedPassword)).rejects.toThrow('Bcrypt comparison error');
    });
  });

  describe('validatePasswordStrength', () => {
    it('should return valid for a strong password', () => {
      const strongPassword = 'StrongPass123!';
      
      const result = service.validatePasswordStrength(strongPassword);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for password shorter than 8 characters', () => {
      const shortPassword = 'Short1!';
      
      const result = service.validatePasswordStrength(shortPassword);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should return invalid for password without lowercase letter', () => {
      const password = 'PASSWORD123!';
      
      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should return invalid for password without uppercase letter', () => {
      const password = 'password123!';
      
      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should return invalid for password without number', () => {
      const password = 'Password!';
      
      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should return invalid for password without special character', () => {
      const password = 'Password123';
      
      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character (@$!%*?&)');
    });

    it('should return multiple errors for password with multiple issues', () => {
      const weakPassword = 'weak';
      
      const result = service.validatePasswordStrength(weakPassword);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character (@$!%*?&)');
    });

    it('should accept all valid special characters', () => {
      const passwords = [
        'Password123@',
        'Password123$',
        'Password123!',
        'Password123%',
        'Password123*',
        'Password123?',
        'Password123&',
      ];

      passwords.forEach(password => {
        const result = service.validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('generateSecureToken', () => {
    it('should generate a token with default length of 32', () => {
      const token = service.generateSecureToken();

      expect(token).toHaveLength(32);
      expect(typeof token).toBe('string');
    });

    it('should generate a token with specified length', () => {
      const length = 16;
      const token = service.generateSecureToken(length);

      expect(token).toHaveLength(length);
      expect(typeof token).toBe('string');
    });

    it('should generate different tokens on multiple calls', () => {
      const token1 = service.generateSecureToken();
      const token2 = service.generateSecureToken();

      expect(token1).not.toBe(token2);
    });

    it('should only contain valid characters', () => {
      const token = service.generateSecureToken(100);
      const validChars = /^[A-Za-z0-9]+$/;

      expect(validChars.test(token)).toBe(true);
    });
  });

  describe('isPasswordValid', () => {
    it('should return true for valid password', () => {
      const validPassword = 'ValidPass123!';
      
      const result = service.isPasswordValid(validPassword);

      expect(result).toBe(true);
    });

    it('should return false for invalid password', () => {
      const invalidPassword = 'weak';
      
      const result = service.isPasswordValid(invalidPassword);

      expect(result).toBe(false);
    });
  });


});