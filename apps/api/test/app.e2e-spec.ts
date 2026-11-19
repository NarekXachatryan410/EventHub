import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-only-secret-that-is-long-enough';
    process.env.EMAIL_ENCRYPTION_KEY ??= 'test-only-email-encryption-key';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('reports the API and database health', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'connected' });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
