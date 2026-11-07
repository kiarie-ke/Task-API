import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { SavedViewsService } from './saved-views.service';

interface AuthenticatedRequest extends Request {
    user: { id: number };
}

@Controller('saved-views')
@UseGuards(AuthGuard('jwt'))
export class SavedViewsController {
    constructor(private readonly savedViewsService: SavedViewsService) {}

    @Get()
    list(@Req() request: AuthenticatedRequest) {
        return this.savedViewsService.list(request.user.id);
    }

    @Post()
    create(
        @Body() dto: CreateSavedViewDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.savedViewsService.create(
            request.user.id,
            dto.name,
            dto.filters,
        );
    }

    @Delete(':id')
    remove(
        @Param('id', ParseIntPipe) id: number,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.savedViewsService.remove(id, request.user.id);
    }
}
