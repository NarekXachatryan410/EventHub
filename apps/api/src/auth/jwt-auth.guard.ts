import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.eventhub_auth;
    if (!token) {
      throw new UnauthorizedException('Staff login is required');
    }

    let payload: AuthUser;
    try {
      payload = await this.jwtService.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired login token');
    }
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException('Invalid login token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || !user.isActive || user.role !== payload.role) {
      throw new UnauthorizedException('Staff account is inactive or has changed');
    }
    request.user = { sub: user.id, role: user.role };
    return true;
  }
}
