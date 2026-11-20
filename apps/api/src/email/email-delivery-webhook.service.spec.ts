import { createHmac } from 'node:crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailDeliveryWebhookService } from './email-delivery-webhook.service.js';

describe('EmailDeliveryWebhookService', () => {
  const secret = `whsec_${Buffer.from('webhook-test-secret').toString('base64')}`;
  const payloadFor = (type: string) =>
    JSON.stringify({
      type,
      created_at: '2026-11-20T12:00:00.000Z',
      data: { email_id: 'resend-message-id' },
    });
  const prisma = {
    emailLog: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'RESEND_WEBHOOK_SECRET' ? secret : 're_test_key',
    ),
  };
  const service = new EmailDeliveryWebhookService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );

  function signedHeaders(body: string) {
    const id = 'webhook-event-id';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac(
      'sha256',
      Buffer.from(secret.slice('whsec_'.length), 'base64'),
    )
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    return {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['email.delivered', EmailStatus.DELIVERED],
    ['email.delivery_delayed', EmailStatus.DELIVERY_DELAYED],
    ['email.bounced', EmailStatus.BOUNCED],
    ['email.complained', EmailStatus.COMPLAINED],
    ['email.suppressed', EmailStatus.SUPPRESSED],
    ['email.failed', EmailStatus.FAILED],
  ])('updates the log for a verified %s event', async (type, status) => {
    const payload = payloadFor(type);
    prisma.emailLog.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.receive(payload, signedHeaders(payload)),
    ).resolves.toEqual({ received: true });

    expect(prisma.emailLog.updateMany).toHaveBeenCalledWith({
      where: {
        providerId: 'resend-message-id',
        status: {
          in: [EmailStatus.SENT, EmailStatus.DELIVERY_DELAYED, status],
        },
      },
      data: { status },
    });
  });

  it('rejects invalid webhook signatures', async () => {
    const payload = payloadFor('email.delivered');
    await expect(
      service.receive(payload, {
        'svix-id': 'webhook-event-id',
        'svix-timestamp': `${Math.floor(Date.now() / 1000)}`,
        'svix-signature': 'v1,invalid',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.emailLog.updateMany).not.toHaveBeenCalled();
  });

  it('acknowledges stale events for known messages without regressing status', async () => {
    const payload = payloadFor('email.delivered');
    prisma.emailLog.updateMany.mockResolvedValue({ count: 0 });
    prisma.emailLog.findFirst.mockResolvedValue({ id: 'email-log-id' });

    await expect(
      service.receive(payload, signedHeaders(payload)),
    ).resolves.toEqual({
      received: true,
    });
    expect(prisma.emailLog.findFirst).toHaveBeenCalledWith({
      where: { providerId: 'resend-message-id' },
      select: { id: true },
    });
  });

  it('asks the provider to retry events that arrive before their email log', async () => {
    const payload = payloadFor('email.delivered');
    prisma.emailLog.updateMany.mockResolvedValue({ count: 0 });
    prisma.emailLog.findFirst.mockResolvedValue(null);

    await expect(
      service.receive(payload, signedHeaders(payload)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
