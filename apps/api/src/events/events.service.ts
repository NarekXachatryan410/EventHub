import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import type { AuthUser } from '../auth/auth.types.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
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
    return this.prisma.event.findMany({
      where: await this.access.listWhere(user),
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
    return this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        organizer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { registrations: true, feedback: true } },
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
    const current = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { startDate: true, endDate: true, registrationDeadline: true },
    });
    this.validateDates(
      {
        startDate: input.startDate ?? current.startDate.toISOString(),
        endDate: input.endDate ?? current.endDate.toISOString(),
        registrationDeadline:
          input.registrationDeadline ?? current.registrationDeadline.toISOString(),
      },
      true,
    );
    try {
      return await this.prisma.event.update({
        where: { id: eventId },
        data: this.eventData(input),
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
    return this.prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.DRAFT },
    });
  }

  async cancel(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.event.update({
        where: { id: eventId },
        data: {
          status: EventStatus.CANCELLED,
          registrationEnabled: false,
        },
      });
      await transaction.eventRegistration.updateMany({
        where: {
          eventId,
          status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] },
        },
        data: { status: 'CANCELLED' },
      });
      await transaction.ticket.updateMany({
        where: {
          registration: { eventId },
          status: { in: ['VALID', 'CHECKED_IN'] },
        },
        data: { status: 'CANCELLED' },
      });
      return event;
    });
  }

  async closeRegistration(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: EventStatus.REGISTRATION_CLOSED,
        registrationEnabled: false,
      },
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

  private validateDates(
    dates: {
      startDate: string;
      endDate: string;
      registrationDeadline: string;
    },
    existing = false,
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
    if (!existing && registrationDeadline < new Date()) {
      throw new BadRequestException('Registration deadline must be in the future');
    }
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
