import {
    Body,
    Controller,
    Delete,
    Get,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PushSubscriptionDto, RemovePushSubscriptionDto } from './dto/push-subscription.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { NotificationsService } from './notifications.service';

interface AuthenticatedRequest extends Request {
    user: { id: number };
}

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get('settings')
    settings(@Req() request: AuthenticatedRequest) {
        return this.notificationsService.settings(request.user.id);
    }

    @Patch('settings')
    updateSettings(
        @Req() request: AuthenticatedRequest,
        @Body() dto: UpdateNotificationSettingsDto,
    ) {
        return this.notificationsService.updateSettings(request.user.id, dto);
    }

    @Get()
    recent(@Req() request: AuthenticatedRequest) {
        return this.notificationsService.recent(request.user.id);
    }

    @Post('push-subscriptions')
    savePushSubscription(
        @Req() request: AuthenticatedRequest,
        @Body() dto: PushSubscriptionDto,
    ) {
        return this.notificationsService.savePushSubscription(
            request.user.id,
            dto,
        );
    }

    @Delete('push-subscriptions')
    async removePushSubscription(
        @Req() request: AuthenticatedRequest,
        @Body() dto: RemovePushSubscriptionDto,
    ): Promise<void> {
        await this.notificationsService.removePushSubscription(
            request.user.id,
            dto.endpoint,
        );
    }
}
