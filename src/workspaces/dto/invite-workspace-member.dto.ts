import { IsEmail, IsIn, MaxLength } from 'class-validator';

export class InviteWorkspaceMemberDto {
    @IsEmail()
    @MaxLength(254)
    email: string;

    @IsIn(['admin', 'member'])
    role: 'admin' | 'member';
}
