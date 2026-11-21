import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.eventhub_auth;
    if (!token) {
      throw new UnauthorizedException('Staff login is required');
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
      const origin = request.get('origin');
      if (origin) {
        let configuredOrigin: string;
        try {
          configuredOrigin = new URL(
            this.config.getOrThrow<string>('WEB_ORIGIN'),
          ).origin;
        } catch {
          throw new ForbiddenException('Request origin is not allowed');
        }
        if (origin === 'null' || origin !== configuredOrigin) {
          throw new ForbiddenException('Request origin is not allowed');
        }
      }
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
