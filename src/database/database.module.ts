import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { DatabaseService } from './database.service';
import { getDatabasePath } from './database-paths';
import { CreateTaskSchema1794000000000 } from './migrations/1794000000000-CreateTaskSchema';
import { TaskEntity } from './entities/task.entity';
import { TaskSubtaskEntity } from './entities/task-subtask.entity';
import { UserEntity } from './entities/user.entity';
import {
    NotificationDeliveryEntity,
    PasswordResetTokenEntity,
    PushSubscriptionEntity,
    RefreshSessionEntity,
    SavedViewEntity,
    TaskActivityEntity,
    TaskCommentEntity,
    WorkspaceEntity,
    WorkspaceInvitationEntity,
    WorkspaceMemberEntity,
} from './entities/platform.entity';
import { AddPlatformFeatures1794000000001 } from './migrations/1794000000001-AddPlatformFeatures';
import { RepairFeatureColumns1794000000002 } from './migrations/1794000000002-RepairFeatureColumns';
import { CreatePostgresTaskSchema1793999999999 } from './migrations/1793999999999-CreatePostgresTaskSchema';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            useFactory: async (): Promise<DataSourceOptions> => {
                const database = getDatabasePath();
                const isPostgres = Boolean(process.env.DATABASE_URL);
                if (isPostgres && process.env.TASK_DATABASE_PATH) {
                    throw new Error(
                        'Set only DATABASE_URL or TASK_DATABASE_PATH, not both',
                    );
                }
                if (isPostgres && process.env.TASK_LEGACY_DATABASE_PATH) {
                    throw new Error(
                        'Legacy JSON import is supported only for SQLite databases',
                    );
                }
                if (!isPostgres) {
                    await mkdir(dirname(database), { recursive: true });
                }

                return {
                    ...(isPostgres
                        ? {
                              type: 'postgres' as const,
                              url: process.env.DATABASE_URL,
                          }
                        : {
                              type: 'sqlite' as const,
                              database,
                          }),
                    entities: [
                        UserEntity,
                        TaskEntity,
                        TaskSubtaskEntity,
                        RefreshSessionEntity,
                        PasswordResetTokenEntity,
                        WorkspaceEntity,
                        WorkspaceMemberEntity,
                        WorkspaceInvitationEntity,
                        TaskCommentEntity,
                        TaskActivityEntity,
                        SavedViewEntity,
                        PushSubscriptionEntity,
                        NotificationDeliveryEntity,
                    ],
                    migrations: [
                        ...(isPostgres
                            ? [CreatePostgresTaskSchema1793999999999]
                            : [CreateTaskSchema1794000000000]),
                        AddPlatformFeatures1794000000001,
                        RepairFeatureColumns1794000000002,
                    ],
                    migrationsRun: true,
                    synchronize: false,
                };
            },
        }),
        TypeOrmModule.forFeature([
            UserEntity,
            TaskEntity,
            TaskSubtaskEntity,
            RefreshSessionEntity,
            PasswordResetTokenEntity,
            WorkspaceEntity,
            WorkspaceMemberEntity,
            WorkspaceInvitationEntity,
            TaskCommentEntity,
            TaskActivityEntity,
            SavedViewEntity,
            PushSubscriptionEntity,
            NotificationDeliveryEntity,
        ]),
    ],
    providers: [DatabaseService],
    exports: [DatabaseService],
})
export class DatabaseModule {}
