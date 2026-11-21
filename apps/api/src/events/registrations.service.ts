import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailType,
  EventStatus,
  type Event,
  Prisma,
  RegistrationStatus,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import type { AuthUser } from '../auth/auth.types.js';
import { EmailQueueService } from '../email/email-queue.service.js';
import type { EmailPayload } from '../email/email.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventAccessService } from './event-access.service.js';
import type {
  CancelRegistrationDto,
  CreateRegistrationDto,
} from './dto/create-registration.dto.js';
import type { ListRegistrationsPageDto } from './dto/list-registrations-page.dto.js';

const activeStatuses: RegistrationStatus[] = [
  RegistrationStatus.PENDING,
  RegistrationStatus.CONFIRMED,
];

type RegistrationEvent = Pick<
  Event,
  | 'id'
  | 'slug'
  | 'title'
  | 'location'
  | 'startDate'
  | 'status'
  | 'registrationEnabled'
  | 'registrationDeadline'
  | 'maxAttendees'
  | 'reminderOffsetsHours'
  | 'registrationQuestions'
  | 'allowSelfCancellation'
>;

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
    private readonly emailQueue: EmailQueueService,
    private readonly config: ConfigService,
  ) {}

  async register(eventId: string, input: CreateRegistrationDto) {
    const result = await this.createRegistration(eventId, input);
    await Promise.all(result.emailLogIds.map((id) => this.dispatchEmail(id)));
    return result.response;
  }

  async registerManually(
    eventId: string,
    input: CreateRegistrationDto,
    user: AuthUser,
  ) {
    await this.access.requireManageAccess(eventId, user);
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.EVENT_MANAGER
    ) {
      throw new ForbiddenException('Only event managers or super admins can register attendees');
    }

    const result = await this.createRegistration(eventId, input, false);
    await Promise.all(result.emailLogIds.map((id) => this.dispatchEmail(id)));
    return result.response;
  }

  async list(eventId: string, user: AuthUser) {
    await this.access.requireManageAccess(eventId, user);
    return this.prisma.eventRegistration.findMany({
      where: { eventId },
      orderBy: { registeredAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        organization: true,
        status: true,
        registeredAt: true,
        ticket: {
          select: {
            status: true,
            checkIn: { select: { checkedInAt: true, checkedInBy: true } },
          },
        },
      },
    });
  }

  async listPage(
    eventId: string,
    user: AuthUser,
    query: ListRegistrationsPageDto,
  ) {
    await this.access.requireManageAccess(eventId, user);
    const terms = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.EventRegistrationWhereInput = {
      eventId,
      ...(terms.length
        ? {
            AND: terms.map((term) => ({
              OR: [
                { firstName: { contains: term, mode: 'insensitive' as const } },
                { lastName: { contains: term, mode: 'insensitive' as const } },
                { email: { contains: term, mode: 'insensitive' as const } },
                { organization: { contains: term, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };
    const [total, eventTotal, confirmedCount, checkedInCount, registrations] =
      await Promise.all([
      this.prisma.eventRegistration.count({ where }),
      this.prisma.eventRegistration.count({ where: { eventId } }),
      this.prisma.eventRegistration.count({
        where: { eventId, status: RegistrationStatus.CONFIRMED },
      }),
      this.prisma.eventRegistration.count({
        where: { eventId, ticket: { is: { checkIn: { isNot: null } } } },
      }),
      this.prisma.eventRegistration.findMany({
        where,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          organization: true,
          status: true,
          registeredAt: true,
          ticket: {
            select: {
              status: true,
              checkIn: { select: { checkedInAt: true, checkedInBy: true } },
            },
          },
        },
      }),
      ]);
    const hasMore = registrations.length > query.limit;
    const items = hasMore ? registrations.slice(0, query.limit) : registrations;
    return {
      items,
      total,
      eventTotal,
      confirmedCount,
      checkedInCount,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    };
  }

  async getById(registrationId: string, user: AuthUser) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { eventId: true },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    await this.access.requireManageAccess(registration.eventId, user);
    return this.prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
      select: {
        id: true,
        eventId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        organization: true,
        interestedInPrograms: true,
        additionalAnswers: true,
        status: true,
        marketingConsent: true,
        registeredAt: true,
        ticket: {
          select: {
            id: true,
            status: true,
            checkIn: { select: { checkedInAt: true, checkedInBy: true } },
          },
        },
      },
    });
  }

  async exportCsv(eventId: string, user: AuthUser): Promise<string> {
    const registrations = await this.list(eventId, user);
    const rows = [
      [
        'First name',
        'Last name',
        'Email',
        'Phone',
        'Organization',
        'Status',
        'Registered at',
        'Ticket status',
        'Checked in at',
      ],
      ...registrations.map((registration) => [
        registration.firstName,
        registration.lastName,
        registration.email,
        registration.phone ?? '',
        registration.organization ?? '',
        registration.status,
        registration.registeredAt.toISOString(),
        registration.ticket?.status ?? '',
        registration.ticket?.checkIn?.checkedInAt.toISOString() ?? '',
      ]),
    ];
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  async cancelByToken(
    registrationId: string,
    input: CancelRegistrationDto,
  ) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT event."id"
        FROM "Event" AS event
        JOIN "EventRegistration" AS registration
          ON registration."eventId" = event."id"
        WHERE registration."id" = ${registrationId}::uuid
        FOR UPDATE OF event
      `;
      const registration = await transaction.eventRegistration.findUnique({
        where: { id: registrationId },
        include: { event: true, ticket: true },
      });
      if (!registration) {
        throw new NotFoundException('Registration not found');
      }
      if (!registration.event.allowSelfCancellation) {
        throw new ForbiddenException('Self-cancellation is disabled for this event');
      }
      if (
        !registration.cancellationTokenHash ||
        !matchesToken(input.cancellationToken, registration.cancellationTokenHash)
      ) {
        throw new ForbiddenException('Cancellation token is invalid');
      }
      if (registration.status === RegistrationStatus.CANCELLED) {
        throw new ConflictException('Registration is already cancelled');
      }
      if (
        registration.status !== RegistrationStatus.CONFIRMED &&
        registration.status !== RegistrationStatus.WAITLISTED
      ) {
        throw new ConflictException('This registration cannot be cancelled');
      }

      await transaction.eventRegistration.update({
        where: { id: registration.id },
        data: { status: RegistrationStatus.CANCELLED },
      });
      if (registration.ticket) {
        await transaction.ticket.update({
          where: { id: registration.ticket.id },
          data: { status: TicketStatus.CANCELLED },
        });
      }
      const emailLog = await this.emailQueue.createOutboxEntry(transaction, {
        registrationId: registration.id,
        type: EmailType.REGISTRATION_CANCELLATION,
        idempotencyKey: `registration-cancelled:${registration.id}`,
        payload: this.emailPayload(registration, registration.event),
      });
      const emailLogIds = [emailLog.id];
      await transaction.emailLog.updateMany({
        where: {
          registrationId: registration.id,
          type: EmailType.EVENT_REMINDER,
          status: 'PENDING',
        },
        data: { status: 'CANCELLED', errorMessage: 'Registration cancelled' },
      });
      if (
        registration.status === RegistrationStatus.CONFIRMED &&
        registration.event.status === EventStatus.PUBLISHED &&
        registration.event.registrationEnabled &&
        registration.event.registrationDeadline > new Date()
      ) {
        const nextWaitlisted = await transaction.eventRegistration.findFirst({
          where: {
            eventId: registration.eventId,
            status: RegistrationStatus.WAITLISTED,
          },
          orderBy: { registeredAt: 'asc' },
        });
        if (nextWaitlisted) {
          const ticketToken = randomBytes(32).toString('base64url');
          const qrCodeDataUrl = await QRCode.toDataURL(ticketToken, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 320,
          });
          await transaction.eventRegistration.update({
            where: { id: nextWaitlisted.id },
            data: {
              status: RegistrationStatus.CONFIRMED,
              ticket: {
                create: {
                  tokenHash: hashToken(ticketToken),
                },
              },
            },
          });
          const promotionEmail = await this.emailQueue.createOutboxEntry(
            transaction,
            {
              registrationId: nextWaitlisted.id,
              type: EmailType.REGISTRATION_CONFIRMATION,
              idempotencyKey: `waitlist-promoted:${nextWaitlisted.id}`,
              payload: this.emailPayload(
                nextWaitlisted,
                registration.event,
                {
                  ticketToken,
                  qrCodeBase64: qrCodeDataUrl.split(',')[1],
                },
              ),
            },
          );
          emailLogIds.push(promotionEmail.id);
          emailLogIds.push(
            ...(await this.scheduleReminders(
              transaction,
              nextWaitlisted,
              registration.event,
              ticketToken,
            )),
          );
        }
      }
      return emailLogIds;
    });

    for (const emailLogId of result) {
      await this.dispatchEmail(emailLogId);
    }
    return { success: true };
  }

  private async createRegistration(
    eventId: string,
    input: CreateRegistrationDto,
    allowWaitlist = true,
  ) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const ticketToken = randomBytes(32).toString('base64url');
    const cancellationToken = randomBytes(32).toString('base64url');
    const qrCodeDataUrl = await QRCode.toDataURL(ticketToken, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE
        `;
        const event = await transaction.event.findUnique({
          where: { id: eventId },
        });
        if (!event) {
          throw new NotFoundException('Event not found');
        }
        this.ensureRegistrationOpen(event);
        const answers = validateAnswers(
          event.registrationQuestions,
          input.additionalAnswers,
        );

        const existing = await transaction.eventRegistration.findUnique({
          where: {
            eventId_normalizedEmail: { eventId, normalizedEmail },
          },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException('This email is already registered for the event');
        }

        const activeCount = await transaction.eventRegistration.count({
          where: { eventId, status: { in: activeStatuses } },
        });
        const full =
          event.maxAttendees !== null && activeCount >= event.maxAttendees;
        if (full && !(allowWaitlist && input.joinWaitlist)) {
          throw new ConflictException('This event is full');
        }

        const status = full
          ? RegistrationStatus.WAITLISTED
          : RegistrationStatus.CONFIRMED;
        const registration = await transaction.eventRegistration.create({
          data: {
            eventId,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            email: normalizedEmail,
            normalizedEmail,
            phone: cleanOptional(input.phone),
            organization: cleanOptional(input.organization),
            interestedInPrograms: input.interestedInPrograms ?? null,
            additionalAnswers: answers,
            marketingConsent: input.marketingConsent ?? false,
            status,
            cancellationTokenHash: hashToken(cancellationToken),
            ...(status === RegistrationStatus.CONFIRMED
              ? {
                  ticket: {
                    create: {
                      tokenHash: hashToken(ticketToken),
                    },
                  },
                }
              : {}),
          },
          include: {
            ticket: { select: { id: true } },
          },
        });

        const emailType =
          status === RegistrationStatus.WAITLISTED
            ? EmailType.WAITLIST_CONFIRMATION
            : EmailType.REGISTRATION_CONFIRMATION;
        const payload = this.emailPayload(registration, event, {
          cancellationToken,
          ...(status === RegistrationStatus.CONFIRMED
            ? {
                ticketToken,
                qrCodeBase64: qrCodeDataUrl.split(',')[1],
              }
            : {}),
        });
        const emailLog = await this.emailQueue.createOutboxEntry(transaction, {
          registrationId: registration.id,
          type: emailType,
          idempotencyKey: `registration-${status.toLowerCase()}:${registration.id}`,
          payload,
        });
        const emailLogIds = [emailLog.id];
        if (status === RegistrationStatus.CONFIRMED) {
          emailLogIds.push(
            ...(await this.scheduleReminders(
              transaction,
              registration,
              event,
              ticketToken,
            )),
          );
        }
        return {
          registration,
          status,
          emailLogIds,
        };
      });

      return {
        emailLogIds: result.emailLogIds,
        response: {
          id: result.registration.id,
          status: result.status,
          ...(result.status === RegistrationStatus.CONFIRMED
            ? {
                ticket: {
                  token: ticketToken,
                  qrCodeDataUrl,
                },
              }
            : {}),
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This email is already registered for the event');
      }
      throw error;
    }
  }

  private ensureRegistrationOpen(event: RegistrationEvent): void {
    if (
      event.status !== EventStatus.PUBLISHED ||
      !event.registrationEnabled ||
      event.registrationDeadline <= new Date()
    ) {
      throw new ConflictException('Registration is not open for this event');
    }
  }

  private emailPayload(
    registration: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    },
    event: RegistrationEvent,
    tokens: {
      ticketToken?: string;
      cancellationToken?: string;
      qrCodeBase64?: string;
    } = {},
  ): EmailPayload {
    const webOrigin = (
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
    const eventUrl = `${webOrigin}/events/${event.slug}`;
    return {
      to: registration.email,
      firstName: registration.firstName,
      lastName: registration.lastName,
      eventTitle: event.title,
      eventDate: event.startDate.toISOString(),
      eventLocation: event.location,
      eventUrl,
      ticketUrl: tokens.ticketToken
        ? `${webOrigin}/tickets/${encodeURIComponent(tokens.ticketToken)}`
        : eventUrl,
      cancellationUrl: tokens.cancellationToken
        ? `${webOrigin}/registrations/cancel?registrationId=${registration.id}&token=${encodeURIComponent(tokens.cancellationToken)}`
        : eventUrl,
      ...(tokens.qrCodeBase64 ? { qrCodeBase64: tokens.qrCodeBase64 } : {}),
    };
  }

  private async scheduleReminders(
    transaction: Prisma.TransactionClient,
    registration: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    },
    event: RegistrationEvent,
    ticketToken: string,
  ): Promise<string[]> {
    const now = Date.now();
    if (event.startDate.getTime() <= now) return [];
    const scheduledIds: string[] = [];
    for (const offset of new Set(event.reminderOffsetsHours)) {
      const scheduledAt = new Date(
        event.startDate.getTime() - offset * 60 * 60 * 1000,
      );
      if (scheduledAt.getTime() <= now) continue;
      const log = await this.emailQueue.createOutboxEntry(transaction, {
        registrationId: registration.id,
        type: EmailType.EVENT_REMINDER,
        idempotencyKey: `event-reminder:${registration.id}:${offset}`,
        scheduledAt,
        payload: this.emailPayload(registration, event, { ticketToken }),
      });
      scheduledIds.push(log.id);
    }
    return scheduledIds;
  }

  private async dispatchEmail(emailLogId: string): Promise<void> {
    try {
      await this.emailQueue.dispatchLog(emailLogId);
    } catch (error) {
      this.logger.error(
        `Email log ${emailLogId} remains in the durable outbox`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function matchesToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cleanOptional(value?: string): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function validateAnswers(
  configuredQuestions: Prisma.JsonValue | null,
  answers: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const questionList = Array.isArray(configuredQuestions)
    ? configuredQuestions.filter(isQuestion)
    : [];
  const submitted = answers ?? {};
  const allowedKeys = new Set(questionList.map((question) => question.key));
  if (Object.keys(submitted).some((key) => !allowedKeys.has(key))) {
    throw new BadRequestException('An answer was supplied for an unknown question');
  }

  const validated: Record<string, Prisma.InputJsonValue> = {};
  for (const question of questionList) {
    const value = submitted[question.key];
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      if (question.required) {
        throw new BadRequestException(`${question.label} is required`);
      }
      continue;
    }
    if (question.type === 'MULTIPLE_CHOICE') {
      if (
        !Array.isArray(value) ||
        !value.every(
          (item): item is string =>
            typeof item === 'string' && question.options?.includes(item) === true,
        )
      ) {
        throw new BadRequestException(`${question.label} contains an invalid option`);
      }
      validated[question.key] = value;
      continue;
    }
    if (typeof value !== 'string' || value.length > 5000) {
      throw new BadRequestException(`${question.label} must be a valid text answer`);
    }
    if (
      question.type === 'SINGLE_CHOICE' &&
      !question.options?.includes(value)
    ) {
      throw new BadRequestException(`${question.label} contains an invalid option`);
    }
    validated[question.key] = value;
  }
  return Object.keys(validated).length > 0
    ? validated
    : Prisma.JsonNull;
}

function isQuestion(value: Prisma.JsonValue): value is {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
} {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return false;
  }
  return (
    typeof value.key === 'string' &&
    typeof value.label === 'string' &&
    typeof value.type === 'string' &&
    typeof value.required === 'boolean' &&
    (value.options === undefined ||
      (Array.isArray(value.options) &&
        value.options.every((option) => typeof option === 'string')))
  );
}

function csvCell(value: string): string {
  const safeValue = /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}
