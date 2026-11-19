import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertEmailTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  html!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  text?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
