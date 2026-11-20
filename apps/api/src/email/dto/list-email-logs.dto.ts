import { EmailStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListEmailLogsDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsEnum(EmailStatus)
  status?: EmailStatus;
}
