import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: RedisThrottlerStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new RedisThrottlerStorage(config.getOrThrow<string>('REDIS_URL')),
    },
  ],
  exports: [RedisThrottlerStorage],
})
export class SecurityModule {}
