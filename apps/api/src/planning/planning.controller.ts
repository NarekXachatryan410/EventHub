import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateChecklistDto } from './dto/create-checklist.dto.js';
import { CreatePlanningTaskDto } from './dto/create-planning-task.dto.js';
import { CreatePlanningTemplateDto } from './dto/create-planning-template.dto.js';
import { UpdatePlanningTaskDto } from './dto/update-planning-task.dto.js';
import { UpdatePlanningTemplateDto } from './dto/update-planning-template.dto.js';
import { PlanningService } from './planning.service.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get('planning/templates')
  listTemplates() {
    return this.planning.listTemplates();
  }

  @Post('planning/templates')
  createTemplate(
    @Body() input: CreatePlanningTemplateDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.planning.createTemplate(input, user);
  }

  @Patch('planning/templates/:templateId')
  updateTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() input: UpdatePlanningTemplateDto,
  ) {
    return this.planning.updateTemplate(templateId, input);
  }

  @Get('planning/staff')
  listAssignableStaff() {
    return this.planning.listAssignableStaff();
  }

  @Get('events/:eventId/planning-checklist')
  getChecklist(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.planning.getChecklist(eventId, user);
  }

  @Post('events/:eventId/planning-checklist')
  createChecklist(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() input: CreateChecklistDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.planning.createChecklist(eventId, input, user);
  }

  @Post('events/:eventId/planning-checklist/tasks')
  addTask(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() input: CreatePlanningTaskDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.planning.addTask(eventId, input, user);
  }

  @Patch('planning/tasks/:taskId')
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() input: UpdatePlanningTaskDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.planning.updateTask(taskId, input, user);
  }

  @Delete('planning/tasks/:taskId')
  deleteTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.planning.deleteTask(taskId, user);
  }
}
