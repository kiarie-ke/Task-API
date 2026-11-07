import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskActivityEntity, TaskCommentEntity } from '../database/entities/platform.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class CommentsService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly tasksService: TasksService,
    ) {}

    async listComments(taskId: number, userId: number) {
        await this.tasksService.findOne(taskId, userId);
        const comments = await this.dataSource
            .getRepository(TaskCommentEntity)
            .find({ where: { taskId }, order: { id: 'ASC' } });
        const users = comments.length
            ? await this.dataSource
                  .getRepository(UserEntity)
                  .findBy(
                      [...new Set(comments.map((comment) => comment.userId))].map(
                          (id) => ({ id }),
                      ),
                  )
            : [];
        const names = new Map(users.map((user) => [user.id, user.username]));
        return comments.map((comment) => ({
            id: comment.id,
            taskId: comment.taskId,
            userId: comment.userId,
            content: comment.content,
            createdAt: comment.createdAt,
            username: names.get(comment.userId) ?? 'Former member',
        }));
    }

    async addComment(taskId: number, userId: number, content: string) {
        await this.tasksService.findOne(taskId, userId);
        const now = new Date().toISOString();
        const comment = await this.dataSource
            .getRepository(TaskCommentEntity)
            .save({
                taskId,
                userId,
                content: content.trim(),
                createdAt: now,
            });
        await this.dataSource.getRepository(TaskActivityEntity).save({
            taskId,
            actorId: userId,
            action: 'comment.created',
            createdAt: now,
        });
        const user = await this.dataSource
            .getRepository(UserEntity)
            .findOneBy({ id: userId });
        return {
            id: comment.id,
            taskId: comment.taskId,
            userId: comment.userId,
            content: comment.content,
            createdAt: comment.createdAt,
            username: user?.username ?? 'Former member',
        };
    }

    async listActivity(taskId: number, userId: number) {
        const task = await this.tasksService.findOne(taskId, userId);
        if (!task) {
            throw new NotFoundException(`Task with id ${taskId} not found`);
        }
        const activity = await this.dataSource
            .getRepository(TaskActivityEntity)
            .find({ where: { taskId }, order: { id: 'DESC' }, take: 100 });
        const users = activity.length
            ? await this.dataSource
                  .getRepository(UserEntity)
                  .findBy(
                      [...new Set(activity.map((item) => item.actorId))].map(
                          (id) => ({ id }),
                      ),
                  )
            : [];
        const names = new Map(users.map((user) => [user.id, user.username]));
        return activity.map((item) => ({
            id: item.id,
            taskId: item.taskId,
            actorId: item.actorId,
            action: item.action,
            createdAt: item.createdAt,
            username: names.get(item.actorId) ?? 'Former member',
        }));
    }
}
