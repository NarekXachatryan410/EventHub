import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { EmailType } from '@prisma/client';
import { EmailTemplatesService } from './email-templates.service.js';

describe('EmailTemplatesService registration confirmation', () => {
  const prisma = {
    emailTemplate: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new EmailTemplatesService(prisma as never);
  const payload = {
    to: 'ada@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    eventTitle: 'Academy Open Day',
    eventDate: '2030-05-10T09:00:00.000Z',
    eventLocation: 'Main campus',
    ticketUrl: 'https://events.example.test/tickets/secret-token',
    qrCodeBase64: 'cXItY29kZQ==',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the ticket QR image and online ticket link in the default email', async () => {
    prisma.emailTemplate.findUnique.mockResolvedValue(null);

    const rendered = await service.render(
      EmailType.REGISTRATION_CONFIRMATION,
      payload,
    );

    expect(rendered.html).toContain('src="cid:eventhub-ticket"');
    expect(rendered.html).toContain('Open your ticket online');
    expect(rendered.html).toContain(payload.ticketUrl);
    expect(rendered.text).toContain(payload.ticketUrl);
  });

  it('adds the required inline QR image when a custom template omits it', async () => {
    prisma.emailTemplate.findUnique.mockResolvedValue({
      subject: 'Welcome {{firstName}}',
      html: '<p>Your place for {{eventTitle}} is confirmed.</p>',
      text: 'Confirmed for {{eventTitle}}',
      isActive: true,
    });

    const rendered = await service.render(
      EmailType.REGISTRATION_CONFIRMATION,
      payload,
    );

    expect(rendered.html).toContain('Your place for Academy Open Day');
    expect(rendered.html).toContain('src="cid:eventhub-ticket"');
  });

  it('uses the safe default if an existing confirmation template is inactive', async () => {
    prisma.emailTemplate.findUnique.mockResolvedValue({
      subject: 'Disabled {{eventTitle}}',
      html: '<p>Disabled</p>',
      text: null,
      isActive: false,
    });

    const rendered = await service.render(
      EmailType.REGISTRATION_CONFIRMATION,
      payload,
    );

    expect(rendered.subject).toContain('Your ticket for Academy Open Day');
    expect(rendered.html).toContain('src="cid:eventhub-ticket"');
    await expect(
      service.upsert(EmailType.REGISTRATION_CONFIRMATION, {
        subject: 'Disabled',
        html: '<p>Disabled</p>',
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
