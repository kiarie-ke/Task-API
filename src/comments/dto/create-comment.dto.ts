import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCommentDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/)
    @MaxLength(2000)
    content: string;
}
