import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../database/database.service';

interface JwtPayload {
    sub: number;
    ver: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly databaseService: DatabaseService) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET must be configured');
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
    }

    async validate(payload: JwtPayload) {
        if (!Number.isSafeInteger(payload.sub) || payload.sub < 1) {
            throw new UnauthorizedException();
        }

        const user = await this.databaseService.findUser(payload.sub);
        if (!user) {
            throw new UnauthorizedException();
        }
        if (
            !Number.isSafeInteger(payload.ver) ||
            payload.ver !== (user.tokenVersion ?? 0)
        ) {
            throw new UnauthorizedException();
        }

        return {
            id: user.id,
            username: user.username,
            email: user.email,
        };
    }
}
