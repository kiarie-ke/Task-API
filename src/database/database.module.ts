import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SqliteConnectionOptions } from 'typeorm/driver/sqlite/SqliteConnectionOptions';
import { DatabaseService } from './database.service';
import { getDatabasePath } from './database-paths';
import { CreateTaskSchema1794000000000 } from './migrations/1794000000000-CreateTaskSchema';
import { TaskEntity } from './entities/task.entity';
import { TaskSubtaskEntity } from './entities/task-subtask.entity';
import { UserEntity } from './entities/user.entity';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            useFactory: async (): Promise<SqliteConnectionOptions> => {
                const database = getDatabasePath();
                await mkdir(dirname(database), { recursive: true });

                return {
                    type: 'sqlite',
                    database,
                    entities: [UserEntity, TaskEntity, TaskSubtaskEntity],
                    migrations: [CreateTaskSchema1794000000000],
                    migrationsRun: true,
                    synchronize: false,
                };
            },
        }),
        TypeOrmModule.forFeature([UserEntity, TaskEntity, TaskSubtaskEntity]),
    ],
    providers: [DatabaseService],
    exports: [DatabaseService],
})
export class DatabaseModule {}
