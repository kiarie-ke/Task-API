import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
    imports: [DatabaseModule],
    controllers: [TasksController],
    providers: [TasksService],
})
export class TasksModule {}