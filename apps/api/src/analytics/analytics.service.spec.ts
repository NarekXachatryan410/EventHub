import { jest } from '@jest/globals';
import { UserRole } from '@prisma/client';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsService', () => {
  it('calculates attendance only from past, non-cancelled events', async () => {
    const prisma = {
      event: { count: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(2) },
      eventRegistration: {
        count: jest
          .fn()
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(4),
      },
      checkIn: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(3) },
      feedback: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 2 },
          _avg: { overallRating: 4.5, contentRating: 4, organizationRating: 5 },
        }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const service = new AnalyticsService(prisma as never);

    const result = await service.dashboard(3, {
      sub: 'admin-id',
      role: UserRole.SUPER_ADMIN,
    });

    expect(result.overview).toMatchObject({
      totalEvents: 4,
      publishedEvents: 2,
      totalRegistrations: 12,
      confirmedRegistrations: 8,
      checkedInAttendees: 3,
      attendanceRate: 75,
      noShowRate: 25,
      attendanceEligibleRegistrations: 4,
      feedbackResponses: 2,
    });
    expect(result.registrationTrend).toHaveLength(3);
    expect(result.registrationTrend.every((month) => month.registrations === 0)).toBe(true);
  });

  it('returns zero rates when no past events have eligible registrations', async () => {
    const prisma = {
      event: { count: jest.fn().mockResolvedValue(0) },
      eventRegistration: { count: jest.fn().mockResolvedValue(0) },
      checkIn: { count: jest.fn().mockResolvedValue(0) },
      feedback: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _avg: { overallRating: null, contentRating: null, organizationRating: null },
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new AnalyticsService(prisma as never);

    const result = await service.dashboard(3, {
      sub: 'admin-id',
      role: UserRole.SUPER_ADMIN,
    });

    expect(result.overview.attendanceRate).toBe(0);
    expect(result.overview.noShowRate).toBe(0);
  });

  it('scopes Event Manager analytics queries to the organizer', async () => {
    const prisma = {
      event: { count: jest.fn().mockResolvedValue(0) },
      eventRegistration: { count: jest.fn().mockResolvedValue(0) },
      checkIn: { count: jest.fn().mockResolvedValue(0) },
      feedback: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _avg: { overallRating: null, contentRating: null, organizationRating: null },
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    await new AnalyticsService(prisma as never).dashboard(2, {
      sub: 'organizer-id',
      role: UserRole.EVENT_MANAGER,
    });

    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { organizerId: 'organizer-id' },
    });
    expect(prisma.eventRegistration.count).toHaveBeenCalledWith({
      where: { event: { organizerId: 'organizer-id' } },
    });
    expect(prisma.feedback.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { event: { organizerId: 'organizer-id' } },
      }),
    );
  });
});
