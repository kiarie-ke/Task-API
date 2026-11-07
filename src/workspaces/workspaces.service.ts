import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Mailer, html } from '@nestjs/mail';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { DatabaseService } from '../database/database.service';
import {
    WorkspaceEntity,
    WorkspaceInvitationEntity,
    WorkspaceMemberEntity,
} from '../database/entities/platform.entity';
import { UserEntity } from '../database/entities/user.entity';
import { InviteWorkspaceMemberDto } from './dto/invite-workspace-member.dto';

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class WorkspacesService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly databaseService: DatabaseService,
        private readonly mailer: Mailer,
    ) {}

    async list(userId: number) {
        const members = await this.dataSource
            .getRepository(WorkspaceMemberEntity)
            .findBy({ userId });
        const workspaces = await Promise.all(
            members.map(async (membership) => {
                const workspace = await this.dataSource
                    .getRepository(WorkspaceEntity)
                    .findOneBy({ id: membership.workspaceId });
                return workspace
                    ? {
                          id: workspace.id,
                          name: workspace.name,
                          ownerId: workspace.ownerId,
                          createdAt: workspace.createdAt,
                          role: membership.role,
                      }
                    : undefined;
            }),
        );
        return workspaces.filter((workspace) => workspace !== undefined);
    }

    async create(name: string, userId: number) {
        return this.dataSource.transaction(async (manager) => {
            const workspace = await manager
                .getRepository(WorkspaceEntity)
                .save({
                    name: name.trim(),
                    ownerId: userId,
                    createdAt: new Date().toISOString(),
                });
            await manager.getRepository(WorkspaceMemberEntity).save({
                workspaceId: workspace.id,
                userId,
                role: 'owner',
            });
            return {
                id: workspace.id,
                name: workspace.name,
                ownerId: workspace.ownerId,
                createdAt: workspace.createdAt,
                role: 'owner' as const,
            };
        });
    }

    async invite(
        workspaceId: number,
        userId: number,
        dto: InviteWorkspaceMemberDto,
    ): Promise<{ message: string }> {
        await this.assertCanManage(workspaceId, userId);
        const email = dto.email.trim().toLowerCase();
        const existingUser =
            await this.databaseService.findUserByEmail(email);
        if (!existingUser) {
            throw new NotFoundException(
                'The invitee must create a Taskflow account before joining',
            );
        }

        const memberRepository = this.dataSource.getRepository(
            WorkspaceMemberEntity,
        );
        if (
            await memberRepository.existsBy({
                workspaceId,
                userId: existingUser.id,
            })
        ) {
            throw new ConflictException('This user is already a workspace member');
        }

        const workspace = await this.dataSource
            .getRepository(WorkspaceEntity)
            .findOneBy({ id: workspaceId });
        if (!workspace) {
            throw new NotFoundException('Workspace not found');
        }

        const token = randomBytes(32).toString('base64url');
        await this.dataSource.getRepository(WorkspaceInvitationEntity).save({
            workspaceId,
            email,
            role: dto.role,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
            acceptedAt: null,
        });
        const invitationUrl = new URL(
            '/accept-invitation',
            process.env.FRONTEND_URL ?? 'http://localhost:3001',
        );
        invitationUrl.searchParams.set('token', token);
        await this.mailer.send({
            to: email,
            subject: `Join ${workspace.name} on Taskflow`,
            html: html`
                <p>You have been invited to join <strong>${workspace.name}</strong>
                on Taskflow as a ${dto.role}.</p>
                <p><a href="${invitationUrl.toString()}">Accept invitation</a></p>
                <p>This invitation expires in 7 days.</p>
            `,
        });
        return { message: 'Invitation sent' };
    }

    async acceptInvitation(token: string, userId: number) {
        const user = await this.databaseService.findUser(userId);
        const tokenHash = hashToken(token);
        return this.dataSource.transaction(async (manager) => {
            const invitations = manager.getRepository(
                WorkspaceInvitationEntity,
            );
            const now = new Date().toISOString();
            const invitation = await invitations.findOneBy({
                tokenHash,
                acceptedAt: IsNull(),
                expiresAt: MoreThan(now),
            });
            if (!invitation || invitation.email !== user?.email.toLowerCase()) {
                throw new NotFoundException(
                    'Invitation is invalid, expired, or for another account',
                );
            }
            const accepted = await invitations.update(
                {
                    id: invitation.id,
                    acceptedAt: IsNull(),
                    expiresAt: MoreThan(now),
                },
                { acceptedAt: now },
            );
            if (accepted.affected !== 1) {
                throw new ConflictException('Invitation has already been used');
            }

            await manager.getRepository(WorkspaceMemberEntity).upsert(
                {
                    workspaceId: invitation.workspaceId,
                    userId,
                    role: invitation.role,
                },
                ['workspaceId', 'userId'],
            );
            const workspace = await manager
                .getRepository(WorkspaceEntity)
                .findOneBy({ id: invitation.workspaceId });
            return workspace
                ? {
                      id: workspace.id,
                      name: workspace.name,
                      ownerId: workspace.ownerId,
                      createdAt: workspace.createdAt,
                      role: invitation.role,
                  }
                : undefined;
        });
    }

    async members(workspaceId: number, userId: number) {
        await this.assertMember(workspaceId, userId);
        const memberships = await this.dataSource
            .getRepository(WorkspaceMemberEntity)
            .findBy({ workspaceId });
        const userIds = [...new Set(memberships.map((member) => member.userId))];
        const users = userIds.length
            ? await this.dataSource
                  .getRepository(UserEntity)
                  .findBy(userIds.map((id) => ({ id })))
            : [];
        const profiles = new Map(users.map((user) => [user.id, user]));
        return memberships.map((member) => ({
            id: member.id,
            userId: member.userId,
            role: member.role,
            username: profiles.get(member.userId)?.username ?? 'Member',
            email: profiles.get(member.userId)?.email ?? '',
        }));
    }

    async changeRole(
        workspaceId: number,
        targetUserId: number,
        role: 'admin' | 'member',
        actorId: number,
    ): Promise<WorkspaceMemberEntity> {
        const actorRole = await this.assertCanManage(workspaceId, actorId);
        if (actorRole !== 'owner') {
            throw new ForbiddenException('Only workspace owners can change roles');
        }
        const memberRepository = this.dataSource.getRepository(
            WorkspaceMemberEntity,
        );
        const membership = await memberRepository.findOneBy({
            workspaceId,
            userId: targetUserId,
        });
        if (!membership || membership.role === 'owner') {
            throw new NotFoundException('Workspace member not found');
        }
        membership.role = role;
        return memberRepository.save(membership);
    }

    async removeMember(
        workspaceId: number,
        targetUserId: number,
        actorId: number,
    ): Promise<void> {
        const actorRole = await this.assertCanManage(workspaceId, actorId);
        const memberRepository = this.dataSource.getRepository(
            WorkspaceMemberEntity,
        );
        const membership = await memberRepository.findOneBy({
            workspaceId,
            userId: targetUserId,
        });
        if (!membership || membership.role === 'owner') {
            throw new NotFoundException('Workspace member not found');
        }
        if (membership.role === 'admin' && actorRole !== 'owner') {
            throw new ForbiddenException(
                'Only workspace owners can remove administrators',
            );
        }
        await memberRepository.remove(membership);
    }

    async assertMember(
        workspaceId: number,
        userId: number,
    ): Promise<WorkspaceMemberEntity> {
        const membership = await this.dataSource
            .getRepository(WorkspaceMemberEntity)
            .findOneBy({ workspaceId, userId });
        if (!membership) {
            throw new NotFoundException('Workspace not found');
        }
        return membership;
    }

    async assertCanManage(
        workspaceId: number,
        userId: number,
    ): Promise<'owner' | 'admin'> {
        const membership = await this.assertMember(workspaceId, userId);
        if (membership.role === 'member') {
            throw new ForbiddenException(
                'Workspace owner or admin role is required',
            );
        }
        return membership.role;
    }

    async canEditTask(
        workspaceId: number,
        userId: number,
        taskOwnerId: number,
        assigneeId: number | undefined,
    ): Promise<void> {
        const membership = await this.assertMember(workspaceId, userId);
        if (
            membership.role === 'member' &&
            taskOwnerId !== userId &&
            assigneeId !== userId
        ) {
            throw new ForbiddenException('You cannot edit this workspace task');
        }
    }
}
