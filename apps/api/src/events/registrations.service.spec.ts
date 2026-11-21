import { jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
      update: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    crmCustomerActivity: { create: jest.Mock };
    emailLog: { updateMany: jest.Mock };
  };
  let emailQueue: {
    createOutboxEntry: jest.Mock;
    dispatchLog: jest.Mock;
  };
  let crm: { upsertFromRegistration: jest.Mock };

  const input = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ADA@example.com',
    marketingConsent: false,
  } satisfies CreateRegistrationDto;

  function registrationEvent(registrationQuestions: unknown = null) {
    return {
      id: eventId,
      organizerId: 'organizer-id',
      slug: 'academy-open-day',
      title: 'Academy Open Day',
      location: 'Main campus',
      startDate: new Date('2030-05-10T09:00:00.000Z'),
      status: EventStatus.PUBLISHED,
      registrationEnabled: true,
      registrationDeadline: new Date('2030-05-09T09:00:00.000Z'),
      maxAttendees: 10,
      reminderOffsetsHours: [24, 2],
      registrationQuestions,
      allowSelfCancellation: true,
    };
  }

  beforeEach(() => {
    transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: eventId }]),
      event: { findUnique: jest.fn() },
      eventRegistration: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: registrationId,
          registeredAt: new Date('2030-01-01T00:00:00.000Z'),
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          status: data.status,
          marketingConsent: data.marketingConsent,
          phone: data.phone,
          ticket: data.ticket ? { id: 'ticket-id' } : null,
        })),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      crmCustomerActivity: { create: jest.fn().mockResolvedValue({}) },
      emailLog: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    transaction.event.findUnique.mockResolvedValue(registrationEvent());

    emailQueue = {
      createOutboxEntry: jest.fn().mockResolvedValue({ id: 'email-log-id' }),
      dispatchLog: jest.fn().mockResolvedValue(undefined),
    };
    crm = {
      upsertFromRegistration: jest.fn().mockResolvedValue({ id: 'crm-customer-id' }),
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
      crm as never,
    );
  });

  it('creates a confirmed ticket using only a token hash in storage', async () => {
    const result = await service.register(eventId, input);
    const registrationData =
      transaction.eventRegistration.create.mock.calls[0]?.[0].data;

    expect(result.status).toBe(RegistrationStatus.CONFIRMED);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.ticket?.token).toBeTruthy();
    expect(registrationData.email).toBe('ada@example.com');
    expect(transaction.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: registrationId },
      data: { crmCustomerId: 'crm-customer-id' },
    });
    expect(crm.upsertFromRegistration).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        organizerId: 'organizer-id',
        registrationId,
        email: 'ada@example.com',
      }),
    );
    expect(registrationData.ticket.create.tokenHash).toBe(
      createHash('sha256').update(result.ticket!.token).digest('hex'),
    );
    expect(emailQueue.createOutboxEntry.mock.calls[0]?.[1].type).toBe(
      EmailType.REGISTRATION_CONFIRMATION,
    );
    const confirmationPayload =
      emailQueue.createOutboxEntry.mock.calls[0]?.[1].payload;
    expect(confirmationPayload.qrCodeBase64).toBeTruthy();
    expect(
      Buffer.from(confirmationPayload.qrCodeBase64, 'base64').subarray(0, 8),
    ).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(confirmationPayload.ticketUrl).toContain(
      `/tickets/${encodeURIComponent(result.ticket!.token)}`,
    );
    expect(
      emailQueue.createOutboxEntry.mock.calls.filter(
        (call) => call[1].type === EmailType.EVENT_REMINDER,
      ),
    ).toHaveLength(2);
    expect(emailQueue.dispatchLog).toHaveBeenCalledWith('email-log-id');
  });

  it('records cancellation activity on the linked CRM customer in the cancellation transaction', async () => {
    const cancellationToken = 'registration-cancellation-token';
    transaction.eventRegistration.findUnique.mockResolvedValue({
      id: registrationId,
      crmCustomerId: 'crm-customer-id',
      eventId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      status: RegistrationStatus.CONFIRMED,
      cancellationTokenHash: createHash('sha256').update(cancellationToken).digest('hex'),
      ticket: null,
      event: {
        id: eventId,
        organizerId: 'organizer-id',
        slug: 'academy-open-day',
        title: 'Academy Open Day',
        location: 'Main campus',
        startDate: new Date('2030-05-10T09:00:00.000Z'),
        status: EventStatus.COMPLETED,
        registrationEnabled: false,
        registrationDeadline: new Date('2030-05-09T09:00:00.000Z'),
        maxAttendees: 10,
        reminderOffsetsHours: [24],
        registrationQuestions: null,
        allowSelfCancellation: true,
      },
    });

    await service.cancelByToken(registrationId, { cancellationToken });

    expect(transaction.crmCustomerActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'crm-customer-id',
        eventId,
        type: 'TICKET_CANCELLED',
        summary: 'Registration cancelled for Academy Open Day',
        sourceKey: `registration-cancelled:${registrationId}`,
      }),
    });
    expect(transaction.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: registrationId },
      data: { status: RegistrationStatus.CANCELLED },
    });
    expect(emailQueue.createOutboxEntry).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ type: EmailType.REGISTRATION_CANCELLATION }),
    );
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
    expect(
      emailQueue.createOutboxEntry.mock.calls[0]?.[1].payload.qrCodeBase64,
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

  it('accepts a single selected value for a multiple-choice question', async () => {
    transaction.event.findUnique.mockResolvedValue(
      registrationEvent([
        {
          key: 'programs',
          label: 'Programs',
          type: 'MULTIPLE_CHOICE',
          required: true,
          options: ['Web', 'Design'],
        },
      ]),
    );

    await service.register(eventId, {
      ...input,
      additionalAnswers: { programs: ['Web'] },
    });

    expect(
      transaction.eventRegistration.create.mock.calls[0]?.[0].data
        .additionalAnswers,
    ).toEqual({ programs: ['Web'] });
  });

  it('requires at least one selection for required multiple-choice questions', async () => {
    transaction.event.findUnique.mockResolvedValue(
      registrationEvent([
        {
          key: 'programs',
          label: 'Programs',
          type: 'MULTIPLE_CHOICE',
          required: true,
          options: ['Web', 'Design'],
        },
      ]),
    );

    await expect(
      service.register(eventId, {
        ...input,
        additionalAnswers: { programs: [] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.eventRegistration.create).not.toHaveBeenCalled();
  });

  it('paginates registrations and searches all name parts without order sensitivity', async () => {
    const listPrisma = {
      eventRegistration: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: registrationId }]),
      },
    };
    const listService = new RegistrationsService(
      listPrisma as never,
      { requireManageAccess: jest.fn().mockResolvedValue(undefined) } as never,
      emailQueue as never,
      { get: jest.fn() } as never,
      crm as never,
    );

    const result = await listService.listPage(
      eventId,
      { sub: 'staff-id', role: 'EVENT_MANAGER' } as never,
      { limit: 25, search: 'Ada Lovelace' },
    );

    const query = listPrisma.eventRegistration.findMany.mock.calls[0]?.[0] as {
      where: { AND: Array<{ OR: Array<Record<string, unknown>> }> };
      take: number;
    };
    expect(result.items).toEqual([{ id: registrationId }]);
    expect(query.take).toBe(26);
    expect(query.where.AND).toHaveLength(2);
    expect(query.where.AND[0]?.OR).toEqual(
      expect.arrayContaining([
        { firstName: { contains: 'Ada', mode: 'insensitive' } },
        { lastName: { contains: 'Ada', mode: 'insensitive' } },
      ]),
    );
    expect(query.where.AND[1]?.OR).toEqual(
      expect.arrayContaining([
        { firstName: { contains: 'Lovelace', mode: 'insensitive' } },
        { lastName: { contains: 'Lovelace', mode: 'insensitive' } },
      ]),
    );
  });
});
