import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/)
    @MaxLength(80)
    name: string;
}
