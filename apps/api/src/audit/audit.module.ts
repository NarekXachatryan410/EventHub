import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { AuditLogInterceptor } from './audit-log.interceptor.js';
import { AuditLogsController } from './audit-logs.controller.js';
import { AuditLogsService } from './audit-logs.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AuditLogsController],
  providers: [
    AuditLogsService,
    AuditLogInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: AuditLogInterceptor },
  ],
})
export class AuditModule {}
