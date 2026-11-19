import {
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateStaffDto {
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

  @IsString()
  @MinLength(12)
  password!: string;

  @IsIn([UserRole.EVENT_MANAGER, UserRole.CHECK_IN_STAFF])
  role!: UserRole;
}
