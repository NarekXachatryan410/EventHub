import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { catchError, concatMap, from, mergeMap, throwError, type Observable } from 'rxjs';

type AuditedRequest = {
  user?: AuthUser;
  method: string;
  path: string;
  baseUrl: string;
  route?: { path: string };
  params: Record<string, string | undefined>;
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);
  private readonly writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  constructor(private readonly prisma: PrismaService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuditedRequest>();
    const response = http.getResponse<{ statusCode: number }>();
    if (!request.user || !this.writeMethods.has(request.method)) {
      return next.handle();
    }

    const resourceId =
      request.params.id ??
      request.params.eventId ??
      request.params.registrationId ??
      request.params.taskId ??
      request.params.templateId ??
      null;
    const audit = {
      actorId: request.user.sub,
      actorRole: request.user.role,
      method: request.method,
      route: `${request.baseUrl}${request.route?.path ?? request.path}`.slice(0, 500),
      resourceId: resourceId?.slice(0, 100) ?? null,
    };

    return next.handle().pipe(
      concatMap((result) =>
        from(this.persist({ ...audit, statusCode: response.statusCode })).pipe(
          mergeMap(() => [result]),
        ),
      ),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        return from(this.persist({ ...audit, statusCode })).pipe(
          mergeMap(() => throwError(() => error)),
        );
      }),
    );
  }

  private async persist(
    data: {
      actorId: string;
      actorRole: AuthUser['role'];
      method: string;
      route: string;
      resourceId: string | null;
      statusCode: number;
    },
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      this.logger.error(
        'Could not persist an audit record',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
