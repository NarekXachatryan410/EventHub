import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CrmSyncStatus, Prisma } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const maxAttempts = 5;
const staleProcessingMs = 5 * 60_000;

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  scheduleRegistrationSync(
    transaction: Prisma.TransactionClient,
    registrationId: string,
  ) {
    return transaction.crmSyncLog.upsert({
      where: { registrationId },
      create: { registrationId, status: CrmSyncStatus.PENDING },
      update: {
        status: CrmSyncStatus.PENDING,
        errorMessage: null,
        syncedAt: null,
        version: { increment: 1 },
      },
    });
  }

  async list(limit: number, cursor?: string) {
    const records = await this.prisma.crmSyncLog.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        contactId: true,
        leadId: true,
        errorMessage: true,
        attempts: true,
        lastAttemptAt: true,
        syncedAt: true,
        updatedAt: true,
        registration: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            event: { select: { id: true, title: true } },
            ticket: {
              select: {
                checkIn: { select: { checkedInAt: true } },
              },
            },
          },
        },
      },
    });
    const hasMore = records.length > limit;
    const items = hasMore ? records.slice(0, limit) : records;
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async retry(id: string): Promise<{ success: true }> {
    if (
      !this.config.get<string>('NAVIGATOR_API_URL') ||
      !this.config.get<string>('NAVIGATOR_API_KEY')
    ) {
      throw new ServiceUnavailableException(
        'Configure the Navigator CRM endpoint and API key before retrying',
      );
    }
    const result = await this.prisma.crmSyncLog.updateMany({
      where: { id, status: CrmSyncStatus.FAILED },
      data: {
        status: CrmSyncStatus.PENDING,
        attempts: 0,
        lastAttemptAt: null,
        errorMessage: null,
        syncedAt: null,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      const log = await this.prisma.crmSyncLog.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!log) {
        throw new NotFoundException('CRM sync log not found');
      }
      throw new ConflictException('Only failed CRM syncs can be retried');
    }
    return { success: true };
  }

  @Interval(15_000)
  async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      const candidates = await this.prisma.crmSyncLog.findMany({
        where: {
          OR: [
            { status: CrmSyncStatus.PENDING },
            {
              status: CrmSyncStatus.FAILED,
              attempts: { lt: maxAttempts },
            },
            {
              status: CrmSyncStatus.PROCESSING,
              lastAttemptAt: { lt: new Date(now.getTime() - staleProcessingMs) },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 25,
        select: {
          id: true,
          status: true,
          attempts: true,
          version: true,
          lastAttemptAt: true,
        },
      });

      for (const candidate of candidates) {
        if (
          candidate.status === CrmSyncStatus.FAILED &&
          !this.isRetryDue(candidate.attempts, candidate.lastAttemptAt, now)
        ) {
          continue;
        }
        if (
          candidate.status === CrmSyncStatus.PROCESSING &&
          candidate.attempts >= maxAttempts
        ) {
          await this.prisma.crmSyncLog.updateMany({
            where: {
              id: candidate.id,
              status: CrmSyncStatus.PROCESSING,
              version: candidate.version,
              lastAttemptAt: candidate.lastAttemptAt,
            },
            data: {
              status: CrmSyncStatus.FAILED,
              errorMessage: 'CRM sync worker stopped before completing the request',
            },
          });
          continue;
        }

        const claimed = await this.prisma.crmSyncLog.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            version: candidate.version,
            lastAttemptAt: candidate.lastAttemptAt,
          },
          data: {
            status: CrmSyncStatus.PROCESSING,
            lastAttemptAt: now,
            attempts: { increment: 1 },
          },
        });
        if (claimed.count !== 1) continue;
        await this.syncClaimed(candidate.id, candidate.version);
      }
    } catch (error) {
      this.logger.error(
        'Could not process pending CRM synchronization records',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.processing = false;
    }
  }

  private async syncClaimed(id: string, version: number): Promise<void> {
    try {
      const endpoint = this.config.get<string>('NAVIGATOR_API_URL');
      const apiKey = this.config.get<string>('NAVIGATOR_API_KEY');
      if (!endpoint || !apiKey) {
        throw new ServiceUnavailableException(
          'NAVIGATOR_API_URL and NAVIGATOR_API_KEY must be configured',
        );
      }
      const url = new URL(endpoint);
      if (
        this.config.get<string>('NODE_ENV') === 'production' &&
        url.protocol !== 'https:'
      ) {
        throw new ServiceUnavailableException(
          'Navigator CRM must use HTTPS in production',
        );
      }

      const log = await this.prisma.crmSyncLog.findUnique({
        where: { id },
        select: {
          version: true,
          registration: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              normalizedEmail: true,
              phone: true,
              organization: true,
              interestedInPrograms: true,
              marketingConsent: true,
              status: true,
              registeredAt: true,
              event: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  type: true,
                  startDate: true,
                },
              },
              ticket: {
                select: {
                  checkIn: { select: { checkedInAt: true } },
                },
              },
            },
          },
        },
      });
      if (!log || log.version !== version) return;

      const registration = log.registration;
      const checkIn = registration.ticket?.checkIn ?? null;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': [
            'eventhub',
            registration.id,
            registration.status,
            checkIn ? 'attended' : 'not-attended',
          ].join(':'),
        },
        body: JSON.stringify({
          schemaVersion: 1,
          source: 'eventhub',
          upsertBy: 'contact.email',
          contact: {
            email: registration.normalizedEmail,
            firstName: registration.firstName,
            lastName: registration.lastName,
            phone: registration.phone,
            organization: registration.organization,
            interestedInPrograms: registration.interestedInPrograms,
            marketingConsent: registration.marketingConsent,
          },
          eventRegistration: {
            registrationId: registration.id,
            status: registration.status,
            registeredAt: registration.registeredAt.toISOString(),
            attended: Boolean(checkIn),
            attendedAt: checkIn?.checkedInAt.toISOString() ?? null,
            event: {
              id: registration.event.id,
              title: registration.event.title,
              slug: registration.event.slug,
              type: registration.event.type,
              startDate: registration.event.startDate.toISOString(),
            },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Navigator CRM returned HTTP ${response.status}`);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Navigator CRM response was not valid JSON');
      }
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('contactId' in payload) ||
        typeof payload.contactId !== 'string' ||
        !payload.contactId
      ) {
        throw new Error('Navigator CRM response is missing contactId');
      }

      const leadId =
        'leadId' in payload && typeof payload.leadId === 'string'
          ? payload.leadId
          : null;
      await this.prisma.crmSyncLog.updateMany({
        where: { id, status: CrmSyncStatus.PROCESSING, version },
        data: {
          status: CrmSyncStatus.SYNCED,
          contactId: payload.contactId,
          leadId,
          errorMessage: null,
          syncedAt: new Date(),
        },
      });
    } catch (error) {
      const message =
        error instanceof ServiceUnavailableException
          ? error.message
          : error instanceof Error && error.message.startsWith('Navigator CRM')
            ? error.message
            : 'Navigator CRM request failed; check connectivity and endpoint configuration';
      await this.prisma.crmSyncLog.updateMany({
        where: { id, status: CrmSyncStatus.PROCESSING, version },
        data: { status: CrmSyncStatus.FAILED, errorMessage: message },
      });
      this.logger.error(
        `CRM sync failed for log ${id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private isRetryDue(
    attempts: number,
    lastAttemptAt: Date | null,
    now: Date,
  ): boolean {
    if (!lastAttemptAt) return true;
    const delay = Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);
    return lastAttemptAt.getTime() + delay <= now.getTime();
  }
}
