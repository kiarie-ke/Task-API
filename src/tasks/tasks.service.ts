import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService, Task } from '../database/database.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DataSource } from 'typeorm';
import { TaskActivityEntity } from '../database/entities/platform.entity';

@Injectable()
export class TasksService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly workspacesService: WorkspacesService,
        private readonly dataSource: DataSource,
    ) {}

    async create(dto: CreateTaskDto, ownerId: number): Promise<Task> {
        if (dto.recurrence && !dto.dueDate) {
            throw new BadRequestException(
                'A due date is required for recurring tasks',
            );
        }
        if (dto.workspaceId !== undefined) {
            await this.workspacesService.assertMember(
                dto.workspaceId,
                ownerId,
            );
            if (dto.assigneeId !== undefined) {
                await this.workspacesService.assertMember(
                    dto.workspaceId,
                    dto.assigneeId,
                );
            }
        } else if (dto.assigneeId !== undefined) {
            throw new BadRequestException(
                'Task assignment requires a workspace',
            );
        }

        const task = await this.databaseService.create({
            title: dto.title.trim(),
            description: dto.description?.trim(),
            completed: dto.completed ?? false,
            dueDate: dto.dueDate,
            priority: dto.priority ?? 'medium',
            project: dto.project?.trim() || undefined,
            labels: this.normalizeLabels(dto.labels ?? []),
            recurrence: dto.recurrence,
            ownerId,
            workspaceId: dto.workspaceId,
            assigneeId: dto.assigneeId,
        });
        await this.recordActivity(task.id, ownerId, 'task.created');
        return task;
    }

    async findAll(ownerId: number, workspaceId?: number): Promise<Task[]> {
        if (workspaceId !== undefined) {
            await this.workspacesService.assertMember(workspaceId, ownerId);
        }
        return this.databaseService.findAll(ownerId, workspaceId);
    }

    async findOne(id: number, ownerId: number): Promise<Task> {
        const task = await this.databaseService.findOneById(id);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        await this.assertTaskAccess(task, ownerId, false);
        return task;
    }

    async update(
        id: number,
        dto: UpdateTaskDto,
        ownerId: number,
    ): Promise<Task> {
        const existingTask = await this.findOne(id, ownerId);
        await this.assertTaskAccess(existingTask, ownerId, true);
        if (
            dto.assigneeId !== undefined &&
            dto.assigneeId !== null &&
            existingTask.workspaceId !== undefined
        ) {
            await this.workspacesService.assertMember(
                existingTask.workspaceId,
                dto.assigneeId,
            );
        } else if (
            dto.assigneeId !== undefined &&
            dto.assigneeId !== null &&
            existingTask.workspaceId === undefined
        ) {
            throw new BadRequestException(
                'Task assignment requires a workspace',
            );
        }
        const dueDate =
            dto.dueDate === null ? undefined : dto.dueDate ?? existingTask.dueDate;
        const recurrence =
            dto.recurrence === null
                ? undefined
                : dto.recurrence ?? existingTask.recurrence;

        if (recurrence && !dueDate) {
            throw new BadRequestException(
                'A due date is required for recurring tasks',
            );
        }

        const changes: Partial<Task> = {};
        if (dto.title !== undefined) {
            changes.title = dto.title.trim();
        }
        if (dto.description !== undefined) {
            changes.description = dto.description.trim();
        }
        if (dto.completed !== undefined) {
            changes.completed = dto.completed;
        }
        if (dto.dueDate !== undefined) {
            changes.dueDate = dto.dueDate ?? undefined;
        }
        if (dto.priority !== undefined) {
            changes.priority = dto.priority;
        }
        if (dto.project !== undefined) {
            changes.project = dto.project?.trim() || undefined;
        }
        if (dto.recurrence !== undefined) {
            changes.recurrence = dto.recurrence ?? undefined;
        }
        if (dto.labels !== undefined) {
            changes.labels = this.normalizeLabels(dto.labels);
        }
        if (dto.assigneeId !== undefined) {
            changes.assigneeId = dto.assigneeId ?? undefined;
        }
        const task = await this.databaseService.update(id, ownerId, changes);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        await this.recordActivity(
            id,
            ownerId,
            dto.completed === true ? 'task.completed' : 'task.updated',
        );
        return task;
    }

    async createSubtask(
        taskId: number,
        dto: CreateSubtaskDto,
        ownerId: number,
    ): Promise<Task> {
        const existingTask = await this.findOne(taskId, ownerId);
        await this.assertTaskAccess(existingTask, ownerId, true);
        const task = await this.databaseService.createSubtask(
            taskId,
            ownerId,
            dto.title.trim(),
        );
        if (!task) {
            throw new NotFoundException(`Task with id ${taskId} not found`);
        }
        await this.recordActivity(taskId, ownerId, 'subtask.created');
        return task;
    }

    async updateSubtask(
        taskId: number,
        subtaskId: number,
        completed: boolean,
        ownerId: number,
    ): Promise<Task> {
        const existingTask = await this.findOne(taskId, ownerId);
        await this.assertTaskAccess(existingTask, ownerId, true);
        const task = await this.databaseService.updateSubtask(
            taskId,
            ownerId,
            subtaskId,
            completed,
        );
        if (!task) {
            throw new NotFoundException(
                `Subtask with id ${subtaskId} not found`,
            );
        }
        await this.recordActivity(taskId, ownerId, 'subtask.updated');
        return task;
    }

    async removeSubtask(
        taskId: number,
        subtaskId: number,
        ownerId: number,
    ): Promise<Task> {
        const existingTask = await this.findOne(taskId, ownerId);
        await this.assertTaskAccess(existingTask, ownerId, true);
        const task = await this.databaseService.removeSubtask(
            taskId,
            ownerId,
            subtaskId,
        );
        if (!task) {
            throw new NotFoundException(
                `Subtask with id ${subtaskId} not found`,
            );
        }
        await this.recordActivity(taskId, ownerId, 'subtask.removed');
        return task;
    }

    async remove(id: number, ownerId: number): Promise<Task> {
        const existingTask = await this.findOne(id, ownerId);
        await this.assertTaskAccess(existingTask, ownerId, true);
        const task = await this.databaseService.remove(id, ownerId);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        return task;
    }

    private async assertTaskAccess(
        task: Task,
        userId: number,
        write: boolean,
    ): Promise<void> {
        if (task.workspaceId !== undefined) {
            if (write) {
                await this.workspacesService.canEditTask(
                    task.workspaceId,
                    userId,
                    task.ownerId ?? 0,
                    task.assigneeId,
                );
            } else {
                await this.workspacesService.assertMember(
                    task.workspaceId,
                    userId,
                );
            }
            return;
        }
        if (task.ownerId !== userId) {
            throw new NotFoundException(`Task with id ${task.id} not found`);
        }
    }

    private async recordActivity(
        taskId: number,
        actorId: number,
        action: string,
    ): Promise<void> {
        await this.dataSource.getRepository(TaskActivityEntity).save({
            taskId,
            actorId,
            action,
            createdAt: new Date().toISOString(),
        });
    }

    private normalizeLabels(labels: string[]): string[] {
        return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
    }
}