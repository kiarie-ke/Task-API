import {
    Body,
    Controller,
    Delete,
    BadRequestException,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Req,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

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

    @Post(':id/subtasks')
    createSubtask(
        @Param('id', ParseIntPipe) taskId: number,
        @Body() dto: CreateSubtaskDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.tasksService.createSubtask(taskId, dto, request.user.id);
    }

    @Patch(':id/subtasks/:subtaskId')
    updateSubtask(
        @Param('id', ParseIntPipe) taskId: number,
        @Param('subtaskId', ParseIntPipe) subtaskId: number,
        @Body() dto: UpdateSubtaskDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.tasksService.updateSubtask(
            taskId,
            subtaskId,
            dto.completed,
            request.user.id,
        );
    }

    @Delete(':id/subtasks/:subtaskId')
    removeSubtask(
        @Param('id', ParseIntPipe) taskId: number,
        @Param('subtaskId', ParseIntPipe) subtaskId: number,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.tasksService.removeSubtask(
            taskId,
            subtaskId,
            request.user.id,
        );
    }

    @Get()
    findAll(
        @Req() request: AuthenticatedRequest,
        @Query('workspaceId') workspaceId?: string,
    ) {
        if (workspaceId === undefined) {
            return this.tasksService.findAll(request.user.id);
        }
        const parsedWorkspaceId = Number(workspaceId);
        if (!Number.isSafeInteger(parsedWorkspaceId) || parsedWorkspaceId < 1) {
            throw new BadRequestException('workspaceId must be a positive integer');
        }
        return this.tasksService.findAll(
            request.user.id,
            parsedWorkspaceId,
        );
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