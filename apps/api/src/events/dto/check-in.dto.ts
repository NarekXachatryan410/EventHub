import { IsString, IsUUID, MinLength } from 'class-validator';

export class CheckInDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

export class ManualCheckInDto {
  @IsUUID()
  registrationId!: string;
}
