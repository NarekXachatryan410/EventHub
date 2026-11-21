import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmailType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EmailPayload, EmailTemplateContent } from './email.types.js';

const defaultTemplates: Record<
  EmailType,
  Omit<EmailTemplateContent, 'type'>
> = {
  REGISTRATION_CONFIRMATION: {
    subject: 'Your ticket for {{eventTitle}}',
    html: '<p>Hello {{firstName}},</p><h1>Your registration is confirmed</h1><p>You are registered for <strong>{{eventTitle}}</strong>.</p><p>{{eventDate}} · {{eventLocation}}</p><h2>Your ticket QR code</h2><p>Show this QR code at check-in.</p><p><img src="cid:eventhub-ticket" alt="QR code for your {{eventTitle}} ticket" width="220" height="220"></p><p><a href="{{ticketUrl}}">Open your ticket online</a></p>',
    text: 'Hello {{firstName}}, your registration for {{eventTitle}} is confirmed. {{eventDate}} · {{eventLocation}}. Show the QR code in this email at check-in, or open your ticket online: {{ticketUrl}}',
  },
  WAITLIST_CONFIRMATION: {
    subject: 'You are on the waiting list for {{eventTitle}}',
    html: '<p>Hello {{firstName}},</p><p>You are on the waiting list for {{eventTitle}}. We will email you if a place becomes available.</p><p><a href="{{cancellationUrl}}">Cancel your waiting-list request</a></p>',
  },
  EVENT_REMINDER: {
    subject: 'Reminder: {{eventTitle}}',
    html: '<p>Hello {{firstName}},</p><p>This is a reminder for <strong>{{eventTitle}}</strong>.</p><p>{{eventDate}} · {{eventLocation}}</p><p><a href="{{ticketUrl}}">Open your ticket</a></p>',
  },
  REGISTRATION_CANCELLATION: {
    subject: 'Your {{eventTitle}} registration was cancelled',
    html: '<p>Hello {{firstName}},</p><p>Your registration for {{eventTitle}} has been cancelled.</p>',
  },
  EVENT_CANCELLATION: {
    subject: '{{eventTitle}} has been cancelled',
    html: '<p>Hello {{firstName}},</p><p>We are sorry, but {{eventTitle}} has been cancelled.</p>',
  },
  POST_EVENT_THANK_YOU: {
    subject: 'Thank you for attending {{eventTitle}}',
    html: '<p>Hello {{firstName}},</p><p>Thank you for attending {{eventTitle}}.</p><p><a href="{{feedbackUrl}}">Share your feedback</a></p>',
  },
  FEEDBACK_REQUEST: {
    subject: 'Share your feedback about {{eventTitle}}',
    html: '<p>Hello {{firstName}},</p><p>Please share your feedback about {{eventTitle}}.</p><p><a href="{{feedbackUrl}}">Submit feedback</a></p>',
  },
  EVENT_MATERIALS: {
    subject: 'Materials from {{eventTitle}}',
    html: '<p>Hello {{firstName}},</p><p><a href="{{materialsUrl}}">View the event materials</a></p>',
  },
};

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.emailTemplate.findMany({ orderBy: { type: 'asc' } });
  }

  async upsert(
    type: EmailType,
    data: { subject: string; html: string; text?: string; isActive?: boolean },
  ) {
    if (
      type === EmailType.REGISTRATION_CONFIRMATION &&
      data.isActive === false
    ) {
      throw new BadRequestException(
        'The registration confirmation email must remain active',
      );
    }
    return this.prisma.emailTemplate.upsert({
      where: { type },
      create: {
        type,
        subject: data.subject,
        html: data.html,
        text: data.text,
        isActive: data.isActive ?? true,
      },
      update: {
        subject: data.subject,
        html: data.html,
        text: data.text,
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async render(type: EmailType, payload: EmailPayload) {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { type },
    });
    if (
      template &&
      !template.isActive &&
      type !== EmailType.REGISTRATION_CONFIRMATION
    ) {
      throw new NotFoundException(`The ${type} email template is disabled`);
    }
    const content = template?.isActive ? template : defaultTemplates[type];
    let html = this.replaceVariables(content.html, payload, true);
    if (
      type === EmailType.REGISTRATION_CONFIRMATION &&
      payload.qrCodeBase64 &&
      !/<img\b[^>]*\bsrc=["']cid:eventhub-ticket["']/i.test(html)
    ) {
      html +=
        '<p><img src="cid:eventhub-ticket" alt="QR code for your ticket" width="220" height="220"></p>';
    }
    return {
      subject: this.replaceVariables(content.subject, payload, false),
      html,
      text: content.text
        ? this.replaceVariables(content.text, payload, false)
        : undefined,
    };
  }

  private replaceVariables(
    template: string,
    payload: EmailPayload,
    escapeHtml: boolean,
  ): string {
    return template.replace(
      /\{\{([a-zA-Z0-9_]+)\}\}/g,
      (_match, key: string) => {
        const value = payload[key] ?? '';
        return escapeHtml ? this.escapeHtml(value) : value;
      },
    );
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character]!;
    });
  }
}
