import { jest } from '@jest/globals';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';

const adminId = '93e8d1b5-1e4f-4dc7-bfd4-1e08db332263';
const staffId = 'e4e6f4a1-b0fb-4b9e-8e06-d33aa0ee2f72';
const rawPassword = 'Strong-test-password-2026';

describe('AuthService', () => {
  let service: AuthService;
  let transaction: {
    $queryRaw: jest.Mock;
    user: {
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    user: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        count: jest.fn().mockResolvedValue(2),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      user: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    service = new AuthService(prisma as never, jwtService as never);
  });

  it('authenticates active users and normalizes their email', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: adminId,
      firstName: 'EventHub',
      lastName: 'Admin',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash(rawPassword, 4),
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    });

    await expect(
      service.login({ email: ' ADMIN@example.com ', password: rawPassword }),
    ).resolves.toMatchObject({
      token: 'signed-jwt',
      user: { id: adminId, role: UserRole.SUPER_ADMIN, isActive: true },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    });
  });

  it('rejects inactive staff accounts even when their password is correct', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: staffId,
      firstName: 'Inactive',
      lastName: 'Staff',
      email: 'inactive@example.com',
      passwordHash: await bcrypt.hash(rawPassword, 4),
      role: UserRole.EVENT_MANAGER,
      isActive: false,
    });

    await expect(
      service.login({ email: 'inactive@example.com', password: rawPassword }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('creates staff with a bcrypt hash and never exposes the hash', async () => {
    prisma.user.create.mockImplementation(async ({ data }) => ({
      id: staffId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
      isActive: true,
    }));

    const user = await service.createStaff(
      {
        firstName: 'Event',
        lastName: 'Manager',
        email: ' MANAGER@example.com ',
        password: rawPassword,
        role: UserRole.EVENT_MANAGER,
      },
      adminId,
    );
    const storedHash =
      prisma.user.create.mock.calls[0]?.[0].data.passwordHash as string;

    expect(user).not.toHaveProperty('passwordHash');
    expect(user.email).toBe('manager@example.com');
    expect(storedHash).not.toBe(rawPassword);
    await expect(bcrypt.compare(rawPassword, storedHash)).resolves.toBe(true);
  });

  it('refuses to create another Super Admin outside the seed path', async () => {
    const input: CreateStaffDto = {
      firstName: 'Another',
      lastName: 'Admin',
      email: 'another-admin@example.com',
      password: rawPassword,
      role: UserRole.SUPER_ADMIN,
    };

    await expect(service.createStaff(input, adminId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('prevents demoting the last active Super Admin', async () => {
    transaction.user.findUnique.mockResolvedValue({
      id: staffId,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    });
    transaction.user.count.mockResolvedValue(1);

    await expect(
      service.updateStaff(
        staffId,
        { role: UserRole.EVENT_MANAGER },
        adminId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it('prevents an administrator from deactivating their own account', async () => {
    transaction.user.findUnique.mockResolvedValue({
      id: adminId,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    });

    await expect(
      service.updateStaffStatus(adminId, false, adminId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.user.update).not.toHaveBeenCalled();
  });
});
