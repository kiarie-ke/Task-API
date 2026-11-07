import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSubtaskDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/)
    @MaxLength(120)
    title: string;
}
