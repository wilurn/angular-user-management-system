import { Test, TestingModule } from '@nestjs/testing';
import { SecurityService } from './security.service';

describe('SecurityService Integration Tests', () => {
  let service: SecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SecurityService],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should hash and compare passwords correctly with real bcrypt', async () => {
    const password = 'TestPassword123!';
    
    const hashedPassword = await service.hashPassword(password);
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toBe(password);
    expect(hashedPassword.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 characters

    const isMatch = await service.comparePasswords(password, hashedPassword);
    expect(isMatch).toBe(true);

    const isNotMatch = await service.comparePasswords('wrongPassword', hashedPassword);
    expect(isNotMatch).toBe(false);
  });

  it('should generate different hashes for the same password', async () => {
    const password = 'TestPassword123!';
    
    const hash1 = await service.hashPassword(password);
    const hash2 = await service.hashPassword(password);
    
    expect(hash1).not.toBe(hash2);
    
    // Both hashes should still match the original password
    expect(await service.comparePasswords(password, hash1)).toBe(true);
    expect(await service.comparePasswords(password, hash2)).toBe(true);
  });

  it('should validate password strength correctly', () => {
    // Test valid passwords
    expect(service.isPasswordValid('ValidPass123!')).toBe(true);
    expect(service.isPasswordValid('AnotherGood1@')).toBe(true);
    
    // Test invalid passwords
    expect(service.isPasswordValid('weak')).toBe(false);
    expect(service.isPasswordValid('NoNumbers!')).toBe(false);
    expect(service.isPasswordValid('nouppercasehere123!')).toBe(false);
    expect(service.isPasswordValid('NOLOWERCASEHERE123!')).toBe(false);
    expect(service.isPasswordValid('NoSpecialChars123')).toBe(false);
  });

  it('should generate secure tokens with proper characteristics', () => {
    const token1 = service.generateSecureToken();
    const token2 = service.generateSecureToken();
    const token3 = service.generateSecureToken(16);
    
    // Tokens should be different
    expect(token1).not.toBe(token2);
    expect(token1).not.toBe(token3);
    
    // Tokens should have correct length
    expect(token1).toHaveLength(32);
    expect(token2).toHaveLength(32);
    expect(token3).toHaveLength(16);
    
    // Tokens should only contain alphanumeric characters
    const alphanumericRegex = /^[A-Za-z0-9]+$/;
    expect(alphanumericRegex.test(token1)).toBe(true);
    expect(alphanumericRegex.test(token2)).toBe(true);
    expect(alphanumericRegex.test(token3)).toBe(true);
  });
});