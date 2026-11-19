import type { EmailType } from '@prisma/client';

export const EMAIL_QUEUE = 'eventhub-email';

export interface EmailPayload {
  to: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventUrl?: string;
  ticketUrl?: string;
  feedbackUrl?: string;
  qrCodeBase64?: string;
  cancellationUrl?: string;
  materialsUrl?: string;
  [key: string]: string | undefined;
}

export interface EmailTemplateContent {
  type: EmailType;
  subject: string;
  html: string;
  text?: string;
}
