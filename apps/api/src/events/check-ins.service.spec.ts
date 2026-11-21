import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { RegistrationStatus, TicketStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CheckInsService } from './check-ins.service.js';

const eventId = '93e8d1b5-1e4f-4dc7-bfd4-1e08db332263';
const staffId = 'cf738fac-40ab-44e1-a069-337b1d348b16';

describe('CheckInsService', () => {
  let service: CheckInsService;
  let transaction: {
    $queryRaw: jest.Mock;
    ticket: { findUnique: jest.Mock; update: jest.Mock };
    checkIn: { create: jest.Mock };
    crmCustomerActivity: { create: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    ticket: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'ticket-id' }]),
      ticket: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      checkIn: {
        create: jest.fn().mockResolvedValue({
          id: 'check-in-id',
          checkedInAt: new Date('2030-05-10T09:00:00.000Z'),
        }),
      },
      crmCustomerActivity: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      ticket: { findUnique: jest.fn() },
    };
    service = new CheckInsService(
      prisma as never,
      { requireManageAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );
  });

  it('validates QR tokens using a hash and returns no token material', async () => {
    const token = 'unpredictable-ticket-token';
    prisma.ticket.findUnique.mockResolvedValue({
      status: TicketStatus.VALID,
      checkIn: null,
      registration: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        status: RegistrationStatus.CONFIRMED,
        event: {
          id: eventId,
          title: 'Academy Open Day',
          startDate: new Date('2030-05-10T09:00:00.000Z'),
        },
      },
    });

    const result = await service.validateTicket(token);

    expect(prisma.ticket.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash('sha256').update(token).digest('hex'),
        },
      }),
    );
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('records a check-in once under a locked ticket row', async () => {
    transaction.ticket.findUnique.mockResolvedValue({
      id: 'ticket-id',
      status: TicketStatus.VALID,
      checkIn: null,
      registration: {
        id: 'registration-id',
        eventId,
        crmCustomerId: 'crm-customer-id',
        firstName: 'Ada',
        lastName: 'Lovelace',
        status: RegistrationStatus.CONFIRMED,
        event: { title: 'Academy Open Day' },
      },
    });

    const result = await service.checkInByToken(eventId, 'valid-token', {
      sub: staffId,
      role: 'CHECK_IN_STAFF',
    });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.checkIn.create).toHaveBeenCalledWith({
      data: { ticketId: 'ticket-id', checkedInBy: staffId },
      select: { id: true, checkedInAt: true },
    });
    expect(transaction.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-id' },
      data: { status: TicketStatus.CHECKED_IN },
    });
    expect(transaction.crmCustomerActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'crm-customer-id',
        eventId,
        actorId: staffId,
        type: 'CHECKED_IN',
        summary: 'Checked in to Academy Open Day',
        sourceKey: 'check-in:check-in-id',
      }),
    });
    expect(result.success).toBe(true);
  });

  it('rejects replayed tickets without creating a second check-in', async () => {
    transaction.ticket.findUnique.mockResolvedValue({
      id: 'ticket-id',
      status: TicketStatus.CHECKED_IN,
      checkIn: { id: 'prior-check-in' },
      registration: {
        id: 'registration-id',
        eventId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        status: RegistrationStatus.CONFIRMED,
      },
    });

    await expect(
      service.checkInByToken(eventId, 'valid-token', {
        sub: staffId,
        role: 'CHECK_IN_STAFF',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.checkIn.create).not.toHaveBeenCalled();
  });
});
