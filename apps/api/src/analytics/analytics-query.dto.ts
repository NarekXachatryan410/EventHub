import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class AnalyticsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(24)
  months = 12;
}
