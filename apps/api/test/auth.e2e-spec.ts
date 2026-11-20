import cookieParser from 'cookie-parser';
import { jest } from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const adminId = '93e8d1b5-1e4f-4dc7-bfd4-1e08db332263';
const managerId = 'e4e6f4a1-b0fb-4b9e-8e06-d33aa0ee2f72';
const checkInId = '2a093830-a040-4dfb-a4b3-e054a9d8b63d';
const testPassword = 'Super-test-password-2026';

type TestUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
};

describe('Staff authentication and management (e2e)', () => {
  let app: INestApplication<App>;
  let adminCookie: string;
  let prismaMock: {
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    user: {
      count: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  const users = new Map<string, TestUser>();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-only-secret-that-is-long-enough';
    process.env.EMAIL_ENCRYPTION_KEY ??= 'test-only-email-encryption-key';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    users.clear();
    users.set('admin@example.com', {
      id: adminId,
      firstName: 'EventHub',
      lastName: 'Administrator',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash(testPassword, 4),
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    users.set('manager@example.com', {
      id: managerId,
      firstName: 'Event',
      lastName: 'Manager',
      email: 'manager@example.com',
      passwordHash: await bcrypt.hash(testPassword, 4),
      role: UserRole.EVENT_MANAGER,
      isActive: true,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    users.set('checkin@example.com', {
      id: checkInId,
      firstName: 'Check-in',
      lastName: 'Staff',
      email: 'checkin@example.com',
      passwordHash: await bcrypt.hash(testPassword, 4),
      role: UserRole.CHECK_IN_STAFF,
      isActive: true,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });

    prismaMock = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
      user: {
        count: jest.fn(async ({ where }) =>
          [...users.values()].filter(
            (user) =>
              user.role === where.role &&
              user.isActive === where.isActive,
          ).length,
        ),
        create: jest.fn(async ({ data }) => {
          const user: TestUser = {
            id: '98b848aa-ecf3-43ae-8fa4-d2038b0854c3',
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            passwordHash: data.passwordHash,
            role: data.role,
            isActive: true,
            createdAt: new Date(),
          };
          users.set(user.email, user);
          return selectUser(user, {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
          });
        }),
        findMany: jest.fn(async () =>
          [...users.values()]
            .sort((left, right) => right.createdAt.valueOf() - left.createdAt.valueOf())
            .map((user) =>
              selectUser(user, {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isActive: true,
              }),
            ),
        ),
        findUnique: jest.fn(async ({ where, select }) => {
          const user = where.id
            ? [...users.values()].find((candidate) => candidate.id === where.id)
            : users.get(where.email);
          return user ? selectUser(user, select) : null;
        }),
        update: jest.fn(async ({ where, data, select }) => {
          const user = [...users.values()].find(
            (candidate) => candidate.id === where.id,
          );
          if (!user) {
            return null;
          }
          Object.assign(user, data);
          if (data.email) {
            users.delete(
              [...users.entries()].find(([, candidate]) => candidate.id === user.id)?.[0] ??
                user.email,
            );
            users.set(user.email, user);
          }
          return selectUser(user, select);
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async (callback: (transaction: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const jwt = app.get(JwtService);
    adminCookie = `eventhub_auth=${await jwt.signAsync({
      sub: adminId,
      role: UserRole.SUPER_ADMIN,
    })}`;
  });

  it('logs in with a safe response and sets an HTTP-only JWT cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ADMIN@example.com', password: testPassword })
      .expect(201);

    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );
    expect(response.body.user).toMatchObject({
      id: adminId,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    });
    expect(response.body).not.toHaveProperty('token');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('blocks unauthenticated staff-list requests', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });

  it.each([
    ['Event Manager', managerId, UserRole.EVENT_MANAGER],
    ['Check-in Staff', checkInId, UserRole.CHECK_IN_STAFF],
  ])('%s cannot access staff management or create Super Admins', async (_label, id, role) => {
    const jwt = app.get(JwtService);
    const cookie = `eventhub_auth=${await jwt.signAsync({ sub: id, role })}`;

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/users/${id}`)
      .set('Cookie', cookie)
      .send({ role: UserRole.SUPER_ADMIN })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookie)
      .send({
        firstName: 'Unauthorized',
        lastName: 'Admin',
        email: 'unauthorized-admin@example.com',
        password: testPassword,
        role: UserRole.SUPER_ADMIN,
      })
      .expect(403);
  });

  it('prevents Check-in Staff from exporting registrations, viewing registration details, or reading email logs', async () => {
    const jwt = app.get(JwtService);
    const cookie = `eventhub_auth=${await jwt.signAsync({
      sub: checkInId,
      role: UserRole.CHECK_IN_STAFF,
    })}`;

    await request(app.getHttpServer())
      .get(`/api/events/${adminId}/registrations/export`)
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/registrations/${adminId}`)
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/email-logs')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/events/manage/check-in-staff')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .put(`/api/events/${adminId}/check-in-staff`)
      .set('Cookie', cookie)
      .send({ staffIds: [] })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/events/${adminId}/archive`)
      .set('Cookie', cookie)
      .expect(403);
  });

  it('allows the Super Admin to manage staff but never creates another Super Admin', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(list.body).toHaveLength(3);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        firstName: 'Another',
        lastName: 'Admin',
        email: 'another-admin@example.com',
        password: testPassword,
        role: UserRole.SUPER_ADMIN,
      })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        firstName: 'New',
        lastName: 'Manager',
        email: 'new-manager@example.com',
        password: testPassword,
        role: UserRole.EVENT_MANAGER,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      email: 'new-manager@example.com',
      role: UserRole.EVENT_MANAGER,
      isActive: true,
    });
    expect(created.body).not.toHaveProperty('passwordHash');
    expect(
      await bcrypt.compare(
        testPassword,
        users.get('new-manager@example.com')!.passwordHash,
      ),
    ).toBe(true);

    const createdCheckInStaff = await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        firstName: 'New',
        lastName: 'Check-in',
        email: 'new-checkin@example.com',
        password: testPassword,
        role: UserRole.CHECK_IN_STAFF,
      })
      .expect(201);
    expect(createdCheckInStaff.body.role).toBe(UserRole.CHECK_IN_STAFF);
  });

  it('deactivates and reactivates staff, revoking stale sessions while inactive', async () => {
    const jwt = app.get(JwtService);
    const managerCookie = `eventhub_auth=${await jwt.signAsync({
      sub: managerId,
      role: UserRole.EVENT_MANAGER,
    })}`;

    await request(app.getHttpServer())
      .patch(`/api/users/${managerId}/status`)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(200)
      .expect(({ body }) => expect(body.isActive).toBe(false));

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', managerCookie)
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/users/${managerId}/status`)
      .set('Cookie', adminCookie)
      .send({ isActive: true })
      .expect(200)
      .expect(({ body }) => expect(body.isActive).toBe(true));

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', managerCookie)
      .expect(403);
  });

  it('updates staff details and revokes tokens that contain a previous role', async () => {
    const jwt = app.get(JwtService);
    const oldManagerCookie = `eventhub_auth=${await jwt.signAsync({
      sub: managerId,
      role: UserRole.EVENT_MANAGER,
    })}`;

    await request(app.getHttpServer())
      .patch(`/api/users/${managerId}`)
      .set('Cookie', adminCookie)
      .send({
        firstName: 'Updated',
        role: UserRole.CHECK_IN_STAFF,
      })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          firstName: 'Updated',
          role: UserRole.CHECK_IN_STAFF,
          isActive: true,
        }),
      );

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', oldManagerCookie)
      .expect(401);

    const currentRoleCookie = `eventhub_auth=${await jwt.signAsync({
      sub: managerId,
      role: UserRole.CHECK_IN_STAFF,
    })}`;
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', currentRoleCookie)
      .expect(403);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});

function selectUser(
  user: TestUser,
  select?: Record<string, boolean> | null,
): Record<string, unknown> {
  if (!select) {
    return user;
  }
  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, user[key as keyof TestUser]]),
  );
}
