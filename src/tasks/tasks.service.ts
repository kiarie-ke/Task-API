import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, Task } from '../database/database.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
    constructor(private readonly databaseService: DatabaseService) {}

    create(dto: CreateTaskDto, ownerId: number): Promise<Task> {
        return this.databaseService.create({
            title: dto.title,
            description: dto.description,
            completed: dto.completed ?? false,
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
        const task = await this.databaseService.update(id, ownerId, dto);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
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
}