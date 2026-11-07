import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TasksService } from './tasks.service';
@Controller('tasks')
export class TasksController {
    constructor(private tasksService: TasksService) {}

    @Post()
    create(@Body() dto: any) {
        return this.tasksService.create(dto);
    }
}