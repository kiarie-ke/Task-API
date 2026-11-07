import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    UnauthorizedException,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';

const REFRESH_COOKIE = 'taskflow_refresh';
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    async register(
        @Body() dto: RegisterDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const session = await this.authService.register(dto);
        this.setRefreshCookie(response, session.refreshToken);
        return { accessToken: session.accessToken, user: session.user };
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @UseGuards(ThrottlerGuard)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const session = await this.authService.login(dto);
        this.setRefreshCookie(response, session.refreshToken);
        return { accessToken: session.accessToken, user: session.user };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        const refreshToken = this.getRefreshCookie(request);
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh session cookie is missing');
        }
        const session = await this.authService.refresh(
            refreshToken,
        );
        this.setRefreshCookie(response, session.refreshToken);
        return { accessToken: session.accessToken, user: session.user };
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    async logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<void> {
        await this.authService.logout(this.getRefreshCookie(request));
        response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    }

    @Post('password-reset/request')
    @HttpCode(HttpStatus.OK)
    @UseGuards(ThrottlerGuard)
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    async requestPasswordReset(
        @Body() dto: PasswordResetRequestDto,
    ): Promise<{ message: string }> {
        await this.authService.requestPasswordReset(dto.email);
        return {
            message:
                'If an account exists for this email, a password reset link has been sent.',
        };
    }

    @Post('password-reset/confirm')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(ThrottlerGuard)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async confirmPasswordReset(
        @Body() dto: PasswordResetConfirmDto,
    ): Promise<void> {
        await this.authService.resetPassword(dto);
    }

    private setRefreshCookie(response: Response, token: string): void {
        response.cookie(REFRESH_COOKIE, token, {
            ...this.cookieOptions(),
            maxAge: REFRESH_MAX_AGE,
        });
    }

    private cookieOptions() {
        return {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            path: '/auth',
        };
    }

    private getRefreshCookie(request: Request): string | undefined {
        const cookie = request.headers.cookie
            ?.split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(`${REFRESH_COOKIE}=`));
        const token = cookie?.slice(REFRESH_COOKIE.length + 1);
        return token;
    }
}
