import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  listStaff() {
    return this.authService.listStaff();
  }

  @Post()
  createStaff(
    @Body() input: CreateStaffDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.authService.createStaff(input, user.sub);
  }

  @Patch(':id')
  updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateStaffDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.authService.updateStaff(id, input, user.sub);
  }

  @Patch(':id/status')
  updateStaffStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateStaffStatusDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.authService.updateStaffStatus(id, input.isActive, user.sub);
  }
}
