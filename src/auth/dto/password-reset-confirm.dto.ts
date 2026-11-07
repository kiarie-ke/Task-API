import { IsString, MaxLength, MinLength } from 'class-validator';

export class PasswordResetConfirmDto {
    @IsString()
    @MinLength(32)
    @MaxLength(256)
    token: string;

    @IsString()
    @MinLength(10)
    @MaxLength(128)
    password: string;
}
