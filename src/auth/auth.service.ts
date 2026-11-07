import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Mailer, html } from '@nestjs/mail';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import {
    PasswordResetTokenEntity,
    RefreshSessionEntity,
} from '../database/entities/platform.entity';
import { UserEntity } from '../database/entities/user.entity';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';

const REFRESH_SESSION_DAYS = 30;
const PASSWORD_RESET_MINUTES = 30;

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export interface AuthSessionResponse {
    accessToken: string;
    refreshToken: string;
    user: {
        id: number;
        username: string;
        email: string;
        tokenVersion?: number;
    };
}

@Injectable()
export class AuthService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly jwtService: JwtService,
        private readonly dataSource: DataSource,
        private readonly mailer: Mailer,
    ) {}

    async register(dto: RegisterDto): Promise<AuthSessionResponse> {
        const password = await bcrypt.hash(dto.password, 10);
        const user = await this.databaseService.createUser({
            username: dto.username.trim(),
            email: dto.email.trim().toLowerCase(),
            password,
        });

        if (!user) {
            throw new ConflictException('An account with this email already exists');
        }

        return this.createAuthResponse(user);
    }

    async login(dto: LoginDto): Promise<AuthSessionResponse> {
        const user = await this.databaseService.findUserByEmail(
            dto.email.trim().toLowerCase(),
        );
        if (!user || !(await bcrypt.compare(dto.password, user.password))) {
            throw new UnauthorizedException('Invalid email or password');
        }

        return this.createAuthResponse(user);
    }

    async refresh(refreshToken: string): Promise<AuthSessionResponse> {
        const now = new Date();
        const sessions = this.dataSource.getRepository(RefreshSessionEntity);
        const result = await sessions.update(
            {
                tokenHash: hashToken(refreshToken),
                revokedAt: IsNull(),
                expiresAt: MoreThan(now.toISOString()),
            },
            { revokedAt: now.toISOString() },
        );
        if (result.affected !== 1) {
            throw new UnauthorizedException('Session expired. Please sign in again.');
        }

        const session = await sessions.findOneBy({
            tokenHash: hashToken(refreshToken),
        });
        const user = session
            ? await this.databaseService.findUser(session.userId)
            : undefined;
        if (!user) {
            throw new UnauthorizedException('Session expired. Please sign in again.');
        }
        return this.createAuthResponse(user);
    }

    async logout(refreshToken?: string): Promise<void> {
        if (!refreshToken) {
            return;
        }
        await this.dataSource.getRepository(RefreshSessionEntity).update(
            { tokenHash: hashToken(refreshToken), revokedAt: IsNull() },
            { revokedAt: new Date().toISOString() },
        );
    }

    async requestPasswordReset(email: string): Promise<void> {
        const user = await this.databaseService.findUserByEmail(
            email.trim().toLowerCase(),
        );
        if (!user) {
            return;
        }

        const token = randomBytes(32).toString('base64url');
        const now = new Date();
        const repository = this.dataSource.getRepository(
            PasswordResetTokenEntity,
        );
        await repository.update(
            { userId: user.id, usedAt: IsNull() },
            { usedAt: now.toISOString() },
        );
        await repository.save(
            repository.create({
                userId: user.id,
                tokenHash: hashToken(token),
                expiresAt: new Date(
                    now.getTime() + PASSWORD_RESET_MINUTES * 60_000,
                ).toISOString(),
                usedAt: null,
            }),
        );

        const resetUrl = new URL(
            '/reset-password',
            process.env.FRONTEND_URL ?? 'http://localhost:3001',
        );
        resetUrl.searchParams.set('token', token);
        await this.mailer.send({
            to: user.email,
            subject: 'Reset your Taskflow password',
            html: html`
                <p>We received a request to reset your Taskflow password.</p>
                <p><a href="${resetUrl.toString()}">Reset your password</a></p>
                <p>This link expires in 30 minutes. If you did not request this,
                you can ignore this email.</p>
            `,
        });
    }

    async resetPassword(dto: PasswordResetConfirmDto): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(PasswordResetTokenEntity);
            const token = await repository.findOneBy({
                tokenHash: hashToken(dto.token),
                usedAt: IsNull(),
                expiresAt: MoreThan(new Date().toISOString()),
            });
            if (!token) {
                throw new UnauthorizedException(
                    'This password reset link is invalid or expired',
                );
            }

            const now = new Date().toISOString();
            const consumed = await repository.update(
                {
                    id: token.id,
                    usedAt: IsNull(),
                    expiresAt: MoreThan(now),
                },
                { usedAt: now },
            );
            if (consumed.affected !== 1) {
                throw new UnauthorizedException(
                    'This password reset link is invalid or expired',
                );
            }

            await manager.getRepository(UserEntity).update(
                { id: token.userId },
                { password: await bcrypt.hash(dto.password, 10) },
            );
            await manager.getRepository(UserEntity).increment(
                { id: token.userId },
                'tokenVersion',
                1,
            );
            await manager.getRepository(RefreshSessionEntity).update(
                { userId: token.userId, revokedAt: IsNull() },
                { revokedAt: now },
            );
        });
    }

    private async createAuthResponse(user: {
        id: number;
        username: string;
        email: string;
        tokenVersion?: number;
    }): Promise<AuthSessionResponse> {
        const accessToken = await this.jwtService.signAsync({
            sub: user.id,
            username: user.username,
            ver: user.tokenVersion ?? 0,
        });
        const refreshToken = randomBytes(48).toString('base64url');
        const now = new Date();
        await this.dataSource.getRepository(RefreshSessionEntity).save({
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(
                now.getTime() + REFRESH_SESSION_DAYS * 24 * 60 * 60_000,
            ).toISOString(),
            revokedAt: null,
        });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        };
    }
}