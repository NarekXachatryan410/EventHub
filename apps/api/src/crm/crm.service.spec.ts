import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
