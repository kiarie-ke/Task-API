import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService, Task } from '../database/database.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';

@Injectable()
export class TasksService {
    constructor(private readonly databaseService: DatabaseService) {}

    create(dto: CreateTaskDto, ownerId: number): Promise<Task> {
        if (dto.recurrence && !dto.dueDate) {
            throw new BadRequestException(
                'A due date is required for recurring tasks',
            );
        }

        return this.databaseService.create({
            title: dto.title.trim(),
            description: dto.description?.trim(),
            completed: dto.completed ?? false,
            dueDate: dto.dueDate,
            priority: dto.priority ?? 'medium',
            project: dto.project?.trim() || undefined,
            labels: this.normalizeLabels(dto.labels ?? []),
            recurrence: dto.recurrence,
            ownerId,
        });
    }

    findAll(ownerId: number): Promise<Task[]> {
        return this.databaseService.findAll(ownerId);
    }

    async findOne(id: number, ownerId: number): Promise<Task> {
        const task = await this.databaseService.findOne(id, ownerId);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        return task;
    }

    async update(
        id: number,
        dto: UpdateTaskDto,
        ownerId: number,
    ): Promise<Task> {
        const existingTask = await this.findOne(id, ownerId);
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
        const task = await this.databaseService.update(id, ownerId, changes);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        return task;
    }

    async createSubtask(
        taskId: number,
        dto: CreateSubtaskDto,
        ownerId: number,
    ): Promise<Task> {
        const task = await this.databaseService.createSubtask(
            taskId,
            ownerId,
            dto.title.trim(),
        );
        if (!task) {
            throw new NotFoundException(`Task with id ${taskId} not found`);
        }
        return task;
    }

    async updateSubtask(
        taskId: number,
        subtaskId: number,
        completed: boolean,
        ownerId: number,
    ): Promise<Task> {
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
        return task;
    }

    async removeSubtask(
        taskId: number,
        subtaskId: number,
        ownerId: number,
    ): Promise<Task> {
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
        return task;
    }

    async remove(id: number, ownerId: number): Promise<Task> {
        const task = await this.databaseService.remove(id, ownerId);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        return task;
    }

    private normalizeLabels(labels: string[]): string[] {
        return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
    }
}