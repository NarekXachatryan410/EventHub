import { jest } from '@jest/globals';
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

    const result = await service.dashboard(3);

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

    const result = await service.dashboard(3);

    expect(result.overview.attendanceRate).toBe(0);
    expect(result.overview.noShowRate).toBe(0);
  });
});
