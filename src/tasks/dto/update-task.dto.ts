import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    IsPositive,
    ValidateIf,
} from 'class-validator';
import type { TaskPriority, TaskRecurrence } from '../../database/database.service';

export class UpdateTaskDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/)
    @MaxLength(120)
    @ValidateIf((_object, value) => value !== undefined)
    title?: string;

    @IsString()
    @MaxLength(1000)
    @ValidateIf((_object, value) => value !== undefined)
    description?: string;

    @IsBoolean()
    @ValidateIf((_object, value) => value !== undefined)
    completed?: boolean;

    @IsDateString({ strict: true })
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @IsOptional()
    dueDate?: string | null;

    @IsIn(['low', 'medium', 'high'])
    @ValidateIf((_object, value) => value !== undefined)
    priority?: TaskPriority;

    @IsString()
    @MaxLength(60)
    @IsOptional()
    project?: string | null;

    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(30, { each: true })
    @ValidateIf((_object, value) => value !== undefined)
    labels?: string[];

    @IsIn(['daily', 'weekly', 'monthly'])
    @IsOptional()
    recurrence?: TaskRecurrence | null;

    @IsInt()
    @IsPositive()
    @IsOptional()
    assigneeId?: number | null;
}