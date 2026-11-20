import { jest } from '@jest/globals';
import { EmailProcessor } from './email.processor.js';

describe('EmailProcessor', () => {
  it('does not send a reminder job before its rescheduled time', async () => {
    const prisma = {
      emailLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'reminder-id',
          type: 'EVENT_REMINDER',
          status: 'PENDING',
          scheduledAt: new Date(Date.now() + 60_000),
          payloadCiphertext: 'encrypted-payload',
        }),
        update: jest.fn(),
      },
    };
    const processor = new EmailProcessor(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await processor.process({
      data: { emailLogId: 'reminder-id' },
      attemptsMade: 0,
      opts: { attempts: 5 },
    } as never);

    expect(prisma.emailLog.update).not.toHaveBeenCalled();
  });
});
