import * as bcrypt from 'bcryptjs';

import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly jwtService: JwtService,
    ) {}

    async register(dto: RegisterDto) {
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

    async login(dto: LoginDto) {
        const user = await this.databaseService.findUserByEmail(
            dto.email.trim().toLowerCase(),
        );
        if (!user || !(await bcrypt.compare(dto.password, user.password))) {
            throw new UnauthorizedException('Invalid email or password');
        }

        return this.createAuthResponse(user);
    }

    private async createAuthResponse(user: {
        id: number;
        username: string;
        email: string;
    }) {
        const accessToken = await this.jwtService.signAsync({
            sub: user.id,
            username: user.username,
        });

        return {
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        };
    }
}