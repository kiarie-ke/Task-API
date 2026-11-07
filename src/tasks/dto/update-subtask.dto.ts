import { IsBoolean } from 'class-validator';

export class UpdateSubtaskDto {
    @IsBoolean()
    completed: boolean;
}

