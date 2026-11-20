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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ListCrmSyncLogsDto } from './dto/list-crm-sync-logs.dto.js';
import { CrmSyncService } from './crm-sync.service.js';

@Controller('crm-sync-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class CrmSyncController {
  constructor(private readonly crmSync: CrmSyncService) {}

  @Get()
  list(@Query() query: ListCrmSyncLogsDto) {
    return this.crmSync.list(query.limit, query.cursor);
  }

  @Post(':id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.crmSync.retry(id);
  }
}
