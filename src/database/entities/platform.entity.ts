import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('refresh_sessions')
@Index('IDX_refresh_sessions_token_hash', ['tokenHash'], { unique: true })
export class RefreshSessionEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'user_id' })
    userId: number;

    @Column({ type: 'text', name: 'token_hash' })
    tokenHash: string;

    @Column({ type: 'text', name: 'expires_at' })
    expiresAt: string;

    @Column({ type: 'text', name: 'revoked_at', nullable: true })
    revokedAt: string | null;
}

@Entity('password_reset_tokens')
@Index('IDX_password_reset_tokens_token_hash', ['tokenHash'], { unique: true })
export class PasswordResetTokenEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'user_id' })
    userId: number;

    @Column({ type: 'text', name: 'token_hash' })
    tokenHash: string;

    @Column({ type: 'text', name: 'expires_at' })
    expiresAt: string;

    @Column({ type: 'text', name: 'used_at', nullable: true })
    usedAt: string | null;
}

@Entity('workspaces')
export class WorkspaceEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'text' })
    name: string;

    @Column({ type: 'integer', name: 'owner_id' })
    ownerId: number;

    @Column({ type: 'text', name: 'created_at' })
    createdAt: string;
}

@Entity('workspace_members')
@Index('IDX_workspace_members_workspace_user', ['workspaceId', 'userId'], {
    unique: true,
})
export class WorkspaceMemberEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'workspace_id' })
    workspaceId: number;

    @Column({ type: 'integer', name: 'user_id' })
    userId: number;

    @Column({ type: 'text', default: 'member' })
    role: 'owner' | 'admin' | 'member';
}

@Entity('workspace_invitations')
@Index('IDX_workspace_invitations_token_hash', ['tokenHash'], { unique: true })
export class WorkspaceInvitationEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'workspace_id' })
    workspaceId: number;

    @Column({ type: 'text' })
    email: string;

    @Column({ type: 'text', default: 'member' })
    role: 'admin' | 'member';

    @Column({ type: 'text', name: 'token_hash' })
    tokenHash: string;

    @Column({ type: 'text', name: 'expires_at' })
    expiresAt: string;

    @Column({ type: 'text', name: 'accepted_at', nullable: true })
    acceptedAt: string | null;
}

@Entity('task_comments')
export class TaskCommentEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'task_id' })
    taskId: number;

    @Column({ type: 'integer', name: 'user_id' })
    userId: number;

    @Column({ type: 'text' })
    content: string;

    @Column({ type: 'text', name: 'created_at' })
    createdAt: string;
}

@Entity('task_activity')
export class TaskActivityEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'task_id' })
    taskId: number;

    @Column({ type: 'integer', name: 'actor_id' })
    actorId: number;

    @Column({ type: 'text' })
    action: string;

    @Column({ type: 'text', name: 'created_at' })
    createdAt: string;
}

@Entity('saved_views')
@Index('IDX_saved_views_user_id', ['userId'])
export class SavedViewEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'user_id' })
    userId: number;

    @Column({ type: 'text' })
    name: string;

    @Column({ type: 'simple-json' })
    filters: {
        filter?: string;
        dueFilter?: string;
        priorityFilter?: string;
        projectFilter?: string;
        labelFilter?: string;
        sort?: string;
        search?: string;
    };

    @Column({ type: 'text', name: 'created_at' })
    createdAt: string;
}

@Entity('push_subscriptions')
@Index('IDX_push_subscriptions_endpoint', ['endpoint'], { unique: true })
export class PushSubscriptionEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'user_id' })
    userId: number;

    @Column({ type: 'text' })
    endpoint: string;

    @Column({ type: 'simple-json' })
    keys: { p256dh: string; auth: string };
}

@Entity('notification_deliveries')
@Index(
    'IDX_notification_deliveries_unique',
    ['userId', 'taskId', 'dueDate', 'channel'],
    { unique: true },
)
export class NotificationDeliveryEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'integer', name: 'user_id' })
    userId: number;

    @Column({ type: 'integer', name: 'task_id' })
    taskId: number;

    @Column({ type: 'text', name: 'due_date' })
    dueDate: string;

    @Column({ type: 'text' })
    channel: 'email' | 'push';

    @Column({ type: 'text', default: 'processing' })
    status: 'processing' | 'sent' | 'failed';

    @Column({ type: 'text', name: 'claimed_at', nullable: true })
    claimedAt: string | null;

    @Column({ type: 'text', name: 'sent_at', nullable: true })
    sentAt: string | null;

    @Column({ type: 'text', name: 'last_error', nullable: true })
    lastError: string | null;
}
