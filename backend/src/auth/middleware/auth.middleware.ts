import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { JwtPayload } from '../strategies/jwt.strategy';

declare global {
  namespace Express {
    interface Request {
      user?: UserResponseDto;
    }
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
      }

      const token = authHeader.substring(7);
      
      if (!token) {
        return next();
      }

      const payload: JwtPayload = this.jwtService.verify(token);
      const user = await this.usersService.findOne(payload.sub);

      if (user && user.status === 'ACTIVE') {
        req.user = user;
      }
    } catch (error) {
      // Don't throw error here, let guards handle authentication
      // This middleware just adds user to request if valid token exists
    }

    next();
  }
}