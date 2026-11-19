import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;
  let checkDatabase: jest.Mock;

  beforeEach(async () => {
    checkDatabase = jest.fn().mockResolvedValue(undefined);
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: { checkDatabase },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('reports a healthy database connection', async () => {
    await expect(appController.getHealth()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(checkDatabase).toHaveBeenCalledTimes(1);
  });
});
