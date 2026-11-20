import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { EventStatus, RegistrationStatus, TicketStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { FeedbackService } from './feedback.service.js';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let prisma: {
    ticket: { findUnique: jest.Mock };
    feedback: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          status: TicketStatus.CHECKED_IN,
          checkIn: { id: 'check-in-id' },
          registration: {
            id: 'registration-id',
            status: RegistrationStatus.CONFIRMED,
            eventId: 'event-id',
            event: {
              status: EventStatus.COMPLETED,
              endDate: new Date('2030-05-10T09:00:00.000Z'),
            },
          },
        }),
      },
      feedback: {
        create: jest.fn().mockResolvedValue({ id: 'feedback-id' }),
        findMany: jest.fn(),
      },
    };
    service = new FeedbackService(
      prisma as never,
      { requireManageAccess: jest.fn() } as never,
    );
  });

  it('accepts feedback only for a checked-in attendee after the event', async () => {
    const feedbackToken = 'feedback-token';
    await expect(
      service.submit({
        feedbackToken,
        overallRating: 5,
        interestedInPrograms: false,
      }),
    ).resolves.toEqual({ id: 'feedback-id' });

    expect(prisma.ticket.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          feedbackTokenHash: createHash('sha256')
            .update(feedbackToken)
            .digest('hex'),
        },
      }),
    );
    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event-id',
          registrationId: 'registration-id',
          overallRating: 5,
          interestedInPrograms: false,
        }),
      }),
    );
  });

  it('rejects feedback from a registration without a check-in', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      status: TicketStatus.VALID,
      checkIn: null,
      registration: {
        id: 'registration-id',
        status: RegistrationStatus.CONFIRMED,
        eventId: 'event-id',
        event: {
          status: EventStatus.COMPLETED,
          endDate: new Date('2030-05-10T09:00:00.000Z'),
        },
      },
    });

    await expect(
      service.submit({ feedbackToken: 'feedback-token', overallRating: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.feedback.create).not.toHaveBeenCalled();
  });

  it('exports feedback as formula-safe CSV', async () => {
    prisma.feedback.findMany.mockResolvedValue([
      {
        overallRating: 5,
        contentRating: null,
        organizationRating: 4,
        comment: '=SUM(A1:A2), "great"',
        interestedInPrograms: true,
        submittedAt: new Date('2026-11-20T10:00:00.000Z'),
        registration: { firstName: 'Ada', lastName: 'Lovelace' },
      },
    ]);
    const user = { sub: 'manager-id', role: 'EVENT_MANAGER' } as never;

    await expect(service.exportCsv('event-id', user)).resolves.toContain(
      `"Ada","Lovelace","5","","4","Yes","'=SUM(A1:A2), ""great""","2026-11-20T10:00:00.000Z"`,
    );
  });
});
