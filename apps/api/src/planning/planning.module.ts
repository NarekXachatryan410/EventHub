import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EventAccessService } from '../events/event-access.service.js';
import { PlanningController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PlanningController],
  providers: [EventAccessService, PlanningService],
})
export class PlanningModule {}
