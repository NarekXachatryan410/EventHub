import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EmailStatus, EmailType, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EmailPayload } from './email.types.js';
import { EMAIL_QUEUE } from './email.types.js';
import { EmailPayloadCipher } from './email-payload-cipher.service.js';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: EmailPayloadCipher,
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

  async dispatchLog(id: string): Promise<void> {
    await this.queue.add(
      'deliver',
      { emailLogId: id },
      {
        jobId: `email-${id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    );
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
