import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { EventStatus, EventType } from '@prisma/client';
import { EventsService } from './events.service.js';

describe('EventsService date validation', () => {
  const prisma = {
    event: {
      create: jest.fn().mockResolvedValue({ id: 'event-id' }),
    },
  };
  const service = new EventsService(
    prisma as never,
    {} as never,
    { createOutboxEntry: jest.fn(), dispatchLog: jest.fn() } as never,
    { get: jest.fn().mockReturnValue('http://localhost:3000') } as never,
  );
  const organizer = { sub: 'staff-id', role: 'EVENT_MANAGER' } as const;

  beforeEach(() => {
    prisma.event.create.mockReset();
    prisma.event.create.mockResolvedValue({ id: 'event-id' });
  });

  describe('EventsService event lifecycle', () => {
    const user = { sub: 'staff-id', role: 'EVENT_MANAGER' } as const;
    const access = { requireEditAccess: jest.fn().mockResolvedValue(undefined) };
    const queue = {
      createOutboxEntry: jest.fn().mockResolvedValue({ id: 'email-log-id' }),
      dispatchLog: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue('https://events.example.test') };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-id' }]),
      event: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'event-id' }),
        delete: jest.fn().mockResolvedValue({ id: 'event-id' }),
      },
      eventRegistration: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ticket: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'ticket-id' }),
      },
      emailLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
      event: { update: jest.fn().mockResolvedValue({ status: EventStatus.ARCHIVED }) },
    };
    const service = new EventsService(
      prisma as never,
      access as never,
      queue as never,
      config as never,
    );

    beforeEach(() => {
      jest.clearAllMocks();
      queue.createOutboxEntry.mockResolvedValue({ id: 'email-log-id' });
      queue.dispatchLog.mockResolvedValue(undefined);
    });

    it('archives without deleting event records and disables registration', async () => {
      await service.archive('event-id', user);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-id' },
        data: { status: EventStatus.ARCHIVED, registrationEnabled: false },
      });
    });

    it('queues an event cancellation email and cancels pending reminders atomically', async () => {
      transaction.event.findUnique.mockResolvedValue({
        slug: 'academy-open-day',
        title: 'Academy Open Day',
        location: 'Main campus',
        startDate: new Date('2030-05-10T09:00:00.000Z'),
        registrations: [
          {
            id: 'registration-id',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.test',
          },
        ],
      });

      await service.cancel('event-id', user);

      expect(queue.createOutboxEntry).toHaveBeenCalledWith(
        transaction,
        expect.objectContaining({
          type: 'EVENT_CANCELLATION',
          idempotencyKey: 'event-cancelled:registration-id',
        }),
      );
      expect(transaction.emailLog.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { not: 'EVENT_CANCELLATION' },
          }),
        }),
      );
      expect(transaction.event.delete).toHaveBeenCalledWith({
        where: { id: 'event-id' },
      });
      expect(queue.dispatchLog).toHaveBeenCalledWith('email-log-id');
    });

    it('sends follow-up only to checked-in attendees and stores a hashed feedback token', async () => {
      transaction.event.findUnique.mockResolvedValue({
        id: 'event-id',
        status: EventStatus.PUBLISHED,
        slug: 'academy-open-day',
        title: 'Academy Open Day',
        location: 'Main campus',
        startDate: new Date('2030-05-10T09:00:00.000Z'),
        registrations: [
          {
            id: 'registration-id',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.test',
            ticket: { id: 'ticket-id' },
          },
        ],
      });

      await service.complete('event-id', user);

      expect(transaction.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-id' },
          data: { feedbackTokenHash: expect.any(String) },
        }),
      );
      expect(queue.createOutboxEntry).toHaveBeenCalledWith(
        transaction,
        expect.objectContaining({
          type: 'POST_EVENT_THANK_YOU',
          idempotencyKey: 'post-event-thank-you:registration-id',
          payload: expect.objectContaining({
            feedbackUrl: expect.stringMatching(
              /^https:\/\/events\.example\.test\/feedback\?token=/,
            ),
          }),
        }),
      );
      expect(queue.dispatchLog).toHaveBeenCalledWith('email-log-id');
    });
  });

  function eventDates(registrationDeadline: Date, startOffset = 60 * 60_000) {
    const startDate = new Date(Date.now() + startOffset);
    return {
      title: 'Academy Open Day',
      slug: 'academy-open-day',
      description: 'An event description',
      type: EventType.OPEN_DAY,
      location: 'Main campus',
      registrationDeadline: registrationDeadline.toISOString(),
      startDate: startDate.toISOString(),
      endDate: new Date(startDate.getTime() + 60 * 60_000).toISOString(),
      registrationEnabled: true,
    };
  }

  it('accepts a past deadline before the event starts', async () => {
    const deadline = new Date(Date.now() - 24 * 60 * 60_000);

    await expect(service.create(eventDates(deadline), organizer)).resolves.toEqual({
      id: 'event-id',
    });
    expect(prisma.event.create).toHaveBeenCalledTimes(1);
  });

  it('accepts a past deadline before a past event start', async () => {
    const startDate = new Date(Date.now() - 60 * 60_000);
    const deadline = new Date(startDate.getTime() - 24 * 60 * 60_000);

    await expect(
      service.create(eventDates(deadline, -60 * 60_000), organizer),
    ).resolves.toEqual({ id: 'event-id' });
    expect(prisma.event.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a deadline after the event starts', async () => {
    const startDate = new Date(Date.now() + 30 * 60_000);
    const dates = eventDates(new Date(startDate.getTime() + 60_000), 30 * 60_000);

    await expect(service.create(dates, organizer)).rejects.toThrow(
      new BadRequestException('Registration deadline cannot be after the event starts'),
    );
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  describe('event reminder synchronization', () => {
    const user = { sub: 'staff-id', role: 'EVENT_MANAGER' } as const;
    const currentEvent = {
      title: 'Academy Open Day',
      slug: 'academy-open-day',
      location: 'Main campus',
      startDate: new Date('2030-05-10T09:00:00.000Z'),
      endDate: new Date('2030-05-10T10:00:00.000Z'),
      registrationDeadline: new Date('2030-05-09T09:00:00.000Z'),
      reminderOffsetsHours: [24, 2],
    };
    const updatedEvent = {
      ...currentEvent,
      startDate: new Date('2030-05-11T09:00:00.000Z'),
      endDate: new Date('2030-05-11T10:00:00.000Z'),
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-id' }]),
      event: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const access = { requireEditAccess: jest.fn().mockResolvedValue(undefined) };
    const queue = { synchronizeEventReminders: jest.fn().mockResolvedValue(undefined) };
    const service = new EventsService(
      prisma as never,
      access as never,
      queue as never,
      { get: jest.fn().mockReturnValue('http://localhost:3000') } as never,
    );

    beforeEach(() => {
      jest.clearAllMocks();
      transaction.event.findUnique.mockResolvedValue(currentEvent);
      transaction.event.update.mockResolvedValue(updatedEvent);
      prisma.$transaction.mockImplementation(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      );
    });

    it('synchronizes reminders transactionally when the event time changes', async () => {
      await service.update(
        'event-id',
        {
          startDate: updatedEvent.startDate.toISOString(),
          endDate: updatedEvent.endDate.toISOString(),
        },
        user,
      );

      expect(queue.synchronizeEventReminders).toHaveBeenCalledWith(
        transaction,
        updatedEvent,
      );
    });

    it('does not reschedule reminders for unrelated edits', async () => {
      await service.update('event-id', { description: 'Updated description' }, user);

      expect(queue.synchronizeEventReminders).not.toHaveBeenCalled();
    });
  });
});
