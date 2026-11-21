import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
