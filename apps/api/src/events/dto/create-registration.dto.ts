import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRegistrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  organization?: string;

  @IsOptional()
  @IsBoolean()
  interestedInPrograms?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  joinWaitlist?: boolean;

  @IsOptional()
  @IsObject()
  additionalAnswers?: Record<string, unknown>;
}

export class CancelRegistrationDto {
  @IsString()
  @MinLength(1)
  cancellationToken!: string;
}
