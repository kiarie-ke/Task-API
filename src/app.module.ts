import { Module } from '@nestjs/common';
import {
    FileMailTransport,
    InMemoryMailTransport,
    MailModule,
    SmtpTransport,
} from '@nestjs/mail';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { CommentsModule } from './comments/comments.module';
import { SavedViewsModule } from './saved-views/saved-views.module';

function mailTransport() {
    if (process.env.SMTP_URL) {
        return new SmtpTransport({ url: process.env.SMTP_URL });
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('SMTP_URL must be configured in production');
    }

    if (process.env.NODE_ENV === 'test') {
        return new InMemoryMailTransport();
    }

    return new FileMailTransport({
        directory: join(process.cwd(), 'data', 'mail'),
    });
}

@Module({
    imports: [
        MailModule.forRoot({
            transport: mailTransport(),
            from: process.env.MAIL_FROM ?? 'Taskflow <no-reply@taskflow.local>',
        }),
        ScheduleModule.forRoot(),
        ThrottlerModule.forRoot([
            { name: 'default', limit: 10, ttl: 60_000 },
        ]),
        AuthModule,
        TasksModule,
        NotificationsModule,
        WorkspacesModule,
        CommentsModule,
        SavedViewsModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
