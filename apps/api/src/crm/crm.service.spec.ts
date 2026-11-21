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
});
