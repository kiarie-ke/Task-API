import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
@Index('IDX_users_email', ['email'], { unique: true })
export class UserEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'text' })
    username: string;

    @Column({ type: 'text' })
    email: string;

    @Column({ type: 'text' })
    password: string;

    @Column({ type: 'integer', name: 'token_version', default: 0 })
    tokenVersion: number;

    @Column({ type: 'text', default: 'UTC' })
    timezone: string;

    @Column({ type: 'text', name: 'reminder_time', default: '09:00' })
    reminderTime: string;

    @Column({
        type: 'simple-json',
        name: 'reminder_channels',
        default: '["email"]',
    })
    reminderChannels: string[];
}
