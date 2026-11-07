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
}
