import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptWorkspaceInvitationDto {
    @IsString()
    @MinLength(32)
    @MaxLength(256)
    token: string;
}
