// Example usage of SecurityService
// This file demonstrates how other services can use the SecurityService

import { SecurityService } from './security.service';

export class SecurityServiceExample {
  constructor(private readonly securityService: SecurityService) {}

  async registerUser(email: string, password: string) {
    // Validate password strength
    const validation = this.securityService.validatePasswordStrength(password);
    if (!validation.isValid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Hash the password
    const hashedPassword = await this.securityService.hashPassword(password);
    
    // In a real service, you would save the user with the hashed password
    return {
      email,
      hashedPassword,
    };
  }

  async authenticateUser(password: string, hashedPassword: string) {
    // Compare the provided password with the stored hash
    const isValid = await this.securityService.comparePasswords(password, hashedPassword);
    
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    return { authenticated: true };
  }

  generatePasswordResetToken() {
    // Generate a secure token for password reset
    return this.securityService.generateSecureToken(32);
  }
}