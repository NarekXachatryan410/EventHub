import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { CrmSyncController } from './crm-sync.controller.js';
import { CrmSyncService } from './crm-sync.service.js';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [CrmSyncController],
  providers: [CrmSyncService],
  exports: [CrmSyncService],
})
export class CrmModule {}
