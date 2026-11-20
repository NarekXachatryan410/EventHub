import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { EmailDeliveryWebhookService } from './email-delivery-webhook.service.js';

@Controller('webhooks')
export class EmailWebhooksController {
  constructor(private readonly delivery: EmailDeliveryWebhookService) {}

  @Post('resend')
  @HttpCode(200)
  receive(@Req() request: RawBodyRequest<Request>) {
    if (!request.rawBody) {
      throw new BadRequestException('Raw webhook payload is unavailable');
    }
    return this.delivery.receive(
      request.rawBody.toString('utf8'),
      request.headers,
    );
  }
}
