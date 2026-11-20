import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailStatus } from '@prisma/client';
import { Resend, type WebhookEventPayload } from 'resend';
import type { IncomingHttpHeaders } from 'node:http';
import { PrismaService } from '../prisma/prisma.service.js';

const deliveryStatuses: Partial<Record<string, EmailStatus>> = {
  'email.delivered': EmailStatus.DELIVERED,
  'email.delivery_delayed': EmailStatus.DELIVERY_DELAYED,
  'email.bounced': EmailStatus.BOUNCED,
  'email.complained': EmailStatus.COMPLAINED,
  'email.suppressed': EmailStatus.SUPPRESSED,
  'email.failed': EmailStatus.FAILED,
};

@Injectable()
export class EmailDeliveryWebhookService {
  private readonly logger = new Logger(EmailDeliveryWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async receive(
    payload: string,
    incomingHeaders: IncomingHttpHeaders,
  ): Promise<{ received: true }> {
    const secret = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!secret || !apiKey) {
      throw new ServiceUnavailableException(
        'Resend webhook configuration is incomplete',
      );
    }

    let event: WebhookEventPayload;
    try {
      event = new Resend(apiKey).webhooks.verify({
        payload,
        webhookSecret: secret,
        headers: {
          id: headerValue(incomingHeaders['svix-id']),
          timestamp: headerValue(incomingHeaders['svix-timestamp']),
          signature: headerValue(incomingHeaders['svix-signature']),
        },
      });
    } catch {
      throw new UnauthorizedException('Invalid Resend webhook signature');
    }

    const status = deliveryStatuses[event.type];
    if (!status || !('email_id' in event.data)) {
      return { received: true };
    }
    const result = await this.prisma.emailLog.updateMany({
      where: {
        providerId: event.data.email_id,
        status: {
          in: [EmailStatus.SENT, EmailStatus.DELIVERY_DELAYED, status],
        },
      },
      data: { status },
    });
    if (result.count === 0) {
      const existing = await this.prisma.emailLog.findFirst({
        where: { providerId: event.data.email_id },
        select: { id: true },
      });
      if (existing) return { received: true };
      this.logger.warn(
        `Resend webhook ${event.type} referenced an unknown provider message`,
      );
      throw new ServiceUnavailableException(
        'Email delivery record is not available yet',
      );
    }
    return { received: true };
  }
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
