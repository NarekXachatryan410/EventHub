import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CheckInDto, ManualCheckInDto } from './dto/check-in.dto.js';
import { CheckInsService } from './check-ins.service.js';

@Controller()
export class CheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  @Get('tickets/:token')
  validateTicket(@Param('token') token: string) {
    return this.checkIns.validateTicket(token);
  }

  @Post('events/:eventId/check-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  checkIn(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() input: CheckInDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.checkIns.checkInByToken(eventId, input.token, user);
  }

  @Get('events/:eventId/check-ins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.checkIns.list(eventId, user);
  }

  @Post('events/:eventId/check-ins/manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  manual(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() input: ManualCheckInDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.checkIns.checkInManually(eventId, input.registrationId, user);
  }
}
