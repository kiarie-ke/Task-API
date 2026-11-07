import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Mailer, html } from '@nestjs/mail';
import * as webpush from 'web-push';
import {
    DataSource,
    IsNull,
    LessThan,
    Not,
    QueryFailedError,
} from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { TaskEntity } from '../database/entities/task.entity';
import {
    NotificationDeliveryEntity,
    PushSubscriptionEntity,
} from '../database/entities/platform.entity';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { PushSubscriptionDto } from './dto/push-subscription.dto';

const SUPPORTED_PUSH_HOSTS = [
    'fcm.googleapis.com',
    'android.googleapis.com',
    'push.services.mozilla.com',
    'push.apple.com',
    'notify.windows.com',
];

function isSupportedPushEndpoint(endpoint: string): boolean {
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        return false;
    }

    return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        (url.port === '' || url.port === '443') &&
        SUPPORTED_PUSH_HOSTS.some(
            (host) =>
                url.hostname === host || url.hostname.endsWith(`.${host}`),
        )
    );
}

function isDuplicateKeyError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
        return false;
    }
    const driverError: unknown = error.driverError;
    return (
        typeof driverError === 'object' &&
        driverError !== null &&
        'code' in driverError &&
        (driverError.code === '23505'
            ? 'constraint' in driverError &&
              driverError.constraint === 'IDX_notification_deliveries_unique'
            : driverError.code === 'SQLITE_CONSTRAINT' &&
              'message' in driverError &&
              typeof driverError.message === 'string' &&
              driverError.message.includes(
                  'UNIQUE constraint failed: notification_deliveries.',
              ))
    );
}

