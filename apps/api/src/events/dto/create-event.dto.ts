import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EventType } from '@prisma/client';
import { RegistrationQuestionDto } from './registration-question.dto.js';

export class CreateEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(180)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  description!: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  coverImage?: string;

  @IsEnum(EventType)
  type!: EventType;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  location!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @IsISO8601()
  registrationDeadline!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  maxAttendees?: number;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string;

  @IsBoolean()
  registrationEnabled!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RegistrationQuestionDto)
  registrationQuestions?: RegistrationQuestionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(720, { each: true })
  reminderOffsetsHours?: number[];
}
