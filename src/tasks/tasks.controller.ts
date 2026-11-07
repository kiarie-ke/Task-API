import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

interface AuthenticatedRequest extends Request {
    user: {
        id: number;
    };
}

@Controller('tasks')
@UseGuards(AuthGuard('jwt'))
export class TasksController {
    constructor(private tasksService: TasksService) {}

    @Post()
    create(@Body() dto: CreateTaskDto, @Req() request: AuthenticatedRequest) {
        return this.tasksService.create(dto, request.user.id);
    }
    
    @Get()
    findAll(@Req() request: AuthenticatedRequest) {
        return this.tasksService.findAll(request.user.id);
    }

    @Get(':id')
    findOne(
        @Param('id', ParseIntPipe) id: number,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.tasksService.findOne(id, request.user.id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTaskDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.tasksService.update(id, dto, request.user.id);
    }

    @Delete(':id')
    remove(
        @Param('id', ParseIntPipe) id: number,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.tasksService.remove(id, request.user.id);
    }
}