import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { EmailType, EventStatus, RegistrationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { RegistrationsService } from './registrations.service.js';
import type { CreateRegistrationDto } from './dto/create-registration.dto.js';

const eventId = '93e8d1b5-1e4f-4dc7-bfd4-1e08db332263';
const registrationId = 'e4e6f4a1-b0fb-4b9e-8e06-d33aa0ee2f72';

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let transaction: {
    $queryRaw: jest.Mock;
    event: { findUnique: jest.Mock };
    eventRegistration: {
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let emailQueue: {
    createOutboxEntry: jest.Mock;
    dispatchLog: jest.Mock;
  };

  const input: CreateRegistrationDto = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ADA@example.com',
    marketingConsent: false,
  };

  beforeEach(() => {
    transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: eventId }]),
      event: { findUnique: jest.fn() },
      eventRegistration: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: registrationId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          status: data.status,
          ticket: data.ticket ? { id: 'ticket-id' } : null,
        })),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    transaction.event.findUnique.mockResolvedValue({
      id: eventId,
      slug: 'academy-open-day',
      title: 'Academy Open Day',
      location: 'Main campus',
      startDate: new Date('2030-05-10T09:00:00.000Z'),
      status: EventStatus.PUBLISHED,
      registrationEnabled: true,
      registrationDeadline: new Date('2030-05-09T09:00:00.000Z'),
      maxAttendees: 10,
      registrationQuestions: null,
      allowSelfCancellation: true,
    });

    emailQueue = {
      createOutboxEntry: jest
        .fn()
        .mockResolvedValue({ id: 'email-log-id' }),
      dispatchLog: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    service = new RegistrationsService(
      prisma as never,
      { requireManageAccess: jest.fn() } as never,
      emailQueue as never,
      { get: jest.fn().mockReturnValue('http://localhost:3000') } as never,
    );
  });

  it('creates a confirmed ticket using only a token hash in storage', async () => {
    const result = await service.register(eventId, input);
    const registrationData =
      transaction.eventRegistration.create.mock.calls[0]?.[0].data;

    expect(result.status).toBe(RegistrationStatus.CONFIRMED);
    expect(result.ticket?.token).toBeTruthy();
    expect(registrationData.email).toBe('ada@example.com');
    expect(registrationData.ticket.create.tokenHash).toBe(
      createHash('sha256').update(result.ticket!.token).digest('hex'),
    );
    expect(emailQueue.createOutboxEntry.mock.calls[0]?.[1].type).toBe(
      EmailType.REGISTRATION_CONFIRMATION,
    );
    expect(emailQueue.dispatchLog).toHaveBeenCalledWith('email-log-id');
  });

  it('adds a registrant to the waitlist when the event is full and requested', async () => {
    transaction.eventRegistration.count.mockResolvedValue(10);
    transaction.eventRegistration.create.mockImplementation(
      async ({ data }) => ({
        id: registrationId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        status: data.status,
        ticket: null,
      }),
    );

    const result = await service.register(eventId, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      marketingConsent: input.marketingConsent,
      joinWaitlist: true,
    });

    expect(result.status).toBe(RegistrationStatus.WAITLISTED);
    expect(result).not.toHaveProperty('ticket');
    expect(
      transaction.eventRegistration.create.mock.calls[0]?.[0].data.ticket,
    ).toBeUndefined();
    expect(emailQueue.createOutboxEntry.mock.calls[0]?.[1].type).toBe(
      EmailType.WAITLIST_CONFIRMATION,
    );
  });

  it('rejects full events when the attendee did not request the waitlist', async () => {
    transaction.eventRegistration.count.mockResolvedValue(10);

    await expect(service.register(eventId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.eventRegistration.create).not.toHaveBeenCalled();
  });
});
