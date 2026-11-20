import { IsUUID } from 'class-validator';

export class CreateChecklistDto {
  @IsUUID('4')
  templateId!: string;
}
