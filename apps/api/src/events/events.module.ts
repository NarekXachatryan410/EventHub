import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CrmModule } from '../crm/crm.module.js';
import { EmailModule } from '../email/email.module.js';
import { EventAccessService } from './event-access.service.js';
import { CheckInsController } from './check-ins.controller.js';
import { CheckInsService } from './check-ins.service.js';
import { EventsController } from './events.controller.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';
import { EventsService } from './events.service.js';
import { RegistrationsController } from './registrations.controller.js';
import { RegistrationsService } from './registrations.service.js';

@Module({
  imports: [AuthModule, CrmModule, EmailModule],
  controllers: [
    EventsController,
    RegistrationsController,
    CheckInsController,
    FeedbackController,
  ],
  providers: [
    EventAccessService,
    EventsService,
    RegistrationsService,
    CheckInsService,
    FeedbackService,
  ],
  exports: [
    EventAccessService,
    EventsService,
    RegistrationsService,
    CheckInsService,
    FeedbackService,
  ],
})
export class EventsModule {}
