import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CrmActivityType, CrmCustomerStatus, CrmReminderStatus, Prisma, UserRole } from '@prisma/client';
import { EmailType } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateCrmCustomerDto } from './dto/create-crm-customer.dto.js';
import type { ListCrmCustomersDto } from './dto/list-crm-customers.dto.js';
import type { UpdateCrmCustomerDto } from './dto/update-crm-customer.dto.js';
import type { CrmRegistrationQueryDto } from './dto/crm-management.dto.js';

type RegistrationCustomerInput = {
  organizerId: string;
  registrationId: string;
  eventId: string;
  eventTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  marketingConsent: boolean;
  registeredAt: Date;
};

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(user: AuthUser, query: ListCrmCustomersDto) {
    this.assertAuthorized(user);
    const sortOrder = query.sortOrder ?? 'desc';
    const sortBy = query.sortBy ?? 'createdAt';
    const terms = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.CrmCustomerWhereInput = {
      ...(user.role === UserRole.SUPER_ADMIN
        ? (query.organizerId ? { organizerId: query.organizerId } : {})
        : { organizerId: user.sub }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(terms.length
        ? {
            AND: terms.map((term) => ({
              OR: [
                { firstName: { contains: term, mode: 'insensitive' as const } },
                { lastName: { contains: term, mode: 'insensitive' as const } },
                { email: { contains: term, mode: 'insensitive' as const } },
                { phone: { contains: term, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };
    const rows = await this.prisma.crmCustomer.findMany({
      where,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy:
        sortBy === 'name'
          ? [
              { lastName: sortOrder },
              { firstName: sortOrder },
              { id: sortOrder },
            ]
          : [{ createdAt: sortOrder }, { id: sortOrder }],
      take: query.limit + 1,
      select: {
        id: true,
        organizerId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        birthday: true,
        profileImageUrl: true,
        status: true,
        marketingConsent: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { registrations: true, notes: true } },
      },
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    };
  }

  async getCustomer(user: AuthUser, id: string) {
    this.assertAuthorized(user);
    const customer = await this.prisma.crmCustomer.findFirst({
      where: this.scopedWhere(user, id),
      include: {
        tags: { include: { tag: true }, orderBy: { assignedAt: 'asc' } },
        registrations: {
          orderBy: { registeredAt: 'desc' },
          take: 25,
          select: {
            id: true,
            eventId: true,
            registeredAt: true,
            status: true,
            event: { select: { title: true, startDate: true, status: true } },
            ticket: {
              select: {
                status: true,
                checkIn: { select: { checkedInAt: true } },
              },
            },
          },
        },
        _count: { select: { registrations: true, notes: true, activities: true } },
      },
    });
    if (!customer) throw new NotFoundException('CRM customer not found');
    return customer;
  }

  async listCustomerRegistrations(user: AuthUser, customerId: string, query: CrmRegistrationQueryDto) {
    await this.getCustomerIdentity(user, customerId);
    const rows = await this.prisma.eventRegistration.findMany({
      where: { crmCustomerId: customerId },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true, eventId: true, registeredAt: true, status: true,
        event: { select: { title: true, startDate: true, status: true } },
        ticket: { select: { status: true, checkIn: { select: { checkedInAt: true } } } },
      },
    });
    return page(rows, query.limit);
  }

  async dashboardAnalytics(user: AuthUser) {
    this.assertAuthorized(user);
    const organizerFilter: Prisma.CrmCustomerWhereInput = user.role === UserRole.SUPER_ADMIN ? {} : { organizerId: user.sub };
    const registrationCustomerFilter: Prisma.EventRegistrationWhereInput = user.role === UserRole.SUPER_ADMIN
      ? { crmCustomerId: { not: null } }
      : { crmCustomer: { is: { organizerId: user.sub } } };
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthRanges = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 11 + index, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      return { start, end };
    });
    const [totalCustomers, activeCustomers, archivedCustomers, registeredCustomers, registrations, createdThisMonth, customerGrowth] = await Promise.all([
      this.prisma.crmCustomer.count({ where: organizerFilter }),
      this.prisma.crmCustomer.count({ where: { ...organizerFilter, status: CrmCustomerStatus.ACTIVE } }),
      this.prisma.crmCustomer.count({ where: { ...organizerFilter, status: CrmCustomerStatus.ARCHIVED } }),
      this.prisma.crmCustomer.count({ where: { ...organizerFilter, registrations: { some: {} } } }),
      this.prisma.eventRegistration.count({ where: registrationCustomerFilter }),
      this.prisma.crmCustomer.count({ where: { ...organizerFilter, createdAt: { gte: monthStart } } }),
      Promise.all(monthRanges.map(({ start, end }) => this.prisma.crmCustomer.count({ where: { ...organizerFilter, createdAt: { gte: start, lt: end } } }))),
    ]);
    return {
      totalCustomers, activeCustomers, archivedCustomers, registeredCustomers, registrations, createdThisMonth,
      customerGrowth: monthRanges.map(({ start }, index) => ({ month: start.toISOString(), customers: customerGrowth[index] ?? 0 })),
    };
  }

  async createCustomer(user: AuthUser, input: CreateCrmCustomerDto) {
    this.assertAuthorized(user);
    const organizerId = await this.resolveOrganizerId(user, input.organizerId);
    const normalizedEmail = normalizeCustomerEmail(input.email);
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException('First and last name are required');
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const customer = await transaction.crmCustomer.create({
          data: {
            organizerId,
            email: normalizedEmail,
            normalizedEmail,
            firstName,
            lastName,
            phone: normalizeOptional(input.phone),
            birthday: input.birthday ? new Date(input.birthday) : null,
            profileImageUrl: input.profileImageUrl?.trim() || null,
          },
        });
        await transaction.crmCustomerActivity.create({
          data: {
            customerId: customer.id,
            actorId: user.sub,
            type: CrmActivityType.CUSTOMER_CREATED,
            summary: 'Customer created',
            sourceKey: `customer-created:${customer.id}`,
          },
        });
        return customer;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A customer with this email already exists for this organizer',
        );
      }
      throw error;
    }
  }

  async updateCustomer(user: AuthUser, id: string, input: UpdateCrmCustomerDto) {
    this.assertAuthorized(user);
    await this.getCustomerIdentity(user, id);
    const data: Prisma.CrmCustomerUpdateInput = {
      ...(input.email !== undefined
        ? {
            email: normalizeCustomerEmail(input.email),
            normalizedEmail: normalizeCustomerEmail(input.email),
          }
        : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
      ...(input.phone !== undefined ? { phone: normalizeOptional(input.phone) } : {}),
      ...(input.birthday !== undefined
        ? { birthday: input.birthday ? new Date(input.birthday) : null }
        : {}),
      ...(input.profileImageUrl !== undefined
        ? { profileImageUrl: input.profileImageUrl?.trim() || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide at least one customer field to update');
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.crmCustomer.update({
          where: { id },
          data,
        });
        await transaction.crmCustomerActivity.create({
          data: {
            customerId: id,
            actorId: user.sub,
            type: CrmActivityType.CUSTOMER_UPDATED,
            summary: 'Customer information updated',
          },
        });
        return updated;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A customer with this email already exists for this organizer',
        );
      }
      throw error;
    }
  }

  async archiveCustomer(user: AuthUser, id: string) {
    this.assertAuthorized(user);
    await this.getCustomerIdentity(user, id);
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.crmCustomer.update({
        where: { id },
        data: { status: CrmCustomerStatus.ARCHIVED },
      });
      await transaction.crmCustomerActivity.create({
        data: {
          customerId: id,
          actorId: user.sub,
          type: CrmActivityType.CUSTOMER_UPDATED,
          summary: 'Customer archived',
        },
      });
      return { success: true as const, customer };
    });
  }

  async listNotes(user: AuthUser, customerId: string) {
    await this.getCustomerIdentity(user, customerId);
    return this.prisma.crmCustomerNote.findMany({
      where: { customerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async createNote(user: AuthUser, customerId: string, content: string) {
    await this.getCustomerIdentity(user, customerId);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.crmCustomerNote.create({ data: { customerId, authorId: user.sub, content: content.trim() }, include: { author: { select: { id: true, firstName: true, lastName: true } } } });
      await tx.crmCustomerActivity.create({ data: { customerId, actorId: user.sub, type: CrmActivityType.NOTE_ADDED, summary: 'Note added', metadata: { noteId: note.id } } });
      return note;
    });
  }

  async updateNote(user: AuthUser, customerId: string, noteId: string, content: string) {
    await this.getCustomerIdentity(user, customerId);
    const note = await this.prisma.crmCustomerNote.findFirst({ where: { id: noteId, customerId }, select: { id: true } });
    if (!note) throw new NotFoundException('CRM note not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmCustomerNote.update({ where: { id: noteId }, data: { content: content.trim() }, include: { author: { select: { id: true, firstName: true, lastName: true } } } });
      await tx.crmCustomerActivity.create({ data: { customerId, actorId: user.sub, type: CrmActivityType.CUSTOMER_UPDATED, summary: 'Customer note updated', metadata: { noteId } } });
      return updated;
    });
  }

  async deleteNote(user: AuthUser, customerId: string, noteId: string) {
    await this.getCustomerIdentity(user, customerId);
    const result = await this.prisma.crmCustomerNote.deleteMany({ where: { id: noteId, customerId } });
    if (!result.count) throw new NotFoundException('CRM note not found');
    return { success: true as const };
  }

  async listTags(user: AuthUser, organizerId?: string) {
    const scopedOrganizer = await this.resolveReadOrganizer(user, organizerId);
    return this.prisma.crmCustomerTag.findMany({ where: { organizerId: scopedOrganizer }, orderBy: { name: 'asc' }, include: { _count: { select: { customers: true } } } });
  }

  async createTag(user: AuthUser, input: { name: string; color?: string; organizerId?: string }) {
    const organizerId = await this.resolveOrganizerId(user, input.organizerId);
    try { return await this.prisma.crmCustomerTag.create({ data: { organizerId, name: input.name.trim(), color: input.color ?? 'indigo' } }); }
    catch (error) { if (isUniqueConstraintError(error)) throw new ConflictException('A tag with this name already exists'); throw error; }
  }

  async deleteTag(user: AuthUser, tagId: string) {
    const tag = await this.prisma.crmCustomerTag.findFirst({ where: { id: tagId, ...(user.role === UserRole.SUPER_ADMIN ? {} : { organizerId: user.sub }) }, select: { id: true } });
    if (!tag) throw new NotFoundException('CRM tag not found');
    await this.prisma.crmCustomerTag.delete({ where: { id: tagId } });
    return { success: true as const };
  }

  async assignTag(user: AuthUser, customerId: string, tagId: string) {
    const customer = await this.getCustomerIdentity(user, customerId);
    const tag = await this.prisma.crmCustomerTag.findFirst({ where: { id: tagId, organizerId: customer.organizerId }, select: { id: true } });
    if (!tag) throw new NotFoundException('CRM tag not found');
    await this.prisma.crmCustomerTagAssignment.upsert({ where: { customerId_tagId: { customerId, tagId } }, create: { customerId, tagId }, update: {} });
    return { success: true as const };
  }

  async removeTag(user: AuthUser, customerId: string, tagId: string) {
    await this.getCustomerIdentity(user, customerId);
    const result = await this.prisma.crmCustomerTagAssignment.deleteMany({ where: { customerId, tagId } });
    if (!result.count) throw new NotFoundException('Customer tag assignment not found');
    return { success: true as const };
  }

  async listReminders(user: AuthUser, query: { customerId?: string; status?: CrmReminderStatus; overdue?: boolean; assignedToMe?: boolean; limit: number; cursor?: string }) {
    this.assertAuthorized(user);
    const now = new Date();
    const where: Prisma.CrmCustomerReminderWhereInput = {
      customer: user.role === UserRole.SUPER_ADMIN ? (query.customerId ? { id: query.customerId } : {}) : { organizerId: user.sub, ...(query.customerId ? { id: query.customerId } : {}) },
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdue ? { status: CrmReminderStatus.PENDING, dueAt: { lt: now } } : {}),
      ...(query.assignedToMe ? { assignedToId: user.sub } : {}),
    };
    const rows = await this.prisma.crmCustomerReminder.findMany({ where, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: query.limit + 1, include: { customer: { select: { id: true, firstName: true, lastName: true, email: true, organizerId: true } }, createdBy: { select: { id: true, firstName: true, lastName: true } }, assignedTo: { select: { id: true, firstName: true, lastName: true } } } });
    return page(rows, query.limit);
  }

  async createReminder(user: AuthUser, customerId: string, input: { title: string; description?: string | null; dueAt: string; assignedToId?: string | null }) {
    const customer = await this.getCustomerIdentity(user, customerId);
    if (input.assignedToId) await this.assertOrganizerUser(customer.organizerId, input.assignedToId);
    return this.prisma.$transaction(async (tx) => {
      const reminder = await tx.crmCustomerReminder.create({ data: { customerId, createdById: user.sub, title: input.title.trim(), description: input.description?.trim() || null, dueAt: new Date(input.dueAt), assignedToId: input.assignedToId ?? null } });
      await tx.crmCustomerActivity.create({ data: { customerId, actorId: user.sub, type: CrmActivityType.REMINDER_CREATED, summary: `Reminder created: ${reminder.title}`, metadata: { reminderId: reminder.id, dueAt: reminder.dueAt.toISOString() } } });
      return reminder;
    });
  }

  async updateReminder(user: AuthUser, customerId: string, reminderId: string, input: { title?: string; description?: string | null; dueAt?: string; assignedToId?: string | null }) {
    const customer = await this.getCustomerIdentity(user, customerId);
    const existing = await this.prisma.crmCustomerReminder.findFirst({ where: { id: reminderId, customerId }, select: { id: true } });
    if (!existing) throw new NotFoundException('CRM reminder not found');
    if (Object.values(input).every((value) => value === undefined)) throw new BadRequestException('Provide at least one reminder field to update');
    if (input.assignedToId) await this.assertOrganizerUser(customer.organizerId, input.assignedToId);
    return this.prisma.crmCustomerReminder.update({ where: { id: reminderId }, data: { ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}), ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}), ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}) } });
  }

  async completeReminder(user: AuthUser, customerId: string, reminderId: string) {
    await this.getCustomerIdentity(user, customerId);
    const reminder = await this.prisma.crmCustomerReminder.findFirst({ where: { id: reminderId, customerId }, select: { id: true } });
    if (!reminder) throw new NotFoundException('CRM reminder not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmCustomerReminder.update({ where: { id: reminderId }, data: { status: CrmReminderStatus.COMPLETED, completedAt: new Date() } });
      await tx.crmCustomerActivity.create({ data: { customerId, actorId: user.sub, type: CrmActivityType.REMINDER_COMPLETED, summary: `Reminder completed: ${updated.title}`, metadata: { reminderId } } });
      return updated;
    });
  }

  async deleteReminder(user: AuthUser, customerId: string, reminderId: string) {
    await this.getCustomerIdentity(user, customerId);
    const result = await this.prisma.crmCustomerReminder.deleteMany({ where: { id: reminderId, customerId } });
    if (!result.count) throw new NotFoundException('CRM reminder not found');
    return { success: true as const };
  }

  async listActivity(user: AuthUser, customerId: string, limit: number, cursor?: string) {
    await this.getCustomerIdentity(user, customerId);
    const before = decodeTimelineCursor(cursor);
    const [activity, notes, reminders, checkIns, emails] = await Promise.all([
      this.prisma.crmCustomerActivity.findMany({
        where: { customerId, type: { notIn: [CrmActivityType.NOTE_ADDED, CrmActivityType.REMINDER_CREATED, CrmActivityType.REMINDER_COMPLETED, CrmActivityType.CHECKED_IN] }, ...timelineDateWhere('occurredAt', 'activity', before) },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        include: { actor: { select: { id: true, firstName: true, lastName: true } }, event: { select: { id: true, title: true } } },
      }),
      this.prisma.crmCustomerNote.findMany({
        where: { customerId, ...timelineDateWhere('createdAt', 'note', before) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.crmCustomerReminder.findMany({
        where: { customerId, ...timelineDateWhere('updatedAt', 'reminder', before) },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      }),
      this.prisma.checkIn.findMany({
        where: { ticket: { registration: { crmCustomerId: customerId } }, ...timelineDateWhere('checkedInAt', 'checkin', before) },
        orderBy: [{ checkedInAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, checkedInAt: true, staff: { select: { id: true, firstName: true, lastName: true } }, ticket: { select: { registration: { select: { event: { select: { id: true, title: true } } } } } } },
      }),
      this.prisma.emailLog.findMany({
        where: { registration: { is: { crmCustomerId: customerId } }, ...timelineDateWhere('scheduledAt', 'email', before) },
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, type: true, status: true, providerId: true, errorMessage: true, scheduledAt: true, lastAttemptAt: true, sentAt: true },
      }),
    ]);
    const entries: TimelineEntry[] = [
      ...activity.map((item) => ({ id: `activity:${item.id}`, type: item.type, summary: item.summary, occurredAt: item.occurredAt, actor: item.actor, event: item.event, metadata: jsonObject(item.metadata) })),
      ...notes.map((item) => ({ id: `note:${item.id}`, type: CrmActivityType.NOTE_ADDED, summary: 'Note added', occurredAt: item.createdAt, actor: item.author, metadata: { noteId: item.id, content: item.content } })),
      ...reminders.map((item) => ({ id: `reminder:${item.id}`, type: item.status === CrmReminderStatus.COMPLETED ? CrmActivityType.REMINDER_COMPLETED : CrmActivityType.REMINDER_CREATED, summary: `Reminder ${item.status.toLowerCase()}: ${item.title}`, occurredAt: item.updatedAt, metadata: { reminderId: item.id, dueAt: item.dueAt.toISOString(), status: item.status } })),
      ...checkIns.map((item) => ({ id: `checkin:${item.id}`, type: CrmActivityType.CHECKED_IN, summary: `Checked in to ${item.ticket.registration.event.title}`, occurredAt: item.checkedInAt, actor: item.staff, event: item.ticket.registration.event, metadata: { checkInId: item.id } })),
      ...emails.map((item) => ({
        id: `email:${item.id}`,
        type: CrmActivityType.COMMUNICATION_RECORDED,
        summary: `${emailTypeLabel(item.type)} · ${item.status.toLowerCase().replaceAll('_', ' ')}`,
        occurredAt: item.scheduledAt,
        metadata: { emailLogId: item.id, emailType: item.type, emailStatus: item.status, providerId: item.providerId, errorMessage: item.errorMessage, sentAt: item.sentAt?.toISOString() ?? null, lastAttemptAt: item.lastAttemptAt?.toISOString() ?? null },
      })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id));
    const unique = dedupeTimeline(entries);
    const items = unique.slice(0, limit);
    return { items, nextCursor: unique.length > limit ? encodeTimelineCursor(items.at(-1)!.occurredAt, items.at(-1)!.id) : null };
  }

  async previewSegment(user: AuthUser, criteria: SegmentCriteria, organizerId?: string) {
    const scopedOrganizer = await this.resolveReadOrganizer(user, organizerId);
    const where = await this.segmentWhere(scopedOrganizer, criteria);
    const [total, customers] = await Promise.all([
      this.prisma.crmCustomer.count({ where }),
      this.prisma.crmCustomer.findMany({ where, select: { id: true, email: true, firstName: true, lastName: true, status: true, _count: { select: { registrations: true } } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }], take: 100 }),
    ]);
    return { total, items: customers };
  }

  async saveSegment(user: AuthUser, input: { name: string; description?: string; criteria: SegmentCriteria; organizerId?: string }) {
    const organizerId = await this.resolveOrganizerId(user, input.organizerId);
    const criteria = validateSegmentCriteria(input.criteria);
    await this.segmentWhere(organizerId, criteria);
    try { return await this.prisma.crmCustomerSegment.create({ data: { organizerId, createdById: user.sub, name: input.name.trim(), description: input.description?.trim() || null, criteria: criteria as Prisma.InputJsonValue } }); }
    catch (error) { if (isUniqueConstraintError(error)) throw new ConflictException('A segment with this name already exists'); throw error; }
  }

  async listSegments(user: AuthUser, organizerId?: string) {
    const scopedOrganizer = await this.resolveReadOrganizer(user, organizerId);
    const segments = await this.prisma.crmCustomerSegment.findMany({ where: { organizerId: scopedOrganizer }, orderBy: { name: 'asc' } });
    return Promise.all(segments.map(async (segment) => {
      const criteria = segment.criteria as unknown as SegmentCriteria;
      const where = await this.segmentWhere(scopedOrganizer, criteria);
      const [total, members] = await Promise.all([
        this.prisma.crmCustomer.count({ where }),
        this.prisma.crmCustomer.findMany({
          where,
          select: { id: true, email: true, firstName: true, lastName: true, status: true, _count: { select: { registrations: true } } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
          take: 26,
        }),
      ]);
      const memberPage = page(members, 25);
      return { ...segment, total, items: memberPage.items, membersNextCursor: memberPage.nextCursor };
    }));
  }

  async listSegmentMembers(user: AuthUser, segmentId: string, query: CrmRegistrationQueryDto) {
    this.assertAuthorized(user);
    const segment = await this.prisma.crmCustomerSegment.findFirst({
      where: { id: segmentId, ...(user.role === UserRole.SUPER_ADMIN ? {} : { organizerId: user.sub }) },
      select: { id: true, organizerId: true, criteria: true },
    });
    if (!segment) throw new NotFoundException('CRM segment not found');
    const where = await this.segmentWhere(segment.organizerId, segment.criteria as unknown as SegmentCriteria);
    const [total, rows] = await Promise.all([
      this.prisma.crmCustomer.count({ where }),
      this.prisma.crmCustomer.findMany({
        where,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
        select: { id: true, organizerId: true, email: true, firstName: true, lastName: true, status: true, createdAt: true, _count: { select: { registrations: true } } },
      }),
    ]);
    return { ...page(rows, query.limit), total };
  }

  async deleteSegment(user: AuthUser, segmentId: string) {
    const result = await this.prisma.crmCustomerSegment.deleteMany({ where: { id: segmentId, ...(user.role === UserRole.SUPER_ADMIN ? {} : { organizerId: user.sub }), isSystem: false } });
    if (!result.count) throw new NotFoundException('CRM segment not found');
    return { success: true as const };
  }

  private async segmentWhere(organizerId: string, criteria: SegmentCriteria): Promise<Prisma.CrmCustomerWhereInput> {
    const safe = validateSegmentCriteria(criteria);
    if (safe.tagIds?.length) {
      const count = await this.prisma.crmCustomerTag.count({ where: { organizerId, id: { in: safe.tagIds } } });
      if (count !== safe.tagIds.length) throw new BadRequestException('Segment contains a tag outside this organizer');
    }
    const registrationDates: Prisma.DateTimeFilter = {};
    if (safe.registeredAfter) registrationDates.gte = new Date(safe.registeredAfter);
    if (safe.registeredBefore) registrationDates.lte = new Date(safe.registeredBefore);
    const registrationFilter: Prisma.EventRegistrationWhereInput =
      safe.registeredAfter || safe.registeredBefore
        ? { registeredAt: registrationDates }
        : {};
    let customerIds: string[] | undefined;
    if (safe.minTickets !== undefined || safe.maxTickets !== undefined || safe.attended !== undefined) {
      const candidates = await this.prisma.crmCustomer.findMany({
        where: { organizerId },
        select: {
          id: true,
          registrations: {
            select: { ticket: { select: { id: true, checkIn: { select: { id: true } } } } },
          },
        },
      });
      customerIds = candidates.filter((customer) => {
        const tickets = customer.registrations.flatMap((registration) => registration.ticket ? [registration.ticket] : []);
        return (safe.minTickets === undefined || tickets.length >= safe.minTickets) && (safe.maxTickets === undefined || tickets.length <= safe.maxTickets) && (safe.attended === undefined || tickets.some((ticket) => Boolean(ticket.checkIn)) === safe.attended);
      }).map((customer) => customer.id);
    }
    return {
      organizerId,
      ...(safe.status ? { status: safe.status } : {}),
      ...(safe.tagIds?.length ? { tags: { some: { tagId: { in: safe.tagIds } } } } : {}),
      ...(safe.registeredAfter || safe.registeredBefore ? { registrations: { some: registrationFilter } } : {}),
      ...(customerIds ? { id: { in: customerIds } } : {}),
    };
  }

  private async resolveReadOrganizer(user: AuthUser, organizerId?: string) {
    this.assertAuthorized(user);
    if (user.role !== UserRole.SUPER_ADMIN) {
      if (organizerId && organizerId !== user.sub) throw new NotFoundException('Organizer not found');
      return user.sub;
    }
    if (!organizerId) throw new BadRequestException('Super Admin must choose an organizer');
    return (await this.resolveOrganizerId(user, organizerId));
  }

  private async assertOrganizerUser(organizerId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, isActive: true, role: { in: [UserRole.EVENT_MANAGER, UserRole.SUPER_ADMIN] } }, select: { id: true } });
    if (!user || userId !== organizerId) throw new NotFoundException('Assignee not found for this organizer');
  }

  async upsertFromRegistration(
    transaction: Prisma.TransactionClient,
    input: RegistrationCustomerInput,
  ) {
    const normalizedEmail = normalizeCustomerEmail(input.email);
    const customer = await transaction.crmCustomer.upsert({
      where: {
        organizerId_normalizedEmail: {
          organizerId: input.organizerId,
          normalizedEmail,
        },
      },
      create: {
        organizerId: input.organizerId,
        email: normalizedEmail,
        normalizedEmail,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone,
        marketingConsent: input.marketingConsent,
        ...(input.marketingConsent
          ? {
              marketingConsentAt: input.registeredAt,
              marketingConsentSource: 'EVENT_REGISTRATION',
            }
          : {}),
        createdAt: input.registeredAt,
      },
      update: {
        status: CrmCustomerStatus.ACTIVE,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.marketingConsent
          ? {
              marketingConsent: true,
              marketingConsentAt: input.registeredAt,
              marketingConsentSource: 'EVENT_REGISTRATION',
            }
          : {}),
      },
    });
    await transaction.crmCustomerActivity.create({
      data: {
        customerId: customer.id,
        eventId: input.eventId,
        type: CrmActivityType.REGISTRATION_CREATED,
        summary: `Registered for ${input.eventTitle}`,
        metadata: { registrationId: input.registrationId },
        sourceKey: `registration-created:${input.registrationId}`,
        occurredAt: input.registeredAt,
      },
    });
    return customer;
  }

  private async getCustomerIdentity(user: AuthUser, id: string) {
    const customer = await this.prisma.crmCustomer.findFirst({
      where: this.scopedWhere(user, id),
      select: { id: true, organizerId: true },
    });
    if (!customer) throw new NotFoundException('CRM customer not found');
    return customer;
  }

  private assertAuthorized(user: AuthUser): void {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.EVENT_MANAGER) {
      throw new ForbiddenException('You do not have permission to access CRM');
    }
  }

  private scopedWhere(user: AuthUser, id: string): Prisma.CrmCustomerWhereInput {
    return {
      id,
      ...(user.role === UserRole.SUPER_ADMIN ? {} : { organizerId: user.sub }),
    };
  }

  private async resolveOrganizerId(user: AuthUser, requestedOrganizerId?: string) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      if (requestedOrganizerId && requestedOrganizerId !== user.sub) {
        throw new NotFoundException('Organizer not found');
      }
      return user.sub;
    }
    if (!requestedOrganizerId) {
      throw new BadRequestException('Super Admin must choose an organizer');
    }
    const organizer = await this.prisma.user.findFirst({
      where: {
        id: requestedOrganizerId,
        isActive: true,
        role: { in: [UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER] },
      },
      select: { id: true },
    });
    if (!organizer) throw new NotFoundException('Organizer not found');
    return organizer.id;
  }
}