function getLocalDateTime(now: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
    );
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        time: `${values.hour}:${values.minute}`,
    };
}

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private readonly vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    private readonly vapidEnabled = Boolean(
        this.vapidPublicKey && process.env.VAPID_PRIVATE_KEY,
    );

    constructor(
        private readonly dataSource: DataSource,
        private readonly mailer: Mailer,
    ) {
        if (Boolean(this.vapidPublicKey) !== Boolean(process.env.VAPID_PRIVATE_KEY)) {
            throw new Error(
                'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured together',
            );
        }
        if (this.vapidEnabled) {
            webpush.setVapidDetails(
                process.env.VAPID_SUBJECT ?? 'mailto:admin@taskflow.local',
                this.vapidPublicKey!,
                process.env.VAPID_PRIVATE_KEY!,
            );
        }
    }

    async settings(userId: number) {
        const user = await this.userRepository().findOneBy({ id: userId });
        if (!user) {
            throw new NotFoundException('User settings are unavailable');
        }
        return {
            timezone: user.timezone,
            reminderTime: user.reminderTime,
            channels: user.reminderChannels,
            pushEnabled: this.vapidEnabled,
            publicKey: this.vapidPublicKey ?? null,
        };
    }

    async updateSettings(
        userId: number,
        dto: UpdateNotificationSettingsDto,
    ) {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone });
        } catch {
            throw new BadRequestException(
                'timezone must be a valid IANA time zone',
            );
        }
        if (dto.channels.includes('push') && !this.vapidEnabled) {
            throw new ServiceUnavailableException(
                'Web push is not configured on this server',
            );
        }
        await this.userRepository().update(
            { id: userId },
            {
                timezone: dto.timezone,
                reminderTime: dto.reminderTime,
                reminderChannels: dto.channels,
            },
        );
        return this.settings(userId);
    }

    async savePushSubscription(userId: number, dto: PushSubscriptionDto) {
        if (!isSupportedPushEndpoint(dto.endpoint)) {
            throw new BadRequestException(
                'endpoint must belong to a supported browser push provider',
            );
        }
        if (!this.vapidEnabled) {
            throw new ServiceUnavailableException(
                'Web push is not configured on this server',
            );
        }
        await this.dataSource
            .getRepository(PushSubscriptionEntity)
            .upsert(
                {
                    userId,
                    endpoint: dto.endpoint,
                    keys: dto.keys,
                },
                ['endpoint'],
            );
        return { subscribed: true };
    }

    async removePushSubscription(
        userId: number,
        endpoint: string,
    ): Promise<void> {
        await this.dataSource.getRepository(PushSubscriptionEntity).delete({
            userId,
            endpoint,
        });
    }

    async recent(userId: number) {
        const deliveries = await this.dataSource
            .getRepository(NotificationDeliveryEntity)
            .find({
                where: { userId, status: 'sent' },
                order: { id: 'DESC' },
                take: 30,
            });
        const taskIds = [...new Set(deliveries.map((item) => item.taskId))];
        const tasks = taskIds.length
            ? await this.dataSource
                  .getRepository(TaskEntity)
                  .findBy(taskIds.map((id) => ({ id })))
            : [];
        const titles = new Map(tasks.map((task) => [task.id, task.title]));
        return deliveries.map((item) => ({
            id: item.id,
            taskId: item.taskId,
            dueDate: item.dueDate,
            channel: item.channel,
            sentAt: item.sentAt,
            taskTitle: titles.get(item.taskId) ?? 'Task reminder',
        }));
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async dispatchDueReminders(): Promise<void> {
        const users = await this.userRepository().find();
        const tasks = await this.dataSource.getRepository(TaskEntity).find({
            where: { completed: false, dueDate: Not(IsNull()) },
            order: { id: 'ASC' },
        });
        const usersById = new Map(users.map((user) => [user.id, user]));

        for (const task of tasks) {
            const recipientId = task.assigneeId ?? task.ownerId;
            if (recipientId === null) {
                continue;
            }
            const user = usersById.get(recipientId);
            if (!user || user.reminderChannels.length === 0 || !task.dueDate) {
                continue;
            }
            const local = getLocalDateTime(new Date(), user.timezone);
            if (local.date !== task.dueDate || local.time < user.reminderTime) {
                continue;
            }

            for (const channel of user.reminderChannels) {
                if (channel === 'email' || channel === 'push') {
                    await this.deliver(task, user, channel);
                }
            }
        }
    }

    private async deliver(
        task: TaskEntity,
        user: UserEntity,
        channel: 'email' | 'push',
    ): Promise<void> {
        const repository = this.dataSource.getRepository(
            NotificationDeliveryEntity,
        );
        const key = {
            userId: user.id,
            taskId: task.id,
            dueDate: task.dueDate!,
            channel,
        };
        let delivery = await repository.findOneBy(key);
        const now = new Date();
        if (delivery?.status === 'sent') {
            return;
        }
        if (
            delivery?.status === 'processing' &&
            delivery.claimedAt &&
            now.getTime() - new Date(delivery.claimedAt).getTime() < 5 * 60_000
        ) {
            return;
        }
        if (
            delivery?.status === 'failed' &&
            delivery.claimedAt &&
            now.getTime() - new Date(delivery.claimedAt).getTime() < 5 * 60_000
        ) {
            return;
        }
        if (!delivery) {
            try {
                delivery = await repository.save({
                    ...key,
                    status: 'processing',
                    claimedAt: now.toISOString(),
                    sentAt: null,
                    lastError: null,
                });
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    return;
                }
                throw error;
            }
        } else {
            const claimed = await repository.update(
                {
                    id: delivery.id,
                    status: delivery.status,
                    claimedAt: delivery.claimedAt
                        ? LessThan(
                              new Date(
                                  now.getTime() - 5 * 60_000,
                              ).toISOString(),
                          )
                        : IsNull(),
                },
                {
                    status: 'processing',
                    claimedAt: now.toISOString(),
                    lastError: null,
                },
            );
            if (claimed.affected !== 1) {
                return;
            }
        }

        try {
            if (channel === 'email') {
                await this.mailer.send({
                    to: user.email,
                    subject: `Taskflow reminder: ${task.title}`,
                    html: html`
                        <p>This task is due today:</p>
                        <p><strong>${task.title}</strong></p>
                        ${task.description
                            ? html`<p>${task.description}</p>`
                            : ''}
                    `,
                });
            } else {
                await this.sendPush(user.id, task);
            }
            await repository.update(
                { id: delivery.id },
                {
                    status: 'sent',
                    sentAt: new Date().toISOString(),
                    claimedAt: null,
                    lastError: null,
                },
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown delivery error';
            await repository.update(
                { id: delivery.id },
                {
                    status: 'failed',
                    claimedAt: new Date().toISOString(),
                    lastError: message.slice(0, 500),
                },
            );
            this.logger.error(
                `Reminder ${channel} delivery failed for task ${task.id}: ${message}`,
            );
        }
    }

    private async sendPush(userId: number, task: TaskEntity): Promise<void> {
        const subscriptions = await this.dataSource
            .getRepository(PushSubscriptionEntity)
            .findBy({ userId });
        if (subscriptions.length === 0) {
            throw new Error('No push subscriptions are registered for this user');
        }
        const repository = this.dataSource.getRepository(PushSubscriptionEntity);
        let sentCount = 0;
        for (const subscription of subscriptions) {
            if (!isSupportedPushEndpoint(subscription.endpoint)) {
                this.logger.warn(
                    'Removing an unsupported browser push endpoint',
                );
                await repository.remove(subscription);
                continue;
            }
            try {
                await webpush.sendNotification(
                    {
                        endpoint: subscription.endpoint,
                        keys: subscription.keys,
                    },
                    JSON.stringify({
                        title: 'Taskflow reminder',
                        body: `${task.title} is due today`,
                        url: `/?task=${task.id}`,
                    }),
                );
                sentCount += 1;
            } catch (error) {
                const statusCode =
                    typeof error === 'object' &&
                    error !== null &&
                    'statusCode' in error
                        ? error.statusCode
                        : undefined;
                if (statusCode === 404 || statusCode === 410) {
                    await repository.remove(subscription);
                    continue;
                }
                throw error;
            }
        }
        if (sentCount === 0) {
            throw new Error('No active browser push subscriptions accepted the reminder');
        }
    }

    private userRepository() {
        return this.dataSource.getRepository(UserEntity);
    }
}
