import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitFeedbackDto {
  @IsString()
  @MinLength(1)
  ticketToken!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  overallRating!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  contentRating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  organizationRating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  interestedInPrograms?: boolean;
}
