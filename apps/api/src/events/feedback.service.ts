import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Prisma, RegistrationStatus, TicketStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventAccessService } from './event-access.service.js';
import type { SubmitFeedbackDto } from './dto/submit-feedback.dto.js';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
  ) {}

  async submit(input: SubmitFeedbackDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { feedbackTokenHash: hashToken(input.feedbackToken) },
      select: {
        status: true,
        checkIn: { select: { id: true } },
        registration: {
          select: {
            id: true,
            status: true,
            eventId: true,
            event: { select: { status: true, endDate: true } },
          },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    if (
      ticket.status !== TicketStatus.CHECKED_IN ||
      ticket.registration.status !== RegistrationStatus.CONFIRMED ||
      !ticket.checkIn
    ) {
      throw new ForbiddenException('Only checked-in attendees can submit feedback');
    }
    if (
      ticket.registration.event.status !== EventStatus.COMPLETED &&
      ticket.registration.event.endDate > new Date()
    ) {
      throw new ForbiddenException('Feedback is available after the event');
    }

    try {
      return await this.prisma.feedback.create({
        data: {
          eventId: ticket.registration.eventId,
          registrationId: ticket.registration.id,
          overallRating: input.overallRating,
          contentRating: input.contentRating,
          organizationRating: input.organizationRating,
          comment: input.comment?.trim() || null,
          interestedInPrograms: input.interestedInPrograms,
        },
        select: {
          id: true,
          overallRating: true,
          contentRating: true,
          organizationRating: true,
          comment: true,
          interestedInPrograms: true,
          submittedAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Feedback has already been submitted');
      }
      throw error;
    }
  }

  async list(eventId: string, user: AuthUser) {
    await this.access.requireManageAccess(eventId, user);
    return this.prisma.feedback.findMany({
      where: { eventId },
      orderBy: { submittedAt: 'desc' },
      include: {
        registration: {
          select: { firstName: true, lastName: true },
        },
      },
    });
  }

  async analytics(eventId: string, user: AuthUser) {
    await this.access.requireManageAccess(eventId, user);
    const [feedback, checkIns] = await Promise.all([
      this.prisma.feedback.aggregate({
        where: { eventId },
        _count: { _all: true },
        _avg: {
          overallRating: true,
          contentRating: true,
          organizationRating: true,
        },
      }),
      this.prisma.checkIn.count({
        where: { ticket: { registration: { eventId } } },
      }),
    ]);

    const responseCount = feedback._count._all;
    return {
      responseCount,
      checkedInCount: checkIns,
      responseRate:
        checkIns === 0 ? 0 : Number((responseCount / checkIns).toFixed(4)),
      averageRatings: {
        overall: feedback._avg.overallRating,
        content: feedback._avg.contentRating,
        organization: feedback._avg.organizationRating,
      },
      interestedInProgramsCount: await this.prisma.feedback.count({
        where: { eventId, interestedInPrograms: true },
      }),
    };
  }

  async exportCsv(eventId: string, user: AuthUser): Promise<string> {
    const feedback = await this.list(eventId, user);
    const rows = [
      [
        'First name',
        'Last name',
        'Overall rating',
        'Content rating',
        'Organization rating',
        'Interested in programs',
        'Comment',
        'Submitted at',
      ],
      ...feedback.map((response) => [
        response.registration.firstName,
        response.registration.lastName,
        String(response.overallRating),
        response.contentRating === null ? '' : String(response.contentRating),
        response.organizationRating === null
          ? ''
          : String(response.organizationRating),
        response.interestedInPrograms === null
          ? ''
          : response.interestedInPrograms
            ? 'Yes'
            : 'No',
        response.comment ?? '',
        response.submittedAt.toISOString(),
      ]),
    ];
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function csvCell(value: string): string {
  const safeValue = /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}
