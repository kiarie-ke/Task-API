import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AcceptWorkspaceInvitationDto } from './dto/accept-workspace-invitation.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteWorkspaceMemberDto } from './dto/invite-workspace-member.dto';
import { WorkspacesService } from './workspaces.service';
import { UpdateWorkspaceMemberRoleDto } from './dto/update-workspace-member-role.dto';

interface AuthenticatedRequest extends Request {
    user: { id: number };
}

@Controller('workspaces')
@UseGuards(AuthGuard('jwt'))
export class WorkspacesController {
    constructor(private readonly workspacesService: WorkspacesService) {}

    @Get()
    list(@Req() request: AuthenticatedRequest) {
        return this.workspacesService.list(request.user.id);
    }

    @Post()
    create(
        @Body() dto: CreateWorkspaceDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.workspacesService.create(dto.name, request.user.id);
    }

    @Get(':id/members')
    members(
        @Param('id', ParseIntPipe) workspaceId: number,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.workspacesService.members(workspaceId, request.user.id);
    }

    @Post(':id/invitations')
    invite(
        @Param('id', ParseIntPipe) workspaceId: number,
        @Body() dto: InviteWorkspaceMemberDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.workspacesService.invite(
            workspaceId,
            request.user.id,
            dto,
        );
    }

    @Post('accept-invitation')
    acceptInvitation(
        @Body() dto: AcceptWorkspaceInvitationDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.workspacesService.acceptInvitation(
            dto.token,
            request.user.id,
        );
    }

    @Patch(':id/members/:userId')
    changeRole(
        @Param('id', ParseIntPipe) workspaceId: number,
        @Param('userId', ParseIntPipe) targetUserId: number,
        @Body() dto: UpdateWorkspaceMemberRoleDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.workspacesService.changeRole(
            workspaceId,
            targetUserId,
            dto.role,
            request.user.id,
        );
    }

    @Delete(':id/members/:userId')
    async removeMember(
        @Param('id', ParseIntPipe) workspaceId: number,
        @Param('userId', ParseIntPipe) targetUserId: number,
        @Req() request: AuthenticatedRequest,
    ): Promise<void> {
        await this.workspacesService.removeMember(
            workspaceId,
            targetUserId,
            request.user.id,
        );
    }
}
