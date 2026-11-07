import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsIn,
    Matches,
} from 'class-validator';

export class UpdateNotificationSettingsDto {
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    reminderTime: string;

    @IsArray()
    @ArrayMaxSize(2)
    @ArrayUnique()
    @IsIn(['email', 'push'], { each: true })
    channels: Array<'email' | 'push'>;

    @Matches(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/)
    timezone: string;
}
