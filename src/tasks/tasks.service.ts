import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

export interface Task {
    id: number;
    title: string;
    description?: string;
    completed?: boolean;
}
@Injectable()
export class TasksService {
    private tasks: Task[] = [];
    private nextTaskId = 1;

    create(dto: CreateTaskDto) {
        const task: Task = Object.assign({ id: this.nextTaskId++ }, dto);
        this.tasks.push(task);
        return task;
    }
    findAll() {
        return this.tasks;
    }
    findOne(id: number) {
        const task = this.tasks.find((task) => task.id === id);
        if (!task) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        return task;
    }
    update(id: number, dto: UpdateTaskDto) {
        const task = this.findOne(id);
        Object.assign(task, dto);
        return task;
    }
    remove(id: number) {
        const index = this.tasks.findIndex((task) => task.id === id);
        if (index === -1) {
            throw new NotFoundException(`Task with id ${id} not found`);
        }
        const [removedTask] = this.tasks.splice(index, 1);
        return removedTask;
    }
}