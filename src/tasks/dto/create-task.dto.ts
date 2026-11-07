import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsString,
    IsInt,
    IsPositive,
    Matches,
    MaxLength,
    ValidateIf,
} from 'class-validator';
import type { TaskPriority, TaskRecurrence } from '../../database/database.service';

export class CreateTaskDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/)
    @MaxLength(120)
    title: string;

    @IsString()
    @ValidateIf((_object, value) => value !== undefined)
    @MaxLength(1000)
    description?: string;

    @IsBoolean()
    @ValidateIf((_object, value) => value !== undefined)
    completed?: boolean;

    @IsDateString({ strict: true })
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @ValidateIf((_object, value) => value !== undefined)
    dueDate?: string;

    @IsIn(['low', 'medium', 'high'])
    @ValidateIf((_object, value) => value !== undefined)
    priority?: TaskPriority;

    @IsString()
    @MaxLength(60)
    @ValidateIf((_object, value) => value !== undefined)
    project?: string;

    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(30, { each: true })
    @ValidateIf((_object, value) => value !== undefined)
    labels?: string[];

    @IsIn(['daily', 'weekly', 'monthly'])
    @ValidateIf((_object, value) => value !== undefined)
    recurrence?: TaskRecurrence;

    @IsInt()
    @IsPositive()
    @ValidateIf((_object, value) => value !== undefined)
    workspaceId?: number;

    @IsInt()
    @IsPositive()
    @ValidateIf((_object, value) => value !== undefined)
    assigneeId?: number;
}