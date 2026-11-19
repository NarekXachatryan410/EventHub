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
import { SubmitFeedbackDto } from './dto/submit-feedback.dto.js';
import { FeedbackService } from './feedback.service.js';

@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post('feedback')
  submit(@Body() input: SubmitFeedbackDto) {
    return this.feedback.submit(input);
  }

  @Get('events/:eventId/feedback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.feedback.list(eventId, user);
  }

  @Get('events/:eventId/feedback/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
  analytics(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.feedback.analytics(eventId, user);
  }
}
