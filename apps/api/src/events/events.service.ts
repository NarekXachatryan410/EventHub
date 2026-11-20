import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CrmSyncStatus,
  EventStatus,
  Prisma,
  UserRole,
  type Event,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import type { AuthUser } from '../auth/auth.types.js';
import { EmailQueueService } from '../email/email-queue.service.js';
import type { EmailPayload } from '../email/email.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventAccessService } from './event-access.service.js';
import type { CreateEventDto } from './dto/create-event.dto.js';
import type { UpdateEventDto } from './dto/update-event.dto.js';

const activeRegistrationStatuses = ['PENDING', 'CONFIRMED'] as const;
const publicStatuses = [
  EventStatus.PUBLISHED,
  EventStatus.REGISTRATION_CLOSED,
  EventStatus.COMPLETED,
  EventStatus.CANCELLED,
];

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
    private readonly emailQueue: EmailQueueService,
    private readonly config: ConfigService,
  ) {}

  async listPublic(type?: CreateEventDto['type']) {
    const events = await this.prisma.event.findMany({
      where: {
        status: { in: publicStatuses },
        ...(type ? { type } : {}),
      },
      orderBy: { startDate: 'asc' },
      include: {
        organizer: {
          select: { firstName: true, lastName: true },
        },
        _count: {
          select: {
            registrations: {
              where: { status: { in: [...activeRegistrationStatuses] } },
            },
          },
        },
      },
    });
    return events.map(({ _count, ...event }) => ({
      ...event,
      remainingAttendees:
        event.maxAttendees === null
          ? null
          : Math.max(0, event.maxAttendees - _count.registrations),
    }));
  }

  async getPublicBySlug(slug: string) {
    const event = await this.prisma.event.findFirst({
      where: { slug, status: { in: publicStatuses } },
      include: {
        organizer: {
          select: { firstName: true, lastName: true },
        },
        _count: {
          select: {
            registrations: {
              where: { status: { in: [...activeRegistrationStatuses] } },
            },
          },
        },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const { _count, ...data } = event;
    return {
      ...data,
      remainingAttendees:
        data.maxAttendees === null
          ? null
          : Math.max(0, data.maxAttendees - _count.registrations),
    };
  }

  async listManaged(user: AuthUser) {
    const where = await this.access.listWhere(user);
    if (user.role === 'CHECK_IN_STAFF') {
      return this.prisma.event.findMany({
        where,
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          status: true,
          location: true,
          startDate: true,
          endDate: true,
          maxAttendees: true,
          _count: { select: { registrations: true } },
        },
      });
    }
    return this.prisma.event.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        organizer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { registrations: true } },
      },
    });
  }

  async getManaged(eventId: string, user: AuthUser) {
    await this.access.requireManageAccess(eventId, user);
    if (user.role === 'CHECK_IN_STAFF') {
      return this.prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          status: true,
          location: true,
          startDate: true,
          endDate: true,
          maxAttendees: true,
          _count: { select: { registrations: true } },
        },
      });
    }
    return this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        organizer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        staffAssignments: {
          where: { staff: { isActive: true } },
          select: {
            staff: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        _count: { select: { registrations: true, feedback: true } },
      },
    });
  }

  listCheckInStaff() {
    return this.prisma.user.findMany({
      where: { role: UserRole.CHECK_IN_STAFF, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async assignCheckInStaff(
    eventId: string,
    staffIds: string[],
    user: AuthUser,
  ) {
    await this.access.requireEditAccess(eventId, user);
    const staff = await this.prisma.user.findMany({
      where: {
        id: { in: staffIds },
        role: UserRole.CHECK_IN_STAFF,
        isActive: true,
      },
      select: { id: true },
    });
    if (staff.length !== staffIds.length) {
      throw new BadRequestException(
        'Every assigned staff member must be an active Check-in Staff account',
      );
    }

    await this.prisma.$transaction([
      this.prisma.eventStaffAssignment.deleteMany({ where: { eventId } }),
      ...(staffIds.length
        ? [
            this.prisma.eventStaffAssignment.createMany({
              data: staffIds.map((staffId) => ({ eventId, staffId })),
            }),
          ]
        : []),
    ]);
    return this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        staffAssignments: {
          select: {
            staff: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
  }

  async create(input: CreateEventDto, user: AuthUser) {
    this.validateDates(input);
    try {
      return await this.prisma.event.create({
        data: this.createData(input, user.sub),
      });
    } catch (error) {
      this.throwForUniqueSlug(error);
    }
  }

  async update(eventId: string, input: UpdateEventDto, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE
        `;
        const current = await transaction.event.findUnique({
          where: { id: eventId },
          select: {
            title: true,
            slug: true,
            location: true,
            startDate: true,
            endDate: true,
            registrationDeadline: true,
            reminderOffsetsHours: true,
          },
        });
        if (!current) throw new NotFoundException('Event not found');
        this.validateDates({
          startDate: input.startDate ?? current.startDate.toISOString(),
          endDate: input.endDate ?? current.endDate.toISOString(),
          registrationDeadline:
            input.registrationDeadline ?? current.registrationDeadline.toISOString(),
        });

        const updated = await transaction.event.update({
          where: { id: eventId },
          data: this.eventData(input),
        });
        if (
          input.startDate !== undefined ||
          input.reminderOffsetsHours !== undefined ||
          input.title !== undefined ||
          input.slug !== undefined ||
          input.location !== undefined
        ) {
          await this.emailQueue.synchronizeEventReminders(transaction, updated);
        }
        return updated;
      });
    } catch (error) {
      this.throwForUniqueSlug(error);
    }
  }

  async remove(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    await this.prisma.event.delete({ where: { id: eventId } });
    return { success: true };
  }

  async publish(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    await this.access.publishable(eventId);
    return this.prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PUBLISHED },
    });
  }

  async unpublish(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    const current = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Event not found');
    if (
      current.status !== EventStatus.PUBLISHED &&
      current.status !== EventStatus.REGISTRATION_CLOSED
    ) {
      throw new ConflictException('Only published events can be unpublished');
    }
    return this.prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.DRAFT },
    });
  }

  async cancel(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE
      `;
      const current = await transaction.event.findUnique({
        where: { id: eventId },
        include: {
          registrations: {
            where: { status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] } },
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });
      if (!current) throw new NotFoundException('Event not found');
      const event = await transaction.event.update({
        where: { id: eventId },
        data: {
          status: EventStatus.CANCELLED,
          registrationEnabled: false,
        },
      });
      const emailLogIds: string[] = [];
      for (const registration of current.registrations) {
        const log = await this.emailQueue.createOutboxEntry(transaction, {
          registrationId: registration.id,
          type: 'EVENT_CANCELLATION',
          idempotencyKey: `event-cancelled:${registration.id}`,
          payload: this.eventEmailPayload(registration, current),
        });
        emailLogIds.push(log.id);
      }
      await transaction.emailLog.updateMany({
        where: {
          registration: { eventId },
          type: 'EVENT_REMINDER',
          status: 'PENDING',
        },
        data: { status: 'CANCELLED', errorMessage: 'Event cancelled' },
      });
      await transaction.eventRegistration.updateMany({
        where: {
          eventId,
          status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] },
        },
        data: { status: 'CANCELLED' },
      });
      await transaction.crmSyncLog.updateMany({
        where: { registration: { eventId } },
        data: {
          status: CrmSyncStatus.PENDING,
          attempts: 0,
          lastAttemptAt: null,
          errorMessage: null,
          syncedAt: null,
          version: { increment: 1 },
        },
      });
      await transaction.ticket.updateMany({
        where: {
          registration: { eventId },
          status: { in: ['VALID', 'CHECKED_IN'] },
        },
        data: { status: 'CANCELLED' },
      });
      return { event, emailLogIds };
    });
    await Promise.all(result.emailLogIds.map((id) => this.dispatchEmail(id)));
    return result.event;
  }

  async complete(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE
      `;
      const current = await transaction.event.findUnique({
        where: { id: eventId },
        include: {
          registrations: {
            where: {
              status: 'CONFIRMED',
              ticket: { is: { checkIn: { isNot: null } } },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              ticket: { select: { id: true } },
            },
          },
        },
      });
      if (!current) throw new NotFoundException('Event not found');
      if (current.status === EventStatus.CANCELLED) {
        throw new ConflictException('Cancelled events cannot be completed');
      }
      if (current.status === EventStatus.ARCHIVED) {
        throw new ConflictException('Archived events must be restored before completion');
      }
      const event = await transaction.event.update({
        where: { id: eventId },
        data: {
          status: EventStatus.COMPLETED,
          registrationEnabled: false,
        },
      });
      const emailLogIds: string[] = [];
      if (current.status !== EventStatus.COMPLETED) {
        for (const registration of current.registrations) {
          if (!registration.ticket) continue;
          const idempotencyKey = `post-event-thank-you:${registration.id}`;
          const existingFollowUp = await transaction.emailLog.findUnique({
            where: { idempotencyKey },
            select: { id: true },
          });
          if (existingFollowUp) continue;
          const feedbackToken = randomBytes(32).toString('base64url');
          await transaction.ticket.update({
            where: { id: registration.ticket.id },
            data: { feedbackTokenHash: this.hashToken(feedbackToken) },
          });
          const log = await this.emailQueue.createOutboxEntry(transaction, {
            registrationId: registration.id,
            type: 'POST_EVENT_THANK_YOU',
            idempotencyKey,
            payload: {
              ...this.eventEmailPayload(registration, current),
              feedbackUrl: `${this.webOrigin()}/feedback?token=${encodeURIComponent(feedbackToken)}`,
            },
          });
          emailLogIds.push(log.id);
        }
      }
      return { event, emailLogIds };
    });
    await Promise.all(result.emailLogIds.map((id) => this.dispatchEmail(id)));
    return result.event;
  }

  async closeRegistration(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    const current = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Event not found');
    if (current.status !== EventStatus.PUBLISHED) {
      throw new ConflictException('Registration can only be closed for published events');
    }
    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: EventStatus.REGISTRATION_CLOSED,
        registrationEnabled: false,
      },
    });
  }

  async archive(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: EventStatus.ARCHIVED,
        registrationEnabled: false,
      },
    });
  }

  async restore(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.status !== EventStatus.ARCHIVED) {
      throw new ConflictException('Only archived events can be restored');
    }
    return this.prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.DRAFT },
    });
  }

  private eventData(
    input: CreateEventDto | UpdateEventDto,
  ): Prisma.EventUpdateInput {
    return {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.slug !== undefined ? { slug: input.slug.trim().toLowerCase() } : {}),
      ...(input.description !== undefined
        ? { description: sanitizeHtml(input.description) }
        : {}),
      ...(input.coverImage !== undefined
        ? { coverImage: input.coverImage || null }
        : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.location !== undefined ? { location: input.location.trim() } : {}),
      ...(input.startDate !== undefined
        ? { startDate: new Date(input.startDate) }
        : {}),
      ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
      ...(input.registrationDeadline !== undefined
        ? { registrationDeadline: new Date(input.registrationDeadline) }
        : {}),
      ...(input.maxAttendees !== undefined
        ? { maxAttendees: input.maxAttendees }
        : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: input.contactEmail.trim().toLowerCase() || null }
        : {}),
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle || null } : {}),
      ...(input.seoDescription !== undefined
        ? { seoDescription: input.seoDescription || null }
        : {}),
      ...(input.registrationEnabled !== undefined
        ? { registrationEnabled: input.registrationEnabled }
        : {}),
      ...(input.registrationQuestions !== undefined
        ? {
              registrationQuestions: this.serializeQuestions(
                input.registrationQuestions,
              ),
          }
        : {}),
      ...(input.reminderOffsetsHours !== undefined
        ? { reminderOffsetsHours: input.reminderOffsetsHours }
        : {}),
    };
  }

  private createData(
    input: CreateEventDto,
    organizerId: string,
  ): Prisma.EventCreateInput {
    return {
      title: input.title.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: sanitizeHtml(input.description),
      type: input.type,
      location: input.location.trim(),
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      registrationDeadline: new Date(input.registrationDeadline),
      registrationEnabled: input.registrationEnabled,
      status: EventStatus.DRAFT,
      organizer: { connect: { id: organizerId } },
      ...(input.coverImage !== undefined
        ? { coverImage: input.coverImage || null }
        : {}),
      ...(input.maxAttendees !== undefined
        ? { maxAttendees: input.maxAttendees }
        : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: input.contactEmail.trim().toLowerCase() || null }
        : {}),
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle || null } : {}),
      ...(input.seoDescription !== undefined
        ? { seoDescription: input.seoDescription || null }
        : {}),
      ...(input.registrationQuestions !== undefined
        ? {
            registrationQuestions: this.serializeQuestions(
              input.registrationQuestions,
            ),
          }
        : {}),
      ...(input.reminderOffsetsHours !== undefined
        ? { reminderOffsetsHours: input.reminderOffsetsHours }
        : {}),
    };
  }

  private serializeQuestions(
    questions: NonNullable<CreateEventDto['registrationQuestions']>,
  ): Prisma.InputJsonValue {
    return questions.map((question) => ({
      key: question.key,
      label: question.label,
      type: question.type,
      required: question.required,
      ...(question.options ? { options: question.options } : {}),
    }));
  }

  private eventEmailPayload(
    registration: {
      firstName: string;
      lastName: string;
      email: string;
    },
    event: Pick<Event, 'slug' | 'title' | 'location' | 'startDate'>,
  ): EmailPayload {
    return {
      to: registration.email,
      firstName: registration.firstName,
      lastName: registration.lastName,
      eventTitle: event.title,
      eventDate: event.startDate.toISOString(),
      eventLocation: event.location,
      eventUrl: `${this.webOrigin()}/events/${event.slug}`,
    };
  }

  private webOrigin(): string {
    return (
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  private async dispatchEmail(id: string): Promise<void> {
    try {
      await this.emailQueue.dispatchLog(id);
    } catch (error) {
      this.logger.error(
        `Email log ${id} remains in the durable outbox`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private validateDates(
    dates: {
      startDate: string;
      endDate: string;
      registrationDeadline: string;
    },
  ): void {
    const startDate = new Date(dates.startDate);
    const endDate = new Date(dates.endDate);
    const registrationDeadline = new Date(dates.registrationDeadline);
    if (
      Number.isNaN(startDate.valueOf()) ||
      Number.isNaN(endDate.valueOf()) ||
      Number.isNaN(registrationDeadline.valueOf())
    ) {
      throw new BadRequestException('Event dates must be valid date-time values');
    }
    if (endDate <= startDate) {
      throw new BadRequestException('Event end date must be after its start date');
    }
    if (registrationDeadline > startDate) {
      throw new BadRequestException('Registration deadline cannot be after the event starts');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private throwForUniqueSlug(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('An event with this slug already exists');
    }
    throw error;
  }
}
