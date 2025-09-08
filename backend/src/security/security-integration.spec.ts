import { Test, TestingModule } from '@nestjs/testing';
import { SecurityService } from './security.service';
import { SecurityModule } from './security.module';

describe('SecurityService Module Integration', () => {
  let service: SecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [SecurityModule],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
  });

  it('should be defined when imported via module', () => {
    expect(service).toBeDefined();
  });

  it('should be able to hash and validate passwords', async () => {
    const password = 'TestPassword123!';
    
    // Test password validation
    expect(service.isPasswordValid(password)).toBe(true);
    expect(service.isPasswordValid('weak')).toBe(false);
    
    // Test password hashing and comparison
    const hashedPassword = await service.hashPassword(password);
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toBe(password);
    
    const isMatch = await service.comparePasswords(password, hashedPassword);
    expect(isMatch).toBe(true);
    
    const isNotMatch = await service.comparePasswords('wrongPassword', hashedPassword);
    expect(isNotMatch).toBe(false);
  });

  it('should generate secure tokens', () => {
    const token1 = service.generateSecureToken();
    const token2 = service.generateSecureToken(16);
    
    expect(token1).toHaveLength(32);
    expect(token2).toHaveLength(16);
    expect(token1).not.toBe(token2);
  });
});