import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsService } from './comments.service';

interface AuthenticatedRequest extends Request {
    user: { id: number };
}

@Controller('tasks/:taskId')
@UseGuards(AuthGuard('jwt'))
export class CommentsController {
    constructor(private readonly commentsService: CommentsService) {}

    @Get('comments')
    listComments(
        @Param('taskId', ParseIntPipe) taskId: number,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.commentsService.listComments(taskId, request.user.id);
    }

    @Post('comments')
    addComment(
        @Param('taskId', ParseIntPipe) taskId: number,
        @Body() dto: CreateCommentDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.commentsService.addComment(
            taskId,
            request.user.id,
            dto.content,
        );
    }

    @Get('activity')
    listActivity(
        @Param('taskId', ParseIntPipe) taskId: number,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.commentsService.listActivity(taskId, request.user.id);
    }
}
