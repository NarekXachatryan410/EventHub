import { jest } from '@jest/globals';
import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EmailStatus, EmailType } from '@prisma/client';
import { EmailQueueService } from './email-queue.service.js';

describe('EmailQueueService event reminders', () => {
  const registrationId = 'registration-id';
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const sourcePayload = {
    to: 'ada@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    eventTitle: 'Old event title',
    eventDate: '2030-05-10T09:00:00.000Z',
    eventLocation: 'Old location',
    eventUrl: 'https://events.example.test/events/old-event',
    ticketUrl: 'https://events.example.test/tickets/secret-token',
    cancellationUrl: 'https://events.example.test/registrations/cancel?token=secret',
  };

  let transaction: {
    eventRegistration: { findMany: jest.Mock };
    emailLog: { update: jest.Mock; upsert: jest.Mock };
  };
  let prisma: {
    emailLog: { findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let cipher: { decrypt: jest.Mock; encrypt: jest.Mock };
  let config: { get: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let service: EmailQueueService;

  beforeEach(() => {
    transaction = {
      eventRegistration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: registrationId,
            emailLogs: [
              {
                type: EmailType.REGISTRATION_CONFIRMATION,
                status: EmailStatus.SENT,
                idempotencyKey: `registration-confirmed:${registrationId}`,
                payloadCiphertext: 'confirmation-payload',
              },
              {
                type: EmailType.EVENT_REMINDER,
                status: EmailStatus.PENDING,
                idempotencyKey: `event-reminder:${registrationId}:24`,
                payloadCiphertext: 'old-reminder-payload',
              },
              {
                type: EmailType.EVENT_REMINDER,
                status: EmailStatus.PENDING,
                idempotencyKey: `event-reminder:${registrationId}:48`,
                payloadCiphertext: 'removed-reminder-payload',
              },
            ],
          },
        ]),
      },
      emailLog: {
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({ id: 'new-reminder-id' }),
      },
    };
    cipher = {
      decrypt: jest.fn().mockReturnValue(sourcePayload),
      encrypt: jest.fn().mockReturnValue('updated-encrypted-payload'),
    };
    prisma = {
      emailLog: {
        findUnique: jest.fn().mockResolvedValue({ status: EmailStatus.FAILED }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'RESEND_API_KEY' ? 'key' : 'sender@example.test',
      ),
    };
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(undefined),
    };
    service = new EmailQueueService(
      prisma as never,
      cipher as never,
      config as never,
      queue as never,
    );
  });

  it('updates configured reminders, cancels removed offsets, and adds new offsets', async () => {
    const event = {
      id: 'event-id',
      slug: 'updated-event',
      title: 'Updated event title',
      location: 'Updated location',
      startDate,
      reminderOffsetsHours: [24, 2],
    };

    await service.synchronizeEventReminders(transaction as never, event);

    expect(transaction.emailLog.update).toHaveBeenCalledWith({
      where: { idempotencyKey: `event-reminder:${registrationId}:24` },
      data: {
        scheduledAt: new Date(startDate.getTime() - 24 * 60 * 60 * 1000),
        payloadCiphertext: 'updated-encrypted-payload',
        errorMessage: null,
      },
    });
    expect(transaction.emailLog.update).toHaveBeenCalledWith({
      where: { idempotencyKey: `event-reminder:${registrationId}:48` },
      data: {
        status: EmailStatus.CANCELLED,
        errorMessage: 'Reminder no longer applies to the event schedule',
      },
    });
    expect(transaction.emailLog.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: `event-reminder:${registrationId}:2` },
      create: expect.objectContaining({
        registrationId,
        type: EmailType.EVENT_REMINDER,
        idempotencyKey: `event-reminder:${registrationId}:2`,
        scheduledAt: new Date(startDate.getTime() - 2 * 60 * 60 * 1000),
        payloadCiphertext: 'updated-encrypted-payload',
      }),
      update: {},
    });
    expect(cipher.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTitle: event.title,
        eventDate: event.startDate.toISOString(),
        eventLocation: event.location,
        eventUrl: 'https://events.example.test/events/updated-event',
        ticketUrl: sourcePayload.ticketUrl,
        cancellationUrl: sourcePayload.cancellationUrl,
      }),
    );
  });

  it('cancels pending reminders when the event start is in the past', async () => {
    transaction.eventRegistration.findMany.mockResolvedValue([
      {
        id: registrationId,
        emailLogs: [
          {
            type: EmailType.EVENT_REMINDER,
            status: EmailStatus.PENDING,
            idempotencyKey: `event-reminder:${registrationId}:24`,
            payloadCiphertext: 'old-reminder-payload',
          },
        ],
      },
    ]);

    await service.synchronizeEventReminders(transaction as never, {
      id: 'event-id',
      slug: 'updated-event',
      title: 'Updated event title',
      location: 'Updated location',
      startDate: new Date(Date.now() - 60_000),
      reminderOffsetsHours: [24],
    });

    expect(transaction.emailLog.update).toHaveBeenCalledWith({
      where: { idempotencyKey: `event-reminder:${registrationId}:24` },
      data: {
        status: EmailStatus.CANCELLED,
        errorMessage: 'Reminder no longer applies to the event schedule',
      },
    });
    expect(cipher.decrypt).not.toHaveBeenCalled();
    expect(transaction.emailLog.upsert).not.toHaveBeenCalled();
  });

  it('resets and queues a failed email after checking provider configuration', async () => {
    await expect(service.retryFailedLog('email-log-id')).resolves.toEqual({
      success: true,
    });

    expect(prisma.emailLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'email-log-id', status: EmailStatus.FAILED },
      data: {
        status: EmailStatus.PENDING,
        attempts: 0,
        lastAttemptAt: null,
        errorMessage: null,
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      { emailLogId: 'email-log-id' },
      expect.objectContaining({ jobId: 'email-email-log-id' }),
    );
  });

  it('does not retry while Resend configuration is missing', async () => {
    config.get.mockReturnValue('');

    await expect(
      service.retryFailedLog('email-log-id'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.emailLog.updateMany).not.toHaveBeenCalled();
  });

  it('does not retry logs that are not failed', async () => {
    prisma.emailLog.findUnique.mockResolvedValue({ status: EmailStatus.SENT });

    await expect(
      service.retryFailedLog('email-log-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.emailLog.updateMany).not.toHaveBeenCalled();
  });
});