export function normalizeCustomerEmail(email: string): string {
  return email.trim().toLowerCase();
}

type TimelineCursor = { occurredAt: Date; id: string };
type TimelineEntry = {
  id: string;
  type: CrmActivityType;
  summary: string;
  occurredAt: Date;
  actor?: { id: string; firstName: string; lastName: string } | null;
  event?: { id: string; title: string } | null;
  metadata?: Record<string, unknown> | null;
};

type SegmentCriteria = {
  status?: CrmCustomerStatus;
  registeredAfter?: string;
  registeredBefore?: string;
  minTickets?: number;
  maxTickets?: number;
  attended?: boolean;
  tagIds?: string[];
};

function validateSegmentCriteria(criteria: SegmentCriteria): SegmentCriteria {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) throw new BadRequestException('Segment criteria must be an object');
  const allowed = new Set(['status', 'registeredAfter', 'registeredBefore', 'minTickets', 'maxTickets', 'attended', 'tagIds']);
  if (Object.keys(criteria).some((key) => !allowed.has(key))) throw new BadRequestException('Segment contains an unsupported filter');
  if (criteria.registeredAfter && criteria.registeredBefore && new Date(criteria.registeredAfter) > new Date(criteria.registeredBefore)) throw new BadRequestException('Registration date range is invalid');
  if (criteria.minTickets !== undefined && criteria.maxTickets !== undefined && criteria.minTickets > criteria.maxTickets) throw new BadRequestException('Ticket count range is invalid');
  return criteria;
}

