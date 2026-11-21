import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailQueueService } from './email-queue.service.js';
import { ListEmailLogsDto } from './dto/list-email-logs.dto.js';

@Controller('email-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
export class EmailLogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueueService,
  ) {}

  @Get()
  list(
    @Query() query: ListEmailLogsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    const registrationFilter = {
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(user.role === UserRole.SUPER_ADMIN
        ? {}
        : { event: { organizerId: user.sub } }),
    };
    return this.prisma.emailLog.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.eventId || user.role !== UserRole.SUPER_ADMIN
          ? { registration: registrationFilter }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        scheduledAt: true,
        lastAttemptAt: true,
        sentAt: true,
        errorMessage: true,
        createdAt: true,
        registration: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            event: { select: { id: true, title: true } },
          },
        },
      },
    });
  }

  @Post(':id/retry')
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.emailQueue.retryFailedLog(id, user);
  }
}
