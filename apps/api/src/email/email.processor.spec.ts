import { jest } from '@jest/globals';

const sendEmail = jest.fn();
jest.unstable_mockModule('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

const { EmailProcessor, isPermanentSenderError, describeDeliveryError } =
  await import('./email.processor.js');

describe('EmailProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('identifies permanent sender restrictions as non-retryable', () => {
    expect(
      isPermanentSenderError('The example.com domain is not verified.'),
    ).toBe(true);
    expect(
      isPermanentSenderError(
        'You can only send testing emails to your own email address. Verify a domain at resend.com/domains.',
      ),
    ).toBe(true);
    expect(isPermanentSenderError('Resend delivery failed: rate limited')).toBe(
      false,
    );
  });

  it('gives an actionable fix for Resend testing-sender rejection', () => {
    expect(
      describeDeliveryError(
        'Resend delivery failed: You can only send testing emails to your own email address.',
      ),
    ).toMatch(/verify a sending domain in Resend.*retry this email/i);
  });

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

  it('sends a registration confirmation with its inline QR attachment', async () => {
    sendEmail.mockResolvedValue({
      data: { id: 'provider-email-id' },
      error: null,
    });
    const qrCodeBase64 = 'cXItY29kZS1ieXRlcw==';
    const prisma = {
      emailLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'confirmation-id',
          type: 'REGISTRATION_CONFIRMATION',
          status: 'PENDING',
          scheduledAt: new Date(Date.now() - 1_000),
          payloadCiphertext: 'encrypted-payload',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const processor = new EmailProcessor(
      prisma as never,
      {
        get: jest.fn((key: string) =>
          key === 'RESEND_API_KEY' ? 'resend-key' : 'tickets@example.test',
        ),
      } as never,
      {
        decrypt: jest.fn().mockReturnValue({
          to: 'ada@example.test',
          firstName: 'Ada',
          lastName: 'Lovelace',
          eventTitle: 'Academy Open Day',
          eventDate: '2030-05-10T09:00:00.000Z',
          eventLocation: 'Main campus',
          ticketUrl: 'https://events.example.test/tickets/secret-token',
          qrCodeBase64,
        }),
      } as never,
      {
        render: jest.fn().mockResolvedValue({
          subject: 'Your ticket',
          html: '<img src="cid:eventhub-ticket">',
          text: 'Your ticket',
        }),
      } as never,
    );

    await processor.process({
      data: { emailLogId: 'confirmation-id' },
      attemptsMade: 0,
      opts: { attempts: 5 },
    } as never);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.test',
        html: '<img src="cid:eventhub-ticket">',
        attachments: [
          expect.objectContaining({
            filename: 'eventhub-ticket.png',
            content: qrCodeBase64,
            contentId: 'eventhub-ticket',
            contentType: 'image/png',
          }),
        ],
      }),
    );
    expect(prisma.emailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'confirmation-id' },
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('never sends a confirmation if its ticket QR payload is missing', async () => {
    const prisma = {
      emailLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'confirmation-id',
          type: 'REGISTRATION_CONFIRMATION',
          status: 'PENDING',
          scheduledAt: new Date(Date.now() - 1_000),
          payloadCiphertext: 'encrypted-payload',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const processor = new EmailProcessor(
      prisma as never,
      {
        get: jest.fn((key: string) =>
          key === 'RESEND_API_KEY' ? 'resend-key' : 'tickets@example.test',
        ),
      } as never,
      {
        decrypt: jest.fn().mockReturnValue({ to: 'ada@example.test' }),
      } as never,
      { render: jest.fn() } as never,
    );

    await expect(
      processor.process({
        data: { emailLogId: 'confirmation-id' },
        attemptsMade: 0,
        opts: { attempts: 5 },
      } as never),
    ).rejects.toThrow(
      'Registration confirmation is missing its ticket QR code',
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