function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

function encodeTimelineCursor(date: Date, id: string): string {
  return Buffer.from(JSON.stringify({ occurredAt: date.toISOString(), id })).toString('base64url');
}

function decodeTimelineCursor(cursor?: string): TimelineCursor | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    let parsed: unknown;
    try { parsed = JSON.parse(decoded); } catch { parsed = undefined; }
    if (typeof parsed === 'object' && parsed !== null && 'occurredAt' in parsed && 'id' in parsed) {
      const value = parsed as { occurredAt: unknown; id: unknown };
      const occurredAt = new Date(String(value.occurredAt));
      if (!Number.isFinite(occurredAt.getTime()) || typeof value.id !== 'string' || !value.id.includes(':')) throw new Error('Invalid cursor');
      return { occurredAt, id: value.id };
    }
    // Accept the previous timestamp-only cursor for clients that still hold one.
    const occurredAt = new Date(decoded);
    if (!Number.isFinite(occurredAt.getTime())) throw new Error('Invalid cursor');
    return { occurredAt, id: 'zzzz:' };
  } catch {
    throw new BadRequestException('Invalid activity cursor');
  }
}

function timelineDateWhere(field: string, prefix: string, cursor?: TimelineCursor): Record<string, unknown> {
  if (!cursor) return {};
  const separator = cursor.id.indexOf(':');
  const cursorPrefix = cursor.id.slice(0, separator);
  const cursorRawId = cursor.id.slice(separator + 1);
  const sameDateKeyCondition = prefix.localeCompare(cursorPrefix) < 0
    ? { [field]: cursor.occurredAt }
    : prefix === cursorPrefix
      ? { [field]: cursor.occurredAt, id: { lt: cursorRawId } }
      : null;
  return {
    OR: [
      { [field]: { lt: cursor.occurredAt } },
      ...(sameDateKeyCondition ? [sameDateKeyCondition] : []),
    ],
  };
}

function dedupeTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const metadata = entry.metadata;
    const sourceId = metadata?.noteId ?? metadata?.reminderId ?? metadata?.registrationId ?? metadata?.checkInId;
    const key = typeof sourceId === 'string' ? `${entry.type}:${sourceId}` : entry.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function emailTypeLabel(type: EmailType): string {
  return type.toLowerCase().replaceAll('_', ' ');
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
