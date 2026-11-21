import cookieParser from 'cookie-parser';
import { jest } from '@jest/globals';
import { CanActivate, ExecutionContext, Injectable, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { CrmController } from '../src/crm/crm.controller.js';
import { CrmService } from '../src/crm/crm.service.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const managerId = '11111111-1111-4111-8111-111111111111';
const otherManagerId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const staffId = '44444444-4444-4444-8444-444444444444';

@Injectable()
class TestIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: { sub: string; role: UserRole } }>();
    const sub = request.headers['x-test-user'];
    const role = request.headers['x-test-role'] as UserRole | undefined;
    if (!sub || !role) return false;
    request.user = { sub, role };
    return true;
  }
}

type Row = Record<string, any>;
type Query = { where?: Row; data?: Row; take?: number; cursor?: { id: string }; skip?: number; orderBy?: unknown };

function makeDatabase() {
  const users = new Map([
    [managerId, { id: managerId, role: UserRole.EVENT_MANAGER, isActive: true }],
    [otherManagerId, { id: otherManagerId, role: UserRole.EVENT_MANAGER, isActive: true }],
    [adminId, { id: adminId, role: UserRole.SUPER_ADMIN, isActive: true }],
    [staffId, { id: staffId, role: UserRole.CHECK_IN_STAFF, isActive: true }],
  ]);
  const customers: Row[] = [];
  const notes: Row[] = [];
  const activities: Row[] = [];
  const tags: Row[] = [];
  const tagAssignments: Row[] = [];
  const reminders: Row[] = [];
  const segments: Row[] = [];
  const registrations: Row[] = [];
  let counter = 0;
  const makeId = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++counter).padStart(12, '0')}`;
  const matchesCustomer = (customer: Row, where: Row = {}) => {
    if (where.organizerId && customer.organizerId !== where.organizerId) return false;
    if (where.id && typeof where.id === 'string' && customer.id !== where.id) return false;
    if (where.status && customer.status !== where.status) return false;
    if (where.tags?.some?.tagId && !tagAssignments.some((assignment) => assignment.customerId === customer.id && assignment.tagId === where.tags.some.tagId)) return false;
    if (where.tags?.some?.tagId?.in && !tagAssignments.some((assignment) => assignment.customerId === customer.id && where.tags.some.tagId.in.includes(assignment.tagId))) return false;
    if (where.registrations?.some && !registrations.some((registration) => registration.crmCustomerId === customer.id)) return false;
    return true;
  };
  const database: Row = {
    user: {
      findUnique: jest.fn(async ({ where }: Query) => users.get(where?.id ?? '') ?? null),
      findFirst: jest.fn(async ({ where }: Query) => users.get(where?.id ?? '') ?? null),
    },
    crmCustomer: {
      create: jest.fn(async ({ data }: Query) => {
        const customer = { ...data, status: data?.status ?? 'ACTIVE', marketingConsent: false, id: makeId(), createdAt: new Date(), updatedAt: new Date(), _count: { registrations: 0, notes: 0 } };
        customers.push(customer);
        return customer;
      }),
      findMany: jest.fn(async ({ where, take, cursor, skip }: Query = {}) => {
        let result = customers.filter((customer) => matchesCustomer(customer, where));
        if (cursor?.id) { const index = result.findIndex((customer) => customer.id === cursor.id); if (index >= 0) result = result.slice(index + (skip ?? 0)); }
        result = result.slice(0, take ?? result.length);
        return result.map((customer) => ({ ...customer, _count: { registrations: registrations.filter((registration) => registration.crmCustomerId === customer.id).length, notes: notes.filter((note) => note.customerId === customer.id).length } }));
      }),
      findFirst: jest.fn(async ({ where }: Query) => customers.find((customer) => matchesCustomer(customer, where)) ?? null),
      count: jest.fn(async ({ where }: Query = {}) => customers.filter((customer) => matchesCustomer(customer, where)).length),
      update: jest.fn(async ({ where, data }: Query) => {
        const customer = customers.find((item) => item.id === where?.id);
        if (!customer) return null;
        Object.assign(customer, data, { updatedAt: new Date() });
        return customer;
      }),
      upsert: jest.fn(),
    },
    crmCustomerActivity: {
      create: jest.fn(async ({ data }: Query) => { const activity = { ...data, id: makeId(), occurredAt: data?.occurredAt ?? new Date() }; activities.push(activity); return activity; }),
      findMany: jest.fn(async () => activities),
    },
    crmCustomerNote: {
      create: jest.fn(async ({ data }: Query) => { const note = { ...data, id: makeId(), createdAt: new Date(), updatedAt: new Date(), author: { id: data?.authorId, firstName: 'Event', lastName: 'Manager' } }; notes.push(note); return note; }),
      findMany: jest.fn(async ({ where }: Query = {}) => notes.filter((note) => note.customerId === where?.customerId)),
      findFirst: jest.fn(async ({ where }: Query) => notes.find((note) => note.id === where?.id && note.customerId === where?.customerId) ?? null),
      update: jest.fn(async ({ where, data }: Query) => { const note = notes.find((item) => item.id === where?.id); if (!note) return null; Object.assign(note, data, { updatedAt: new Date() }); return note; }),
      deleteMany: jest.fn(async ({ where }: Query) => { const index = notes.findIndex((note) => note.id === where?.id && note.customerId === where?.customerId); if (index < 0) return { count: 0 }; notes.splice(index, 1); return { count: 1 }; }),
    },
    crmCustomerTag: {
      create: jest.fn(async ({ data }: Query) => { const tag = { ...data, id: makeId(), createdAt: new Date() }; tags.push(tag); return tag; }),
      findMany: jest.fn(async ({ where }: Query = {}) => tags.filter((tag) => tag.organizerId === where?.organizerId)),
      findFirst: jest.fn(async ({ where }: Query) => tags.find((tag) => tag.id === where?.id && tag.organizerId === where?.organizerId) ?? null),
      count: jest.fn(async ({ where }: Query) => tags.filter((tag) => tag.organizerId === where?.organizerId && where?.id?.in?.includes(tag.id)).length),
      delete: jest.fn(async ({ where }: Query) => { const index = tags.findIndex((tag) => tag.id === where?.id); if (index >= 0) tags.splice(index, 1); return {}; }),
    },
    crmCustomerTagAssignment: {
      upsert: jest.fn(async ({ where, create }: Query) => { const existing = tagAssignments.find((item) => item.customerId === where?.customerId_tagId?.customerId && item.tagId === where?.customerId_tagId?.tagId); if (existing) return existing; const assignment = { ...create, assignedAt: new Date() }; tagAssignments.push(assignment); return assignment; }),
      deleteMany: jest.fn(async ({ where }: Query) => { const index = tagAssignments.findIndex((item) => item.customerId === where?.customerId && item.tagId === where?.tagId); if (index < 0) return { count: 0 }; tagAssignments.splice(index, 1); return { count: 1 }; }),
    },
    crmCustomerReminder: {
      create: jest.fn(async ({ data }: Query) => { const reminder = { ...data, id: makeId(), status: 'PENDING', completedAt: null, createdAt: new Date(), updatedAt: new Date() }; reminders.push(reminder); return reminder; }),
      findMany: jest.fn(async ({ where }: Query = {}) => reminders.filter((reminder) => (reminder.customerId === where?.customerId || reminder.customerId === where?.customer?.id || reminder.customerId === customers.find((customer) => customer.organizerId === where?.customer?.organizerId)?.id) && (!where?.status || reminder.status === where.status))),
      findFirst: jest.fn(async ({ where }: Query) => reminders.find((reminder) => reminder.id === where?.id && reminder.customerId === where?.customerId) ?? null),
      update: jest.fn(async ({ where, data }: Query) => { const reminder = reminders.find((item) => item.id === where?.id); if (!reminder) return null; Object.assign(reminder, data, { updatedAt: new Date() }); return reminder; }),
      deleteMany: jest.fn(async ({ where }: Query) => { const index = reminders.findIndex((item) => item.id === where?.id && item.customerId === where?.customerId); if (index < 0) return { count: 0 }; reminders.splice(index, 1); return { count: 1 }; }),
    },
    crmCustomerSegment: {
      create: jest.fn(async ({ data }: Query) => { const segment = { ...data, id: makeId(), createdAt: new Date(), updatedAt: new Date(), isSystem: false }; segments.push(segment); return segment; }),
      findMany: jest.fn(async ({ where }: Query = {}) => segments.filter((segment) => segment.organizerId === where?.organizerId)),
      findFirst: jest.fn(async ({ where }: Query) => segments.find((segment) => segment.id === where?.id && (!where?.organizerId || segment.organizerId === where.organizerId)) ?? null),
      deleteMany: jest.fn(async ({ where }: Query) => { const index = segments.findIndex((segment) => segment.id === where?.id && (!where?.organizerId || segment.organizerId === where.organizerId)); if (index < 0) return { count: 0 }; segments.splice(index, 1); return { count: 1 }; }),
    },
    eventRegistration: {
      findMany: jest.fn(async ({ where }: Query = {}) => registrations.filter((registration) => registration.crmCustomerId === where?.crmCustomerId)),
      count: jest.fn(async () => registrations.length),
    },
    emailLog: { findMany: jest.fn(async () => []) },
    checkIn: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (callback: (tx: Row) => Promise<unknown>) => callback(database)),
  };
  return { database, customers, notes, activities, tags, tagAssignments, reminders, segments, users };
}

describe('CRM HTTP workflow', () => {
  let app: INestApplication<App>;
  let fixture: ReturnType<typeof makeDatabase>;

  beforeAll(async () => {
    fixture = makeDatabase();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CrmController],
      providers: [
        CrmService,
        RolesGuard,
        { provide: PrismaService, useValue: fixture.database },
      ],
    }).overrideGuard(JwtAuthGuard).useClass(TestIdentityGuard).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  it('creates customer records and completes note, tag, reminder, and dynamic-segment workflows', async () => {
    const manager = (request(app.getHttpServer()).post('/api/crm/customers').set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER));
    const created = await manager.send({ firstName: 'Ada', lastName: 'Lovelace', email: 'ADA@example.test' }).expect(201);
    const customerId = created.body.id as string;
    expect(created.body).toMatchObject({ organizerId: managerId, email: 'ada@example.test', firstName: 'Ada' });

    const note = await request(app.getHttpServer()).post(`/api/crm/customers/${customerId}/notes`).set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).send({ content: 'Interested in the next workshop.' }).expect(201);
    expect(note.body).toMatchObject({ customerId, content: 'Interested in the next workshop.' });

    const tag = await request(app.getHttpServer()).post('/api/crm/tags').set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).send({ name: 'Workshop interest' }).expect(201);
    await request(app.getHttpServer()).post(`/api/crm/customers/${customerId}/tags`).set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).send({ tagId: tag.body.id }).expect(201);

    const reminder = await request(app.getHttpServer()).post(`/api/crm/customers/${customerId}/reminders`).set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).send({ title: 'Follow up', dueAt: '2030-02-01T12:00:00.000Z', assignedToId: managerId }).expect(201);
    expect(reminder.body).toMatchObject({ customerId, title: 'Follow up', status: 'PENDING' });
    const pendingReminders = await request(app.getHttpServer()).get('/api/crm/reminders?status=PENDING').set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).expect(200);
    expect(pendingReminders.body.items).toHaveLength(1);
    await request(app.getHttpServer()).post(`/api/crm/customers/${customerId}/reminders/${reminder.body.id}/complete`).set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).expect(201);
    const timeline = await request(app.getHttpServer()).get(`/api/crm/customers/${customerId}/activity?limit=25`).set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).expect(200);
    expect(timeline.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'REMINDER_COMPLETED' })]));

    const segment = await request(app.getHttpServer()).post('/api/crm/segments').set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).send({ name: 'All active contacts', criteria: { status: 'ACTIVE' } }).expect(201);
    const members = await request(app.getHttpServer()).get(`/api/crm/segments/${segment.body.id}/members?limit=10`).set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).expect(200);
    expect(members.body).toMatchObject({ total: 1, items: [{ id: customerId }] });

    const dashboard = await request(app.getHttpServer()).get('/api/crm/analytics/dashboard').set('x-test-user', managerId).set('x-test-role', UserRole.EVENT_MANAGER).expect(200);
    expect(dashboard.body).toMatchObject({ totalCustomers: 1, activeCustomers: 1, archivedCustomers: 0 });
    expect(dashboard.body.customerGrowth).toHaveLength(12);
  });

  it('enforces customer and saved-segment tenant isolation and excludes Check-in Staff', async () => {
    const customer = fixture.customers[0]!;
    const segment = fixture.segments[0]!;
    await request(app.getHttpServer()).get(`/api/crm/customers/${customer.id}`).set('x-test-user', otherManagerId).set('x-test-role', UserRole.EVENT_MANAGER).expect(404);
    await request(app.getHttpServer()).get(`/api/crm/segments/${segment.id}/members`).set('x-test-user', otherManagerId).set('x-test-role', UserRole.EVENT_MANAGER).expect(404);
    await request(app.getHttpServer()).get('/api/crm/customers').set('x-test-user', staffId).set('x-test-role', UserRole.CHECK_IN_STAFF).expect(403);
    await request(app.getHttpServer()).get('/api/crm/analytics/dashboard').set('x-test-user', staffId).set('x-test-role', UserRole.CHECK_IN_STAFF).expect(403);
  });

  it('lets Super Admins scope customer lists to one organizer', async () => {
    const response = await request(app.getHttpServer()).get(`/api/crm/customers?organizerId=${managerId}`).set('x-test-user', adminId).set('x-test-role', UserRole.SUPER_ADMIN).expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].organizerId).toBe(managerId);
  });

  afterAll(async () => { if (app) await app.close(); });
});
