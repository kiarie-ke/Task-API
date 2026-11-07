import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { TaskEntity } from './task.entity';

@Entity('subtasks')
export class TaskSubtaskEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'text' })
    title: string;

    @Column({ type: 'boolean', default: false })
    completed: boolean;

    @ManyToOne(() => TaskEntity, (task) => task.subtasks, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'task_id' })
    task: TaskEntity;
}
