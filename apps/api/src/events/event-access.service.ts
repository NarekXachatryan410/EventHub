import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';

@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireManageAccess(eventId: string, user: AuthUser): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        organizerId: true,
        staffAssignments: {
          where: { staffId: user.sub },
          select: { id: true },
        },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.EVENT_MANAGER ||
      event.organizerId === user.sub ||
      event.staffAssignments.length > 0
    ) {
      return;
    }
    throw new ForbiddenException('You are not assigned to this event');
  }

  async requireEditAccess(eventId: string, user: AuthUser): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.EVENT_MANAGER
    ) {
      throw new ForbiddenException('Only event managers or super admins can edit this event');
    }
  }

  async listWhere(user: AuthUser) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return {};
    }
    if (user.role === UserRole.CHECK_IN_STAFF) {
      return {
        staffAssignments: {
          some: { staffId: user.sub },
        },
      };
    }
    if (user.role === UserRole.EVENT_MANAGER) {
      return {};
    }
    return { organizerId: user.sub };
  }

  async publishable(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (
      event.status === EventStatus.CANCELLED ||
      event.status === EventStatus.COMPLETED
    ) {
      throw new ForbiddenException('Completed or cancelled events cannot be published');
    }
  }
}
