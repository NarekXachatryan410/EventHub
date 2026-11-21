import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CrmCustomerStatus, CrmReminderStatus } from '@prisma/client';

export class CrmNoteDto {
  @IsString() @MinLength(1) @MaxLength(10000) content!: string;
}

export class CrmTagDto {
  @IsString() @MinLength(1) @MaxLength(48) name!: string;
  @IsOptional() @IsString() @MaxLength(24) color?: string;
  @IsOptional() @IsUUID('4') organizerId?: string;
}

export class CrmReminderDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsDateString() dueAt!: string;
  @IsOptional() @IsUUID('4') assignedToId?: string | null;
}

export class ListCrmRemindersDto {
  @IsOptional() @IsUUID('4') customerId?: string;
  @IsOptional() @IsEnum(CrmReminderStatus) status?: CrmReminderStatus;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() overdue?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() assignedToMe?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsUUID('4') cursor?: string;
}

export class SegmentCriteriaDto {
  @IsOptional() @IsEnum(CrmCustomerStatus) status?: CrmCustomerStatus;
  @IsOptional() @IsDateString() registeredAfter?: string;
  @IsOptional() @IsDateString() registeredBefore?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000000) minTickets?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000000) maxTickets?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() attended?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) tagIds?: string[];
}

export class UpdateCrmReminderDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsUUID('4') assignedToId?: string | null;
}

export class SaveCrmSegmentDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ValidateNested() @Type(() => SegmentCriteriaDto) criteria!: SegmentCriteriaDto;
  @IsOptional() @IsUUID('4') organizerId?: string;
}

export class CrmSegmentQueryDto {
  @ValidateNested() @Type(() => SegmentCriteriaDto) criteria!: SegmentCriteriaDto;
  @IsOptional() @IsUUID('4') organizerId?: string;
}

export class CrmActivityQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsString() @MaxLength(256) cursor?: string;
}

export class CrmRegistrationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsUUID('4') cursor?: string;
}

export class CrmOrganizerQueryDto {
  @IsOptional() @IsUUID('4') organizerId?: string;
}

export class CrmTagAssignmentDto {
  @IsUUID('4') tagId!: string;
}
