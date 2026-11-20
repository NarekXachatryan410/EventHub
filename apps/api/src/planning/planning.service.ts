import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlanningTaskStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { EventAccessService } from '../events/event-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateChecklistDto } from './dto/create-checklist.dto.js';
import type { CreatePlanningTaskDto } from './dto/create-planning-task.dto.js';
import type { CreatePlanningTemplateDto } from './dto/create-planning-template.dto.js';
import type { UpdatePlanningTaskDto } from './dto/update-planning-task.dto.js';
import type { UpdatePlanningTemplateDto } from './dto/update-planning-template.dto.js';

const plannerRoles = [UserRole.SUPER_ADMIN, UserRole.EVENT_MANAGER];

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
  ) {}

  listTemplates() {
    return this.prisma.planningTemplate.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { tasks: { orderBy: { position: 'asc' } } },
    });
  }

  listAssignableStaff() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { in: plannerRoles } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
  }

  createTemplate(input: CreatePlanningTemplateDto, user: AuthUser) {
    return this.prisma.planningTemplate.create({
      data: {
        name: input.name.trim(),
        description: cleanText(input.description),
        eventType: input.eventType,
        createdById: user.sub,
        tasks: {
          create: input.tasks.map((task, position) => ({
            title: task.title.trim(),
            description: cleanText(task.description),
            daysBeforeEvent: task.daysBeforeEvent,
            position,
          })),
        },
      },
      include: { tasks: { orderBy: { position: 'asc' } } },
    });
  }

  async updateTemplate(
    templateId: string,
    input: UpdatePlanningTemplateDto,
  ) {
    const current = await this.prisma.planningTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, isSystem: true },
    });
    if (!current) throw new NotFoundException('Planning template not found');
    if (current.isSystem) {
      throw new ConflictException('Built-in templates cannot be edited');
    }

    return this.prisma.$transaction(async (transaction) => {
      if (input.tasks) {
        await transaction.planningTemplateTask.deleteMany({
          where: { templateId },
        });
        await transaction.planningTemplateTask.createMany({
          data: input.tasks.map((task, position) => ({
            templateId,
            title: task.title.trim(),
            description: cleanText(task.description),
            daysBeforeEvent: task.daysBeforeEvent,
            position,
          })),
        });
      }

      return transaction.planningTemplate.update({
        where: { id: templateId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: cleanText(input.description) }
            : {}),
          ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
        },
        include: { tasks: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async getChecklist(eventId: string, user: AuthUser) {
    await this.access.requireEditAccess(eventId, user);
    return this.prisma.eventPlanningChecklist.findUnique({
      where: { eventId },
      include: {
        event: { select: { id: true, title: true, type: true, startDate: true } },
        template: { select: { id: true, name: true } },
        tasks: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: {
            assignedTo: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
  }

  async createChecklist(
    eventId: string,
    input: CreateChecklistDto,
    user: AuthUser,
  ) {
    await this.access.requireEditAccess(eventId, user);
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        select: { id: true, type: true, startDate: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      const template = await transaction.planningTemplate.findUnique({
        where: { id: input.templateId },
        include: { tasks: { orderBy: { position: 'asc' } } },
      });
      if (!template) throw new NotFoundException('Planning template not found');
      if (template.eventType !== event.type) {
        throw new BadRequestException('The template does not match this event type');
      }

      try {
        return await transaction.eventPlanningChecklist.create({
          data: {
            eventId,
            templateId: template.id,
            tasks: {
              create: template.tasks.map((task) => ({
                title: task.title,
                description: task.description,
                dueAt:
                  task.daysBeforeEvent === null
                    ? null
                    : addDays(event.startDate, -task.daysBeforeEvent),
                position: task.position,
              })),
            },
          },
          include: {
            event: { select: { id: true, title: true, type: true, startDate: true } },
            template: { select: { id: true, name: true } },
            tasks: {
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
              include: { assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } } },
            },
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('A planning checklist already exists for this event');
        }
        throw error;
      }
    });
  }

  async addTask(
    eventId: string,
    input: CreatePlanningTaskDto,
    user: AuthUser,
  ) {
    await this.access.requireEditAccess(eventId, user);
    const checklist = await this.prisma.eventPlanningChecklist.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!checklist) throw new NotFoundException('Create a checklist before adding tasks');
    const lastTask = await this.prisma.planningTask.aggregate({
      where: { checklistId: checklist.id },
      _max: { position: true },
    });
    return this.prisma.planningTask.create({
      data: {
        checklistId: checklist.id,
        title: input.title.trim(),
        description: cleanText(input.description),
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        position: (lastTask._max.position ?? -1) + 1,
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async updateTask(taskId: string, input: UpdatePlanningTaskDto, user: AuthUser) {
    const task = await this.prisma.planningTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        checklist: { select: { eventId: true } },
      },
    });
    if (!task) throw new NotFoundException('Planning task not found');
    await this.access.requireEditAccess(task.checklist.eventId, user);
    if (input.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: input.assignedToId,
          isActive: true,
          role: { in: plannerRoles },
        },
        select: { id: true },
      });
      if (!assignee) {
        throw new BadRequestException(
          'Tasks can only be assigned to active Event Managers or Super Admins',
        );
      }
    }

    const completedAt =
      input.status === PlanningTaskStatus.COMPLETED
        ? new Date()
        : input.status !== undefined
          ? null
          : undefined;
    return this.prisma.planningTask.update({
      where: { id: taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: cleanText(input.description) }
          : {}),
        ...(input.assignedToId !== undefined
          ? { assignedToId: input.assignedToId }
          : {}),
        ...(input.dueAt !== undefined
          ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
          : {}),
        ...(input.status !== undefined ? { status: input.status, completedAt } : {}),
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async deleteTask(taskId: string, user: AuthUser) {
    const task = await this.prisma.planningTask.findUnique({
      where: { id: taskId },
      select: { checklist: { select: { eventId: true } } },
    });
    if (!task) throw new NotFoundException('Planning task not found');
    await this.access.requireEditAccess(task.checklist.eventId, user);
    await this.prisma.planningTask.delete({ where: { id: taskId } });
    return { success: true };
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned || null;
}
