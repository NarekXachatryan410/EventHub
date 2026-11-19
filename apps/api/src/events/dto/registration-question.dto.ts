import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum RegistrationQuestionType {
  SHORT_TEXT = 'SHORT_TEXT',
  LONG_TEXT = 'LONG_TEXT',
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
}

export class RegistrationQuestionDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label!: string;

  @IsEnum(RegistrationQuestionType)
  type!: RegistrationQuestionType;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  options?: string[];
}

export class RegistrationQuestionsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegistrationQuestionDto)
  questions?: RegistrationQuestionDto[];
}
