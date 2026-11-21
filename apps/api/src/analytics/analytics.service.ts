import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

type EventPerformanceRow = {
  id: string;
  title: string;
  startDate: Date;
  status: string;
  registrations: bigint;
  confirmed: bigint;
  checkedIn: bigint;
  feedbackResponses: bigint;
  averageRating: number | null;
};

type MonthlyRegistrationRow = {
  month: string;
  registrations: bigint;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(months = 12, user: AuthUser) {
    const organizerId =
      user.role === UserRole.SUPER_ADMIN ? undefined : user.sub;
    const eventScope: Prisma.EventWhereInput = organizerId
      ? { organizerId }
      : {};
    const registrationScope: Prisma.EventRegistrationWhereInput = organizerId
      ? { event: { organizerId } }
      : {};
    const now = new Date();
    const currentMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const firstMonth = new Date(
      Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - months + 1, 1),
    );

    const [
      totalEvents,
      publishedEvents,
      totalRegistrations,
      confirmedRegistrations,
      checkedInAttendees,
      eligibleRegistrations,
      eligibleCheckIns,
      feedback,
      monthlyRows,
      eventRows,
    ] = await Promise.all([
      this.prisma.event.count({ where: eventScope }),
      this.prisma.event.count({ where: { ...eventScope, status: 'PUBLISHED' } }),
      this.prisma.eventRegistration.count({ where: registrationScope }),
      this.prisma.eventRegistration.count({ where: { ...registrationScope, status: 'CONFIRMED' } }),
      this.prisma.checkIn.count({
        where: organizerId
          ? { ticket: { registration: { event: { organizerId } } } }
          : {},
      }),
      this.prisma.eventRegistration.count({
        where: {
          status: 'CONFIRMED',
          event: {
            ...(organizerId ? { organizerId } : {}),
            endDate: { lt: now },
            status: { notIn: ['CANCELLED', 'ARCHIVED'] },
          },
        },
      }),
      this.prisma.checkIn.count({
        where: {
          ticket: {
            registration: {
              status: 'CONFIRMED',
              event: {
                ...(organizerId ? { organizerId } : {}),
                endDate: { lt: now },
                status: { notIn: ['CANCELLED', 'ARCHIVED'] },
              },
            },
          },
        },
      }),
      this.prisma.feedback.aggregate({
        where: organizerId ? { event: { organizerId } } : {},
        _count: { _all: true },
        _avg: {
          overallRating: true,
          contentRating: true,
          organizationRating: true,
        },
      }),
      this.prisma.$queryRaw<MonthlyRegistrationRow[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', "registeredAt"), 'YYYY-MM') AS "month",
               COUNT(*)::bigint AS "registrations"
        FROM "EventRegistration" registration
        JOIN "Event" event ON event."id" = registration."eventId"
        WHERE registration."registeredAt" >= ${firstMonth}
        ${organizerId ? Prisma.sql`AND event."organizerId" = ${organizerId}::uuid` : Prisma.empty}
        GROUP BY 1
        ORDER BY 1
      `),
      this.prisma.$queryRaw<EventPerformanceRow[]>(Prisma.sql`
        SELECT
          event."id",
          event."title",
          event."startDate",
          event."status"::text AS "status",
          (SELECT COUNT(*) FROM "EventRegistration" registration
            WHERE registration."eventId" = event."id")::bigint AS "registrations",
          (SELECT COUNT(*) FROM "EventRegistration" registration
            WHERE registration."eventId" = event."id"
              AND registration."status" = 'CONFIRMED')::bigint AS "confirmed",
          (SELECT COUNT(*) FROM "CheckIn" checkin
            JOIN "Ticket" ticket ON ticket."id" = checkin."ticketId"
            JOIN "EventRegistration" registration ON registration."id" = ticket."registrationId"
            WHERE registration."eventId" = event."id")::bigint AS "checkedIn",
          (SELECT COUNT(*) FROM "Feedback" response
            WHERE response."eventId" = event."id")::bigint AS "feedbackResponses",
          (SELECT AVG(response."overallRating") FROM "Feedback" response
            WHERE response."eventId" = event."id") AS "averageRating"
        FROM "Event" event
        ${organizerId ? Prisma.sql`WHERE event."organizerId" = ${organizerId}::uuid` : Prisma.empty}
        ORDER BY event."startDate" DESC
        LIMIT 20
      `),
    ]);

    const trendMap = new Map(
      monthlyRows.map((row) => [row.month, Number(row.registrations)]),
    );
    const registrationTrend = Array.from({ length: months }, (_, index) => {
      const monthDate = new Date(
        Date.UTC(
          firstMonth.getUTCFullYear(),
          firstMonth.getUTCMonth() + index,
          1,
        ),
      );
      const key = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
      return {
        month: key,
        registrations: trendMap.get(key) ?? 0,
      };
    });

    return {
      overview: {
        totalEvents,
        publishedEvents,
        totalRegistrations,
        confirmedRegistrations,
        checkedInAttendees,
        attendanceRate: rate(eligibleCheckIns, eligibleRegistrations),
        noShowRate: rate(
          Math.max(0, eligibleRegistrations - eligibleCheckIns),
          eligibleRegistrations,
        ),
        attendanceEligibleRegistrations: eligibleRegistrations,
        feedbackResponses: feedback._count._all,
        averageRatings: {
          overall: feedback._avg.overallRating,
          content: feedback._avg.contentRating,
          organization: feedback._avg.organizationRating,
        },
      },
      registrationTrend,
      eventPerformance: eventRows.map((event) => ({
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        status: event.status,
        registrations: Number(event.registrations),
        confirmed: Number(event.confirmed),
        checkedIn: Number(event.checkedIn),
        attendanceRate: rate(Number(event.checkedIn), Number(event.confirmed)),
        feedbackResponses: Number(event.feedbackResponses),
        averageRating: event.averageRating,
      })),
    };
  }
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Number(((numerator / denominator) * 100).toFixed(1));
}
