import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailPayloadCipher } from './email-payload-cipher.service.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { EMAIL_QUEUE } from './email.types.js';

interface DeliveryJob {
  emailLogId: string;
}

@Injectable()
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cipher: EmailPayloadCipher,
    private readonly templates: EmailTemplatesService,
  ) {
    super();
  }

  async process(job: Job<DeliveryJob>): Promise<void> {
    const log = await this.prisma.emailLog.findUnique({
      where: { id: job.data.emailLogId },
    });
    if (!log) {
      throw new Error(`Email log ${job.data.emailLogId} no longer exists`);
    }
    if (log.status !== 'PENDING') {
      return;
    }
    if (!log.payloadCiphertext) {
      throw new Error(`Email log ${log.id} has no encrypted delivery payload`);
    }

    try {
      const apiKey = this.config.get<string>('RESEND_API_KEY');
      const sender = this.config.get<string>('RESEND_FROM_EMAIL');
      if (!apiKey || !sender) {
        throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL must be configured');
      }
      const payload = this.cipher.decrypt(log.payloadCiphertext);
      const content = await this.templates.render(log.type, payload);
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: sender,
        to: payload.to,
        subject: content.subject,
        html: content.html,
        ...(content.text ? { text: content.text } : {}),
        ...(payload.qrCodeBase64
          ? {
              attachments: [
                {
                  filename: 'eventhub-ticket.png',
                  content: payload.qrCodeBase64,
                  contentId: 'eventhub-ticket',
                  contentType: 'image/png',
                },
              ],
            }
          : {}),
      });
      if (error) {
        throw new Error(`Resend delivery failed: ${error.message}`);
      }

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          providerId: data?.id,
          sentAt: new Date(),
          lastAttemptAt: new Date(),
          attempts: { increment: 1 },
          errorMessage: null,
        },
      });
    } catch (error) {
      const attempts = job.attemptsMade + 1;
      const isFinalAttempt = attempts >= (job.opts.attempts ?? 1);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          attempts,
          lastAttemptAt: new Date(),
          ...(isFinalAttempt
            ? {
                status: 'FAILED',
                errorMessage:
                  error instanceof Error ? error.message : 'Unknown email error',
              }
            : {}),
        },
      });
      this.logger.error(
        `Email delivery attempt ${attempts} failed for log ${log.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
