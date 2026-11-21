import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CrmActivityType, CrmCustomerStatus, Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateCrmCustomerDto } from './dto/create-crm-customer.dto.js';
import type { ListCrmCustomersDto } from './dto/list-crm-customers.dto.js';
import type { UpdateCrmCustomerDto } from './dto/update-crm-customer.dto.js';

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
      ...(user.role === UserRole.SUPER_ADMIN ? {} : { organizerId: user.sub }),
      ...(query.status ? { status: query.status } : {}),
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
