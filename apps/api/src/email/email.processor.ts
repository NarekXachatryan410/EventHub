import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
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
    if (log.scheduledAt.getTime() > Date.now()) {
      return;
    }
    if (!log.payloadCiphertext) {
      throw new Error(`Email log ${log.id} has no encrypted delivery payload`);
    }

    let recipient = 'unknown';
    let providerHttpStatus: number | null = null;
    try {
      const apiKey = this.config.get<string>('RESEND_API_KEY');
      const sender = this.config.get<string>('RESEND_FROM_EMAIL');
      if (!apiKey || !sender) {
        throw new Error(
          'RESEND_API_KEY and RESEND_FROM_EMAIL must be configured',
        );
      }
      const payload = this.cipher.decrypt(log.payloadCiphertext);
      recipient = payload.to;
      if (log.type === 'REGISTRATION_CONFIRMATION' && !payload.qrCodeBase64) {
        throw new Error(
          'Registration confirmation is missing its ticket QR code',
        );
      }
      const content = await this.templates.render(log.type, payload);
      const resend = new Resend(apiKey);
      this.logger.log(
        JSON.stringify({
          event: 'email.send.attempt',
          emailLogId: log.id,
          emailType: log.type,
          recipient: maskEmail(recipient),
        }),
      );
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
        providerHttpStatus = error.statusCode;
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
      this.logger.log(
        JSON.stringify({
          event: 'email.send.accepted',
          emailLogId: log.id,
          emailType: log.type,
          recipient: maskEmail(recipient),
          resendResponseId: data?.id ?? null,
        }),
      );
    } catch (error) {
      const attempts = job.attemptsMade + 1;
      const providerErrorMessage =
        error instanceof Error ? error.message : 'Unknown email error';
      const permanentSenderError = isPermanentSenderError(providerErrorMessage);
      const errorMessage = describeDeliveryError(
        redactEmailAddresses(providerErrorMessage),
      );
      const isFinalAttempt =
        permanentSenderError || attempts >= (job.opts.attempts ?? 1);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          attempts,
          lastAttemptAt: new Date(),
          ...(isFinalAttempt
            ? {
                status: 'FAILED',
                errorMessage,
              }
            : {}),
        },
      });
      this.logger.error(
        JSON.stringify({
          event: 'email.send.failed',
          emailLogId: log.id,
          emailType: log.type,
          attempt: attempts,
          recipient: maskEmail(recipient),
          httpStatus: providerHttpStatus ?? errorStatusCode(error),
          errorMessage: redactEmailAddresses(providerErrorMessage),
        }),
      );
      if (permanentSenderError) {
        throw new UnrecoverableError(errorMessage);
      }
      throw error;
    }
  }
}

export function maskEmail(address: string): string {
  const separator = address.lastIndexOf('@');
  if (separator <= 0 || separator === address.length - 1) return '[invalid email]';
  return `${address[0]}***${address.slice(separator)}`;
}

function redactEmailAddresses(message: string): string {
  return message.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    (address) => maskEmail(address),
  );
}

function errorStatusCode(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }
  return null;
}

export function isPermanentSenderError(message: string): boolean {
  return /domain is not verified|sender address is not verified|only send testing emails to your own email address|verify a domain at resend\.com\/domains/i.test(
    message,
  );
}

export function describeDeliveryError(message: string): string {
  if (/only send testing emails to your own email address/i.test(message)) {
    return 'Resend rejected this recipient because the configured sender is in testing mode. Verify a sending domain in Resend, set RESEND_FROM_EMAIL to an address on that verified domain, redeploy, then retry this email.';
  }
  if (/domain is not verified|sender address is not verified|verify a domain at resend\.com\/domains/i.test(message)) {
    return 'Resend rejected the configured sender. Verify its domain in Resend, set RESEND_FROM_EMAIL to an address on that verified domain, redeploy, then retry this email.';
  }
  return message;
}
