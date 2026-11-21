import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { EmailProcessor } from './email.processor.js';
import { EmailDeliveryWebhookService } from './email-delivery-webhook.service.js';
import { EmailLogsController } from './email-logs.controller.js';
import { EmailWebhooksController } from './email-webhooks.controller.js';
import { EmailQueueService } from './email-queue.service.js';
import { EmailTemplatesController } from './email-templates.controller.js';
import { EmailPayloadCipher } from './email-payload-cipher.service.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { EMAIL_QUEUE } from './email.types.js';
import { createBullRedisConnectionOptions } from './redis-connection.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          connection: createBullRedisConnectionOptions(
            config.get<string>('REDIS_URL'),
          ),
        };
      },
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  controllers: [
    EmailTemplatesController,
    EmailLogsController,
    EmailWebhooksController,
  ],
  providers: [
    EmailPayloadCipher,
    EmailProcessor,
    EmailDeliveryWebhookService,
    EmailQueueService,
    EmailTemplatesService,
  ],
  exports: [EmailPayloadCipher, EmailQueueService, EmailTemplatesService],
})
export class EmailModule {}
