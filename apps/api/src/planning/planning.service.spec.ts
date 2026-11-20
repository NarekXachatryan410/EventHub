import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PlanningTaskStatus } from '@prisma/client';
import { PlanningService } from './planning.service.js';

describe('PlanningService', () => {
  let service: PlanningService;
  let prisma: {
    planningTemplate: { findUnique: jest.Mock; update: jest.Mock };
    planningTask: { findUnique: jest.Mock; update: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let access: { requireEditAccess: jest.Mock };

  beforeEach(() => {
    prisma = {
      planningTemplate: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      planningTask: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn() },
    };
    access = { requireEditAccess: jest.fn() };
    service = new PlanningService(prisma as never, access as never);
  });

  it('prevents changes to built-in templates', async () => {
    prisma.planningTemplate.findUnique.mockResolvedValue({
      id: 'template-id',
      isSystem: true,
    });

    await expect(
      service.updateTemplate('template-id', { name: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.planningTemplate.update).not.toHaveBeenCalled();
  });

  it('only assigns tasks to active planning staff', async () => {
    prisma.planningTask.findUnique.mockResolvedValue({
      status: PlanningTaskStatus.NOT_STARTED,
      checklist: { eventId: 'event-id' },
    });
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTask(
        'task-id',
        { assignedToId: 'check-in-staff-id' },
        { sub: 'manager-id', role: 'EVENT_MANAGER' } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.planningTask.update).not.toHaveBeenCalled();
  });

  it('records completion time when a task is completed', async () => {
    prisma.planningTask.findUnique.mockResolvedValue({
      status: PlanningTaskStatus.IN_PROGRESS,
      checklist: { eventId: 'event-id' },
    });
    prisma.planningTask.update.mockResolvedValue({ id: 'task-id' });

    await service.updateTask(
      'task-id',
      { status: PlanningTaskStatus.COMPLETED },
      { sub: 'manager-id', role: 'EVENT_MANAGER' } as never,
    );

    const updateCall = prisma.planningTask.update.mock.calls[0]?.[0] as {
      data: { status: PlanningTaskStatus; completedAt: Date };
    };
    expect(updateCall.data.status).toBe(PlanningTaskStatus.COMPLETED);
    expect(updateCall.data.completedAt).toBeInstanceOf(Date);
  });
});
