import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateCrmCustomerDto } from './dto/create-crm-customer.dto.js';
import { ListCrmCustomersDto } from './dto/list-crm-customers.dto.js';
import { UpdateCrmCustomerDto } from './dto/update-crm-customer.dto.js';
import { CrmActivityQueryDto, CrmNoteDto, CrmOrganizerQueryDto, CrmRegistrationQueryDto, CrmReminderDto, CrmSegmentQueryDto, CrmTagAssignmentDto, CrmTagDto, ListCrmRemindersDto, SaveCrmSegmentDto, UpdateCrmReminderDto } from './dto/crm-management.dto.js';
import { CrmService } from './crm.service.js';

@Controller('crm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('customers')
  listCustomers(
    @Query() query: ListCrmCustomersDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.crm.listCustomers(user, query);
  }

  @Post('customers')
  createCustomer(
    @Body() input: CreateCrmCustomerDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.crm.createCustomer(user, input);
  }

  @Get('customers/:id')
  getCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.crm.getCustomer(user, id);
  }

  @Get('customers/:id/registrations')
  listCustomerRegistrations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CrmRegistrationQueryDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.crm.listCustomerRegistrations(user, id, query);
  }

  @Patch('customers/:id')
  updateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateCrmCustomerDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.crm.updateCustomer(user, id, input);
  }

  @Delete('customers/:id')
  archiveCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.crm.archiveCustomer(user, id);
  }

  @Get('customers/:id/notes')
  notes(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.listNotes(user, id); }

  @Post('customers/:id/notes')
  createNote(@Param('id', ParseUUIDPipe) id: string, @Body() body: CrmNoteDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.createNote(user, id, body.content); }

  @Patch('customers/:id/notes/:noteId')
  updateNote(@Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() body: CrmNoteDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.updateNote(user, id, noteId, body.content); }

  @Delete('customers/:id/notes/:noteId')
  deleteNote(@Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.deleteNote(user, id, noteId); }

  @Get('tags')
  tags(@Query() query: CrmOrganizerQueryDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.listTags(user, query.organizerId); }

  @Post('tags')
  createTag(@Body() body: CrmTagDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.createTag(user, body); }

  @Delete('tags/:tagId')
  deleteTag(@Param('tagId', ParseUUIDPipe) tagId: string, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.deleteTag(user, tagId); }

  @Post('customers/:id/tags')
  assignTag(@Param('id', ParseUUIDPipe) id: string, @Body() body: CrmTagAssignmentDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.assignTag(user, id, body.tagId); }

  @Delete('customers/:id/tags/:tagId')
  removeTag(@Param('id', ParseUUIDPipe) id: string, @Param('tagId', ParseUUIDPipe) tagId: string, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.removeTag(user, id, tagId); }

  @Get('reminders')
  reminders(@Query() query: ListCrmRemindersDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.listReminders(user, query); }

  @Post('customers/:id/reminders')
  createReminder(@Param('id', ParseUUIDPipe) id: string, @Body() body: CrmReminderDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.createReminder(user, id, body); }

  @Patch('customers/:id/reminders/:reminderId')
  updateReminder(@Param('id', ParseUUIDPipe) id: string, @Param('reminderId', ParseUUIDPipe) reminderId: string, @Body() body: UpdateCrmReminderDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.updateReminder(user, id, reminderId, body); }

  @Post('customers/:id/reminders/:reminderId/complete')
  completeReminder(@Param('id', ParseUUIDPipe) id: string, @Param('reminderId', ParseUUIDPipe) reminderId: string, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.completeReminder(user, id, reminderId); }

  @Delete('customers/:id/reminders/:reminderId')
  deleteReminder(@Param('id', ParseUUIDPipe) id: string, @Param('reminderId', ParseUUIDPipe) reminderId: string, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.deleteReminder(user, id, reminderId); }

  @Get('customers/:id/activity')
  activity(@Param('id', ParseUUIDPipe) id: string, @Query() query: CrmActivityQueryDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.listActivity(user, id, query.limit, query.cursor); }

  @Get('segments')
  segments(@Query() query: CrmOrganizerQueryDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.listSegments(user, query.organizerId); }

  @Post('segments/preview')
  previewSegment(@Body() body: CrmSegmentQueryDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.previewSegment(user, body.criteria, body.organizerId); }

  @Post('segments')
  saveSegment(@Body() body: SaveCrmSegmentDto, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.saveSegment(user, body); }

  @Delete('segments/:segmentId')
  deleteSegment(@Param('segmentId', ParseUUIDPipe) segmentId: string, @CurrentUser() user: AuthenticatedRequest['user']) { return this.crm.deleteSegment(user, segmentId); }

  @Get('segments/:segmentId/members')
  segmentMembers(
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
    @Query() query: CrmRegistrationQueryDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.crm.listSegmentMembers(user, segmentId, query);
  }

  @Get('analytics/dashboard')
  dashboard(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.crm.dashboardAnalytics(user);
  }
}
