import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
    imports: [TasksModule],
    controllers: [CommentsController],
    providers: [CommentsService],
})
export class CommentsModule {}
