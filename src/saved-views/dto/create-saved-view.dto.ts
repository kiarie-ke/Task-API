import {
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SavedViewFiltersDto {
    @IsIn(['all', 'active', 'completed'])
    @IsOptional()
    filter?: string;

    @IsIn(['any', 'today', 'overdue'])
    @IsOptional()
    dueFilter?: string;

    @IsIn(['any', 'low', 'medium', 'high'])
    @IsOptional()
    priorityFilter?: string;

    @IsString()
    @MaxLength(60)
    @IsOptional()
    projectFilter?: string;

    @IsString()
    @MaxLength(30)
    @IsOptional()
    labelFilter?: string;

    @IsIn(['newest', 'due-date', 'priority', 'title'])
    @IsOptional()
    sort?: string;

    @IsString()
    @MaxLength(120)
    @IsOptional()
    search?: string;
}

export class CreateSavedViewDto {
    @IsString()
    @Matches(/\S/)
    @MaxLength(40)
    name: string;

    @IsObject()
    @ValidateNested()
    @Type(() => SavedViewFiltersDto)
    filters: SavedViewFiltersDto;
}
