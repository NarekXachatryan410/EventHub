import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  EmailStatus,
  EmailType,
  Prisma,
  RegistrationStatus,
  UserRole,
  type Event,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EmailPayload } from './email.types.js';
import { EMAIL_QUEUE } from './email.types.js';
import { EmailPayloadCipher } from './email-payload-cipher.service.js';
import type { AuthUser } from '../auth/auth.types.js';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: EmailPayloadCipher,
    private readonly config: ConfigService,
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
  ) {}

  async createOutboxEntry(
    transaction: Prisma.TransactionClient,
    input: {
      registrationId: string;
      type: EmailType;
      idempotencyKey: string;
      payload: EmailPayload;
      scheduledAt?: Date;
    },
  ) {
    const encryptedPayload = this.cipher.encrypt(input.payload);
    return transaction.emailLog.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        registrationId: input.registrationId,
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        payloadCiphertext: encryptedPayload,
        scheduledAt: input.scheduledAt,
      },
      update: {},
    });
  }

  async synchronizeEventReminders(
    transaction: Prisma.TransactionClient,
    event: Pick<
      Event,
      'id' | 'slug' | 'title' | 'location' | 'startDate' | 'reminderOffsetsHours'
    >,
  ): Promise<void> {
    const registrations = await transaction.eventRegistration.findMany({
      where: { eventId: event.id, status: RegistrationStatus.CONFIRMED },
      select: {
        id: true,
        emailLogs: {
          where: {
            type: {
              in: [EmailType.EVENT_REMINDER, EmailType.REGISTRATION_CONFIRMATION],
            },
          },
          select: {
            type: true,
            status: true,
            idempotencyKey: true,
            payloadCiphertext: true,
          },
        },
      },
    });

    const now = Date.now();
    const desiredSchedules = new Map<number, Date>();
    if (event.startDate.getTime() > now) {
      for (const offset of new Set(event.reminderOffsetsHours)) {
        const scheduledAt = new Date(
          event.startDate.getTime() - offset * 60 * 60 * 1000,
        );
        if (scheduledAt.getTime() > now) {
          desiredSchedules.set(offset, scheduledAt);
        }
      }
    }

    for (const registration of registrations) {
      const reminders = registration.emailLogs.filter(
        (log) => log.type === EmailType.EVENT_REMINDER,
      );
      const remindersByOffset = new Map<number, (typeof reminders)[number]>();
      for (const reminder of reminders) {
        if (!reminder.idempotencyKey) continue;
        const offset = parseReminderOffset(reminder.idempotencyKey, registration.id);
        if (offset !== null) remindersByOffset.set(offset, reminder);
      }

      if (desiredSchedules.size === 0) {
        for (const reminder of reminders) {
          if (!reminder.idempotencyKey) continue;
          if (
            reminder.status === EmailStatus.PENDING ||
            reminder.status === EmailStatus.FAILED
          ) {
            await transaction.emailLog.update({
              where: { idempotencyKey: reminder.idempotencyKey },
              data: {
                status: EmailStatus.CANCELLED,
                errorMessage: 'Reminder no longer applies to the event schedule',
              },
            });
          }
        }
        continue;
      }

      const sourceLog = registration.emailLogs.find(
        (log) =>
          log.type === EmailType.REGISTRATION_CONFIRMATION &&
          log.payloadCiphertext !== null,
      ) ?? reminders.find((log) => log.payloadCiphertext !== null);
      if (!sourceLog?.payloadCiphertext) {
        throw new Error(
          `Cannot synchronize reminders for registration ${registration.id}: encrypted email payload is missing`,
        );
      }

      const storedPayload = this.cipher.decrypt(sourceLog.payloadCiphertext);
      const payload = {
        ...storedPayload,
        eventTitle: event.title,
        eventDate: event.startDate.toISOString(),
        eventLocation: event.location,
        eventUrl: `${webOriginFrom(storedPayload.eventUrl)}/events/${event.slug}`,
      };
      const payloadCiphertext = this.cipher.encrypt(payload);

      for (const reminder of reminders) {
        if (!reminder.idempotencyKey) continue;
        const offset = parseReminderOffset(reminder.idempotencyKey, registration.id);
        if (offset === null) continue;
        const scheduledAt = desiredSchedules.get(offset);

        if (!scheduledAt) {
          if (
            reminder.status === EmailStatus.PENDING ||
            reminder.status === EmailStatus.FAILED
          ) {
            await transaction.emailLog.update({
              where: { idempotencyKey: reminder.idempotencyKey },
              data: {
                status: EmailStatus.CANCELLED,
                errorMessage: 'Reminder no longer applies to the event schedule',
              },
            });
          }
          continue;
        }

        if (
          reminder.status === EmailStatus.PENDING ||
          reminder.status === EmailStatus.FAILED ||
          reminder.status === EmailStatus.CANCELLED
        ) {
          await transaction.emailLog.update({
            where: { idempotencyKey: reminder.idempotencyKey },
            data: {
              ...(reminder.status === EmailStatus.CANCELLED
                ? {
                    status: EmailStatus.PENDING,
                    attempts: 0,
                    lastAttemptAt: null,
                  }
                : {}),
              scheduledAt,
              payloadCiphertext,
              ...(reminder.status === EmailStatus.FAILED
                ? {}
                : { errorMessage: null }),
            },
          });
        }
      }

      for (const [offset, scheduledAt] of desiredSchedules) {
        if (remindersByOffset.has(offset)) continue;
        await this.createOutboxEntry(transaction, {
          registrationId: registration.id,
          type: EmailType.EVENT_REMINDER,
          idempotencyKey: `event-reminder:${registration.id}:${offset}`,
          scheduledAt,
          payload,
        });
      }
    }
  }

  async dispatchLog(id: string): Promise<void> {
    const jobId = `email-${id}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      if ((await existing.getState()) !== 'failed') return;
      await existing.remove();
    }
    await this.queue.add(
      'deliver',
      { emailLogId: id },
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    );
  }

  async retryFailedLog(id: string, user: AuthUser): Promise<{ success: true }> {
    if (
      !this.config.get<string>('RESEND_API_KEY') ||
      !this.config.get<string>('RESEND_FROM_EMAIL')
    ) {
      throw new ServiceUnavailableException(
        'Configure Resend credentials before retrying email delivery',
      );
    }
    const log = await this.prisma.emailLog.findUnique({
      where: { id },
      select: {
        status: true,
        registration: { select: { event: { select: { organizerId: true } } } },
      },
    });
    if (!log) throw new NotFoundException('Email log not found');
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      (!log.registration || log.registration.event.organizerId !== user.sub)
    ) {
      throw new NotFoundException('Email log not found');
    }
    if (log.status !== EmailStatus.FAILED) {
      throw new ConflictException('Only failed email logs can be retried');
    }
    const update = await this.prisma.emailLog.updateMany({
      where: { id, status: EmailStatus.FAILED },
      data: {
        status: EmailStatus.PENDING,
        attempts: 0,
        lastAttemptAt: null,
        errorMessage: null,
      },
    });
    if (update.count !== 1) {
      throw new ConflictException('This email log is already being retried');
    }
    await this.dispatchLog(id);
    return { success: true };
  }

  @Interval(10_000)
  async dispatchPending(): Promise<void> {
    const pending = await this.prisma.emailLog.findMany({
      where: {
        status: EmailStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const log of pending) {
      try {
        await this.dispatchLog(log.id);
      } catch (error) {
        this.logger.error(
          `Could not enqueue email log ${log.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}

function parseReminderOffset(
  idempotencyKey: string | null,
  registrationId: string,
): number | null {
  const prefix = `event-reminder:${registrationId}:`;
  if (!idempotencyKey?.startsWith(prefix)) return null;
  const offset = Number(idempotencyKey.slice(prefix.length));
  return Number.isSafeInteger(offset) && offset > 0 ? offset : null;
}

function webOriginFrom(eventUrl: string | undefined): string {
  if (!eventUrl) {
    throw new Error('Stored email payload is missing its event URL');
  }
  return new URL(eventUrl).origin;
}
