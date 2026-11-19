import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  CancelRegistrationDto,
  CreateRegistrationDto,
} from './dto/create-registration.dto.js';
import { RegistrationsService } from './registrations.service.js';

@Controller()
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Post('events/:eventId/register')
  register(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() input: CreateRegistrationDto,
  ) {
    return this.registrations.register(eventId, input);
  }

  @Get('events/:eventId/registrations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.registrations.list(eventId, user);
  }

  @Get('events/:eventId/registrations/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  async export(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Res() response: Response,
  ) {
    const csv = await this.registrations.exportCsv(eventId, user);
    response
      .type('text/csv')
      .attachment(`event-${eventId}-registrations.csv`)
      .send(csv);
  }

  @Post('events/:eventId/registrations/manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  registerManually(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() input: CreateRegistrationDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.registrations.registerManually(eventId, input, user);
  }

  @Get('registrations/:registrationId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  getById(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.registrations.getById(registrationId, user);
  }

  @Patch('registrations/:registrationId/cancel')
  cancelByToken(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() input: CancelRegistrationDto,
  ) {
    return this.registrations.cancelByToken(registrationId, input);
  }
}
