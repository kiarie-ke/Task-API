import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TasksService } from './tasks.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TasksController } from './tasks.controller';

@Module({
    imports: [DatabaseModule, WorkspacesModule],
    controllers: [TasksController],
    providers: [TasksService],
    exports: [TasksService],
})
export class TasksModule {}