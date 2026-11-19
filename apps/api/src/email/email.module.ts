import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { EmailProcessor } from './email.processor.js';
import { EmailQueueService } from './email-queue.service.js';
import { EmailTemplatesController } from './email-templates.controller.js';
import { EmailPayloadCipher } from './email-payload-cipher.service.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { EMAIL_QUEUE } from './email.types.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        );
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            ...(redisUrl.password
              ? { password: decodeURIComponent(redisUrl.password) }
              : {}),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  controllers: [EmailTemplatesController],
  providers: [
    EmailPayloadCipher,
    EmailProcessor,
    EmailQueueService,
    EmailTemplatesService,
  ],
  exports: [EmailPayloadCipher, EmailQueueService, EmailTemplatesService],
})
export class EmailModule {}
