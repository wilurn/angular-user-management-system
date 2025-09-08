import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SecurityService {
  private readonly saltRounds = 12;

  /**
   * Hash a password using bcrypt
   * @param password - Plain text password to hash
   * @returns Promise<string> - Hashed password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Compare a plain text password with a hashed password
   * @param password - Plain text password
   * @param hashedPassword - Hashed password to compare against
   * @returns Promise<boolean> - True if passwords match, false otherwise
   */
  async comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * Validate password strength according to requirements
   * Requirements: minimum 8 characters with numbers and special characters
   * @param password - Password to validate
   * @returns object with isValid boolean and error messages array
   */
  validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check minimum length
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Check for at least one special character
    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate a secure random token for password reset
   * @param length - Length of the token (default: 32)
   * @returns string - Random token
   */
  generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Validate if a password meets all security requirements
   * This is a convenience method that combines validation and returns a boolean
   * @param password - Password to validate
   * @returns boolean - True if password is valid, false otherwise
   */
  isPasswordValid(password: string): boolean {
    return this.validatePasswordStrength(password).isValid;
  }
}