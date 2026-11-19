import {
  Body,
  Controller,
  Get,
  ParseEnumPipe,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { EmailType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto.js';
import { EmailTemplatesService } from './email-templates.service.js';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Put(':type')
  upsert(
    @Param('type', new ParseEnumPipe(EmailType)) type: EmailType,
    @Body() input: UpsertEmailTemplateDto,
  ) {
    return this.templates.upsert(type, input);
  }
}
