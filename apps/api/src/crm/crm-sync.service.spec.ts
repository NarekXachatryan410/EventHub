import { jest } from '@jest/globals';
import { CrmSyncStatus } from '@prisma/client';
import { CrmSyncService } from './crm-sync.service.js';

describe('CrmSyncService', () => {
  let prisma: { crmSyncLog: Record<string, jest.Mock> };
  let config: { get: jest.Mock };
  let service: CrmSyncService;

  beforeEach(() => {
    prisma = {
      crmSyncLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ status: CrmSyncStatus.PENDING }),
      },
    };
    config = { get: jest.fn().mockReturnValue(undefined) };
    service = new CrmSyncService(prisma as never, config as never);
  });

  it('creates a durable sync row with an idempotent update for a registration', async () => {
    const transaction = {
      crmSyncLog: { upsert: jest.fn().mockResolvedValue({ id: 'sync-id' }) },
    };

    await service.scheduleRegistrationSync(transaction as never, 'registration-id');

    expect(transaction.crmSyncLog.upsert).toHaveBeenCalledWith({
      where: { registrationId: 'registration-id' },
      create: {
        registrationId: 'registration-id',
        status: CrmSyncStatus.PENDING,
      },
      update: {
        status: CrmSyncStatus.PENDING,
        errorMessage: null,
        syncedAt: null,
        version: { increment: 1 },
      },
    });
  });

  it('records a configuration error instead of silently dropping a pending sync', async () => {
    prisma.crmSyncLog.findMany.mockResolvedValue([
      {
        id: 'sync-id',
        status: CrmSyncStatus.PENDING,
        attempts: 0,
        version: 3,
        lastAttemptAt: null,
      },
    ]);

    await service.processPending();

    expect(prisma.crmSyncLog.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'sync-id',
          status: CrmSyncStatus.PENDING,
          version: 3,
          lastAttemptAt: null,
        },
        data: expect.objectContaining({
          status: CrmSyncStatus.PROCESSING,
          attempts: { increment: 1 },
        }),
      }),
    );
    expect(prisma.crmSyncLog.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: 'sync-id',
          status: CrmSyncStatus.PROCESSING,
          version: 3,
        },
        data: {
          status: CrmSyncStatus.FAILED,
          errorMessage:
            'NAVIGATOR_API_URL and NAVIGATOR_API_KEY must be configured',
        },
      }),
    );
  });

  it('sends attendee and check-in state with an idempotency key and stores CRM IDs', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'NAVIGATOR_API_URL') return 'https://crm.example.test/upsert';
      if (key === 'NAVIGATOR_API_KEY') return 'test-api-key';
      return 'test';
    });
    prisma.crmSyncLog.findMany.mockResolvedValue([
      {
        id: 'sync-id',
        status: CrmSyncStatus.PENDING,
        attempts: 0,
        version: 3,
        lastAttemptAt: null,
      },
    ]);
    prisma.crmSyncLog.findUnique.mockResolvedValue({
      version: 3,
      registration: {
        id: 'registration-id',
        firstName: 'Ada',
        lastName: 'Lovelace',
        normalizedEmail: 'ada@example.test',
        phone: null,
        organization: 'Academy',
        interestedInPrograms: true,
        marketingConsent: false,
        status: 'CONFIRMED',
        registeredAt: new Date('2026-11-20T08:00:00.000Z'),
        event: {
          id: 'event-id',
          title: 'Open Day',
          slug: 'open-day',
          type: 'OPEN_DAY',
          startDate: new Date('2026-12-01T10:00:00.000Z'),
        },
        ticket: {
          checkIn: { checkedInAt: new Date('2026-12-01T09:00:00.000Z') },
        },
      },
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ contactId: 'contact-123', leadId: 'lead-456' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await service.processPending();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://crm.example.test/upsert'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-api-key',
          'idempotency-key':
            'eventhub:registration-id:CONFIRMED:attended',
        }),
        body: expect.stringContaining('"attended":true'),
      }),
    );
    expect(prisma.crmSyncLog.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'sync-id',
        status: CrmSyncStatus.PROCESSING,
        version: 3,
      },
      data: {
        status: CrmSyncStatus.SYNCED,
        contactId: 'contact-123',
        leadId: 'lead-456',
        errorMessage: null,
        syncedAt: expect.any(Date),
      },
    });
    fetchMock.mockRestore();
  });

  it('resets only failed sync records for a manual retry', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'NAVIGATOR_API_URL' ? 'https://crm.example.test/upsert' : 'api-key',
    );
    await expect(service.retry('sync-id')).resolves.toEqual({ success: true });

    expect(prisma.crmSyncLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'sync-id', status: CrmSyncStatus.FAILED },
      data: {
        status: CrmSyncStatus.PENDING,
        attempts: 0,
        lastAttemptAt: null,
        errorMessage: null,
        syncedAt: null,
        version: { increment: 1 },
      },
    });
  });
});
