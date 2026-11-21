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
}
