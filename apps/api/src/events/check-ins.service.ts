import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RegistrationStatus,
  TicketStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventAccessService } from './event-access.service.js';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
  ) {}

  async validateTicket(token: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        status: true,
        checkIn: { select: { checkedInAt: true } },
        registration: {
          select: {
            firstName: true,
            lastName: true,
            status: true,
            event: { select: { id: true, title: true, startDate: true } },
          },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isValid =
      ticket.status === TicketStatus.VALID &&
      ticket.registration.status === RegistrationStatus.CONFIRMED;
    return {
      valid: isValid,
      status: ticket.status,
      checkedInAt: ticket.checkIn?.checkedInAt ?? null,
      attendee: {
        firstName: ticket.registration.firstName,
        lastName: ticket.registration.lastName,
      },
      event: ticket.registration.event,
    };
  }

  async checkInByToken(eventId: string, token: string, user: AuthUser) {
    await this.access.requireManageAccess(eventId, user);
    return this.completeCheckIn(eventId, user, { tokenHash: hashToken(token) });
  }

  async checkInManually(
    eventId: string,
    registrationId: string,
    user: AuthUser,
  ) {
    await this.access.requireManageAccess(eventId, user);
    return this.completeCheckIn(eventId, user, { registrationId });
  }

  async list(eventId: string, user: AuthUser) {
    await this.access.requireManageAccess(eventId, user);
    return this.prisma.checkIn.findMany({
      where: { ticket: { registration: { eventId } } },
      orderBy: { checkedInAt: 'desc' },
      include: {
        ticket: {
          select: {
            registration: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                organization: true,
              },
            },
          },
        },
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  private async completeCheckIn(
    eventId: string,
    user: AuthUser,
    lookup: { tokenHash: string } | { registrationId: string },
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const ticketId = 'tokenHash' in lookup
        ? await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Ticket" WHERE "tokenHash" = ${lookup.tokenHash} FOR UPDATE
          `
        : await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Ticket" WHERE "registrationId" = ${lookup.registrationId}::uuid FOR UPDATE
          `;
      if (ticketId.length === 0) {
        throw new NotFoundException('Ticket not found');
      }

      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId[0]!.id },
        include: {
          checkIn: true,
          registration: {
            select: {
              id: true,
              eventId: true,
              firstName: true,
              lastName: true,
              status: true,
            },
          },
        },
      });
      if (!ticket || ticket.registration.eventId !== eventId) {
        throw new NotFoundException('Ticket is not valid for this event');
      }
      if (ticket.registration.status !== RegistrationStatus.CONFIRMED) {
        throw new ConflictException('Registration is not confirmed');
      }
      if (
        ticket.status === TicketStatus.CANCELLED ||
        ticket.status === TicketStatus.INVALID
      ) {
        throw new ConflictException('Ticket is not valid');
      }
      if (
        ticket.status === TicketStatus.CHECKED_IN ||
        ticket.checkIn !== null
      ) {
        throw new ConflictException('Ticket has already been checked in');
      }

      const checkedIn = await transaction.checkIn.create({
        data: {
          ticketId: ticket.id,
          checkedInBy: user.sub,
        },
        select: { id: true, checkedInAt: true },
      });
      await transaction.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.CHECKED_IN },
      });
      return {
        success: true,
        checkedInAt: checkedIn.checkedInAt,
        attendee: {
          id: ticket.registration.id,
          firstName: ticket.registration.firstName,
          lastName: ticket.registration.lastName,
        },
      };
    });
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
