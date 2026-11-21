import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CrmService } from './crm.service.js';

describe('CrmService', () => {
  const customer = {
    id: 'customer-id',
    organizerId: 'organizer-id',
    email: 'ada@example.com',
    normalizedEmail: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };
  let prisma: {
    crmCustomer: { findMany: jest.Mock; findFirst: jest.Mock };
  };
  let service: CrmService;

  beforeEach(() => {
    prisma = {
      crmCustomer: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(customer),
      },
    };
    service = new CrmService(prisma as never);
  });

  it('deduplicates registration customers by organizer and normalized email', async () => {
    const transaction = {
      crmCustomer: { upsert: jest.fn().mockResolvedValue(customer) },
      crmCustomerActivity: { create: jest.fn().mockResolvedValue({}) },
    };
    const registration = {
      organizerId: 'organizer-id',
      registrationId: 'registration-id',
      eventId: 'event-id',
      eventTitle: 'Open Day',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: ' ADA@Example.com ',
      phone: null,
      marketingConsent: false,
      registeredAt: new Date('2030-01-01T00:00:00.000Z'),
    };

    await service.upsertFromRegistration(transaction as never, registration);
    await service.upsertFromRegistration(transaction as never, registration);

    expect(transaction.crmCustomer.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.crmCustomer.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          organizerId_normalizedEmail: {
            organizerId: 'organizer-id',
            normalizedEmail: 'ada@example.com',
          },
        },
        create: expect.objectContaining({
          email: 'ada@example.com',
          normalizedEmail: 'ada@example.com',
        }),
      }),
    );
    expect(transaction.crmCustomerActivity.create).toHaveBeenCalledTimes(2);
    expect(
      transaction.crmCustomerActivity.create.mock.calls[0]?.[0].data.sourceKey,
    ).toBe('registration-created:registration-id');
    expect(transaction.crmCustomer.upsert.mock.calls[1]?.[0].update).toEqual(
      expect.objectContaining({ firstName: 'Ada', lastName: 'Lovelace' }),
    );
  });

  it('scopes an Event Manager customer list to that organizer', async () => {
    await service.listCustomers(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      { limit: 50 },
    );

    expect(prisma.crmCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizerId: 'manager-one' }),
      }),
    );
  });

  it('allows Super Admins to list customers across organizers', async () => {
    await service.listCustomers(
      { sub: 'admin-id', role: UserRole.SUPER_ADMIN },
      { limit: 50 },
    );

    const query = prisma.crmCustomer.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(query.where).not.toHaveProperty('organizerId');
  });

  it('supports explicit organizer filtering for Super Admin customer lists', async () => {
    await service.listCustomers(
      { sub: 'admin-id', role: UserRole.SUPER_ADMIN },
      { limit: 20, organizerId: 'manager-one' },
    );
    expect(prisma.crmCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizerId: 'manager-one' } }),
    );
  });

  it('keeps Event Manager customer lists scoped even when another organizer is requested', async () => {
    await service.listCustomers(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      { limit: 20, organizerId: 'manager-two' },
    );
    expect(prisma.crmCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizerId: 'manager-one' } }),
    );
  });

  it('does not reveal another organizer customer to an Event Manager', async () => {
    prisma.crmCustomer.findFirst.mockResolvedValue(null);

    await expect(
      service.getCustomer(
        { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
        'customer-from-another-organizer',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.crmCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'customer-from-another-organizer',
          organizerId: 'manager-one',
        },
      }),
    );
  });

  it('rejects Check-in Staff even when the service is called directly', async () => {
    await expect(
      service.listCustomers(
        { sub: 'staff-id', role: UserRole.CHECK_IN_STAFF },
        { limit: 50 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.crmCustomer.findMany).not.toHaveBeenCalled();
  });

  it('filters customer lists by tag within the organizer scope', async () => {
    await service.listCustomers(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      { limit: 25, tagId: 'tag-id' },
    );
    expect(prisma.crmCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizerId: 'manager-one',
          tags: { some: { tagId: 'tag-id' } },
        }),
        take: 26,
      }),
    );
  });

  it('rejects note creation before touching notes for another organizer customer', async () => {
    prisma.crmCustomer.findFirst.mockResolvedValue(null);
    await expect(
      service.createNote(
        { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
        'other-customer',
        'private note',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects tags owned by a different organizer', async () => {
    const db = prisma as unknown as {
      crmCustomerTag: { findFirst: jest.Mock };
      crmCustomer: { findFirst: jest.Mock };
    };
    db.crmCustomerTag = { findFirst: jest.fn().mockResolvedValue(null) };
    db.crmCustomer.findFirst.mockResolvedValue(customer);
    await expect(
      service.assignTag(
        { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
        customer.id,
        'foreign-tag',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.crmCustomerTag.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-tag', organizerId: customer.organizerId },
      select: { id: true },
    });
  });

  it('rejects unsupported segmentation filters instead of broadening a query', async () => {
    await expect(
      service.previewSegment(
        { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
        { unsupportedSql: 'anything' } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('paginates reminders and returns a continuation cursor', async () => {
    const rows = [
      { id: 'reminder-one' },
      { id: 'reminder-two' },
    ];
    (prisma as unknown as { crmCustomerReminder: { findMany: jest.Mock } }).crmCustomerReminder = {
      findMany: jest.fn().mockResolvedValue(rows),
    };
    const result = await service.listReminders(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      { limit: 1 },
    );
    expect(result).toEqual({ items: [rows[0]], nextCursor: 'reminder-one' });
  });

  it('builds segmentation membership from registration dates, tags, ticket count and attendance', async () => {
    const db = prisma as unknown as {
      crmCustomerTag: { count: jest.Mock };
      crmCustomer: { count: jest.Mock; findMany: jest.Mock };
    };
    db.crmCustomerTag = { count: jest.fn().mockResolvedValue(1) };
    db.crmCustomer.count = jest.fn().mockResolvedValue(1);
    db.crmCustomer.findMany
      .mockResolvedValueOnce([
        {
          id: 'matching-customer',
          registrations: [{ ticket: { id: 'ticket-id', checkIn: { id: 'checkin-id' } } }],
        },
        { id: 'not-attended', registrations: [{ ticket: { id: 'other-ticket', checkIn: null } }] },
      ])
      .mockResolvedValueOnce([{ id: 'matching-customer' }]);

    const result = await service.previewSegment(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      {
        registeredAfter: '2026-01-01T00:00:00.000Z',
        minTickets: 1,
        attended: true,
        tagIds: ['organizer-tag'],
      },
    );
    expect(result.total).toBe(1);
    expect(db.crmCustomerTag.count).toHaveBeenCalledWith({
      where: { organizerId: 'manager-one', id: { in: ['organizer-tag'] } },
    });
    expect(db.crmCustomer.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizerId: 'manager-one',
        tags: { some: { tagId: { in: ['organizer-tag'] } } },
        registrations: { some: { registeredAt: { gte: new Date('2026-01-01T00:00:00.000Z') } } },
        id: { in: ['matching-customer'] },
      }),
    });
  });

  it('paginates registration history only after verifying customer ownership', async () => {
    const db = prisma as unknown as {
      eventRegistration: { findMany: jest.Mock };
    };
    db.eventRegistration = { findMany: jest.fn().mockResolvedValue([{ id: 'reg-1' }]) };
    const result = await service.listCustomerRegistrations(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      customer.id,
      { limit: 1 },
    );
    expect(prisma.crmCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: customer.id, organizerId: 'manager-one' } }),
    );
    expect(db.eventRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { crmCustomerId: customer.id }, take: 2 }),
    );
    expect(result.items).toEqual([{ id: 'reg-1' }]);
  });

  it('returns paginated saved segment members within the segment organizer', async () => {
    const db = prisma as unknown as {
      crmCustomerSegment: { findFirst: jest.Mock };
      crmCustomer: { count: jest.Mock; findMany: jest.Mock };
    };
    db.crmCustomerSegment = { findFirst: jest.fn().mockResolvedValue({ id: 'segment-1', organizerId: 'manager-one', criteria: {} }) };
    db.crmCustomer.count = jest.fn().mockResolvedValue(3);
    db.crmCustomer.findMany.mockResolvedValue([{ id: 'customer-1' }, { id: 'customer-2' }]);
    const result = await service.listSegmentMembers(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      'segment-1',
      { limit: 1 },
    );
    expect(db.crmCustomer.count).toHaveBeenCalledWith({ where: { organizerId: 'manager-one' } });
    expect(db.crmCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizerId: 'manager-one' }, take: 2 }),
    );
    expect(result).toEqual({ items: [{ id: 'customer-1' }], nextCursor: 'customer-1', total: 3 });
  });

  it('does not expose a saved segment owned by another organizer', async () => {
    const db = prisma as unknown as { crmCustomerSegment: { findFirst: jest.Mock } };
    db.crmCustomerSegment = { findFirst: jest.fn().mockResolvedValue(null) };
    await expect(
      service.listSegmentMembers(
        { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
        'foreign-segment',
        { limit: 25 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.crmCustomerSegment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign-segment', organizerId: 'manager-one' } }),
    );
  });

  it('builds dashboard statistics with scoped database counts', async () => {
    const crmCustomer = prisma.crmCustomer as typeof prisma.crmCustomer & { count: jest.Mock };
    const db = prisma as unknown as { eventRegistration: { count: jest.Mock } };
    crmCustomer.count = jest.fn()
      .mockResolvedValueOnce(5).mockResolvedValueOnce(4).mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3).mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    db.eventRegistration = { count: jest.fn().mockResolvedValue(8) };
    const result = await service.dashboardAnalytics({ sub: 'manager-one', role: UserRole.EVENT_MANAGER });
    expect(result).toMatchObject({ totalCustomers: 5, activeCustomers: 4, archivedCustomers: 1, registeredCustomers: 3, registrations: 8, createdThisMonth: 2 });
    expect(crmCustomer.count).toHaveBeenCalledWith({ where: { organizerId: 'manager-one' } });
    expect(db.eventRegistration.count).toHaveBeenCalledWith({ where: { crmCustomer: { is: { organizerId: 'manager-one' } } } });
    expect(result.customerGrowth).toHaveLength(12);
  });

  it('uses EmailLog delivery state from the provider-updated record in customer activity', async () => {
    const db = prisma as unknown as {
      crmCustomerActivity: { findMany: jest.Mock };
      crmCustomerNote: { findMany: jest.Mock };
      crmCustomerReminder: { findMany: jest.Mock };
      checkIn: { findMany: jest.Mock };
      emailLog: { findMany: jest.Mock };
    };
    db.crmCustomerActivity = { findMany: jest.fn().mockResolvedValue([]) };
    db.crmCustomerNote = { findMany: jest.fn().mockResolvedValue([]) };
    db.crmCustomerReminder = { findMany: jest.fn().mockResolvedValue([]) };
    db.checkIn = { findMany: jest.fn().mockResolvedValue([]) };
    db.emailLog = { findMany: jest.fn().mockResolvedValue([{ id: 'email-log-1', type: 'REGISTRATION_CONFIRMATION', status: 'DELIVERED', providerId: 'resend-id', errorMessage: null, scheduledAt: new Date('2030-01-01T00:00:00.000Z'), lastAttemptAt: new Date('2030-01-01T00:01:00.000Z'), sentAt: new Date('2030-01-01T00:01:00.000Z') }]) };
    const result = await service.listActivity(
      { sub: 'manager-one', role: UserRole.EVENT_MANAGER },
      customer.id,
      25,
    );
    expect(db.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { registration: { is: { crmCustomerId: customer.id } } } }),
    );
    expect(result.items[0]).toMatchObject({
      type: 'COMMUNICATION_RECORDED',
      summary: 'registration confirmation · delivered',
      metadata: { emailStatus: 'DELIVERED', providerId: 'resend-id' },
    });
  });
});
