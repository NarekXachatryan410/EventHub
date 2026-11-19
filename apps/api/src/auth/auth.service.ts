import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SafeUser } from './auth.types.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { UpdateStaffDto } from './dto/update-staff.dto.js';

const safeUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginDto): Promise<{ user: SafeUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !(await bcrypt.compare(input.password, user.passwordHash)) ||
      !user.isActive
    ) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      token,
    };
  }

  async getCurrentUser(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Staff account no longer exists');
    }
    return user;
  }

  async listStaff(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      select: safeUserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStaff(input: CreateStaffDto, actorId: string): Promise<SafeUser> {
    if (
      input.role !== UserRole.EVENT_MANAGER &&
      input.role !== UserRole.CHECK_IN_STAFF
    ) {
      throw new ForbiddenException('Super Admin accounts can only be created by seeding');
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const user = await this.prisma.user.create({
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email,
          passwordHash,
          role: input.role,
        },
        select: safeUserSelect,
      });
      this.logger.log(`Staff account ${user.id} created by ${actorId}`);
      return user;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A staff account with this email already exists');
      }
      throw error;
    }
  }

  async updateStaff(
    id: string,
    input: UpdateStaffDto,
    actorId: string,
  ): Promise<SafeUser> {
    const hasUpdates = Object.values(input).some((value) => value !== undefined);
    if (!hasUpdates) {
      throw new BadRequestException('Provide at least one staff field to update');
    }
    const passwordHash =
      input.password !== undefined
        ? await bcrypt.hash(input.password, 12)
        : undefined;
    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        if (
          input.role !== undefined &&
          input.role !== UserRole.SUPER_ADMIN
        ) {
          await transaction.$queryRaw`
            SELECT "id" FROM "User"
            WHERE "role" = ${UserRole.SUPER_ADMIN}::"UserRole"
              AND "isActive" = true
            FOR UPDATE
          `;
        }
        const current = await transaction.user.findUnique({
          where: { id },
          select: { id: true, role: true, isActive: true },
        });
        if (!current) {
          throw new NotFoundException('Staff account not found');
        }
        if (
          actorId === id &&
          input.role !== undefined &&
          input.role !== current.role
        ) {
          throw new ForbiddenException('You cannot change your own staff role');
        }
        if (
          input.role !== undefined &&
          current.isActive &&
          current.role === UserRole.SUPER_ADMIN &&
          input.role !== UserRole.SUPER_ADMIN &&
          (await transaction.user.count({
            where: { role: UserRole.SUPER_ADMIN, isActive: true },
          })) <= 1
        ) {
          throw new ConflictException('At least one active Super Admin must remain');
        }

        return transaction.user.update({
          where: { id },
          data: {
            ...(input.firstName !== undefined
              ? { firstName: input.firstName.trim() }
              : {}),
            ...(input.lastName !== undefined
              ? { lastName: input.lastName.trim() }
              : {}),
            ...(input.email !== undefined
              ? { email: input.email.trim().toLowerCase() }
              : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(passwordHash !== undefined ? { passwordHash } : {}),
          } satisfies Prisma.UserUpdateInput,
          select: safeUserSelect,
        });
      });
      this.logger.log(`Staff account ${id} updated by ${actorId}`);
      return user;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A staff account with this email already exists');
      }
      throw error;
    }
  }

  async updateStaffStatus(
    id: string,
    isActive: boolean,
    actorId: string,
  ): Promise<SafeUser> {
    const user = await this.prisma.$transaction(async (transaction) => {
      if (!isActive) {
        await transaction.$queryRaw`
          SELECT "id" FROM "User"
          WHERE "role" = ${UserRole.SUPER_ADMIN}::"UserRole"
            AND "isActive" = true
          FOR UPDATE
        `;
      }
      const current = await transaction.user.findUnique({
        where: { id },
        select: { id: true, role: true, isActive: true },
      });
      if (!current) {
        throw new NotFoundException('Staff account not found');
      }
      if (actorId === id && !isActive) {
        throw new ForbiddenException('You cannot deactivate your own account');
      }
      if (
        !isActive &&
        current.isActive &&
        current.role === UserRole.SUPER_ADMIN &&
        (await transaction.user.count({
          where: { role: UserRole.SUPER_ADMIN, isActive: true },
        })) <= 1
      ) {
        throw new ConflictException('At least one active Super Admin must remain');
      }

      return transaction.user.update({
        where: { id },
        data: { isActive },
        select: safeUserSelect,
      });
    });
    this.logger.log(
      `Staff account ${id} ${isActive ? 'reactivated' : 'deactivated'} by ${actorId}`,
    );
    return user;
  }
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
