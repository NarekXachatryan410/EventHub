import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { EventAccessService } from './event-access.service.js';

const eventId = '93e8d1b5-1e4f-4dc7-bfd4-1e08db332263';
const staffId = 'cf738fac-40ab-44e1-a069-337b1d348b16';

describe('EventAccessService', () => {
  const findUnique = jest.fn();
  const service = new EventAccessService({ event: { findUnique } } as never);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('allows check-in staff only when assigned, regardless of event ownership', async () => {
    findUnique.mockResolvedValue({
      organizerId: staffId,
      staffAssignments: [],
    });

    await expect(
      service.requireManageAccess(eventId, {
        sub: staffId,
        role: UserRole.CHECK_IN_STAFF,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    findUnique.mockResolvedValue({
      organizerId: staffId,
      staffAssignments: [{ id: 'assignment-id' }],
    });
    await expect(
      service.requireManageAccess(eventId, {
        sub: staffId,
        role: UserRole.CHECK_IN_STAFF,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows Super Admins to manage any event', async () => {
    findUnique.mockResolvedValue({
      organizerId: 'another-staff-member',
      staffAssignments: [],
    });

    await expect(
      service.requireManageAccess(eventId, {
        sub: staffId,
        role: UserRole.SUPER_ADMIN,
      }),
    ).resolves.toBeUndefined();
  });

  it('limits Event Managers to events they organize when editing', async () => {
    findUnique.mockResolvedValue({ organizerId: 'another-organizer' });
    await expect(
      service.requireEditAccess(eventId, {
        sub: staffId,
        role: UserRole.EVENT_MANAGER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    findUnique.mockResolvedValue({ organizerId: staffId });
    await expect(
      service.requireEditAccess(eventId, {
        sub: staffId,
        role: UserRole.EVENT_MANAGER,
      }),
    ).resolves.toBeUndefined();
  });

  it('limits Event Managers to events they organize', async () => {
    findUnique.mockResolvedValue({ organizerId: staffId, staffAssignments: [] });
    await expect(
      service.requireManageAccess(eventId, {
        sub: staffId,
        role: UserRole.EVENT_MANAGER,
      }),
    ).resolves.toBeUndefined();

    findUnique.mockResolvedValue({
      organizerId: 'another-organizer',
      staffAssignments: [],
    });
    await expect(
      service.requireManageAccess(eventId, {
        sub: staffId,
        role: UserRole.EVENT_MANAGER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists only events belonging to an Event Manager', async () => {
    await expect(
      service.listWhere({ sub: staffId, role: UserRole.EVENT_MANAGER }),
    ).resolves.toEqual({ organizerId: staffId });
    await expect(
      service.listWhere({ sub: staffId, role: UserRole.SUPER_ADMIN }),
    ).resolves.toEqual({});
  });
});
