import {
    Column,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { TaskPriority, TaskRecurrence } from '../database.service';
import { TaskSubtaskEntity } from './task-subtask.entity';

@Entity('tasks')
@Index('IDX_tasks_owner_id', ['ownerId'])
export class TaskEntity {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;

    @Column({ type: 'text' })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'boolean', default: false })
    completed: boolean;

    @Column({ type: 'integer', name: 'owner_id', nullable: true })
    ownerId: number | null;

    @Column({ type: 'text', name: 'due_date', nullable: true })
    dueDate: string | null;

    @Column({ type: 'text', default: 'medium' })
    priority: TaskPriority;

    @Column({ type: 'text', nullable: true })
    project: string | null;

    @Column({ type: 'simple-json', default: '[]' })
    labels: string[];

    @Column({ type: 'text', nullable: true })
    recurrence: TaskRecurrence | null;

    @Column({ type: 'integer', name: 'recurrence_series_id', nullable: true })
    recurrenceSeriesId: number | null;

    @OneToMany(() => TaskSubtaskEntity, (subtask) => subtask.task)
    subtasks: TaskSubtaskEntity[];
}
