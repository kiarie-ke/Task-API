import { IsIn } from 'class-validator';

export class UpdateWorkspaceMemberRoleDto {
    @IsIn(['admin', 'member'])
    role: 'admin' | 'member';
}
