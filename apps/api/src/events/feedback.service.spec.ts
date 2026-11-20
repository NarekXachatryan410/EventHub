import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { EventStatus, RegistrationStatus, TicketStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { FeedbackService } from './feedback.service.js';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let prisma: {
    ticket: { findUnique: jest.Mock };
    feedback: { create: jest.Mock };
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
});
