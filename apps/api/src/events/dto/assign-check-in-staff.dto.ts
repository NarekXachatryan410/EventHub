import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignCheckInStaffDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  staffIds!: string[];
}
