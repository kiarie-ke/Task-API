import {
    IsObject,
    IsString,
    IsUrl,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
    @IsString()
    @MaxLength(512)
    p256dh: string;

    @IsString()
    @MaxLength(256)
    auth: string;
}

export class PushSubscriptionDto {
    @IsUrl({ protocols: ['https'], require_protocol: true })
    @MaxLength(2048)
    endpoint: string;

    @IsObject()
    @ValidateNested()
    @Type(() => PushSubscriptionKeysDto)
    keys: PushSubscriptionKeysDto;
}

export class RemovePushSubscriptionDto {
    @IsUrl({ protocols: ['https'], require_protocol: true })
    @MaxLength(2048)
    endpoint: string;
}
