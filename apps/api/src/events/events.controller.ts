import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventType, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  listPublic(
    @Query('type', new ParseEnumPipe(EventType, { optional: true }))
    type?: EventType,
  ) {
    return this.eventsService.listPublic(type);
  }

  @Get('manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  listManaged(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.eventsService.listManaged(user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  create(
    @Body() input: CreateEventDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.create(input, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  update(
    @Param('id') id: string,
    @Body() input: UpdateEventDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.update(id, input, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.remove(id, user);
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  publish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.publish(id, user);
  }

  @Patch(':id/unpublish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  unpublish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.unpublish(id, user);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.cancel(id, user);
  }

  @Patch(':id/close-registration')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  closeRegistration(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.closeRegistration(id, user);
  }

  @Get(':slug')
  getPublic(@Param('slug') slug: string) {
    return this.eventsService.getPublicBySlug(slug);
  }

  @Get('manage/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF)
  getManaged(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.eventsService.getManaged(id, user);
  }
}
