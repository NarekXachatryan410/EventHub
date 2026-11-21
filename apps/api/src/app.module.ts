import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuditModule } from './audit/audit.module.js';
import { CrmModule } from './crm/crm.module.js';
import { validateEnvironment } from './config/validate-environment.js';
import { EmailModule } from './email/email.module.js';
import { EventsModule } from './events/events.module.js';
import { PlanningModule } from './planning/planning.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisThrottlerStorage } from './security/redis-throttler.storage.js';
import { SecurityModule } from './security/security.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), 'apps/api/.env'),
        resolve(process.cwd(), '.env'),
      ],
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    SecurityModule,
    ThrottlerModule.forRootAsync({
      imports: [SecurityModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        storage,
      }),
    }),
    PrismaModule,
    AuthModule,
    CrmModule,
    EventsModule,
    EmailModule,
    PlanningModule,
    AnalyticsModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
