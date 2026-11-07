import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import {
    DataSource,
    QueryFailedError,
    Repository,
    IsNull,
    type EntityManager,
} from 'typeorm';
import { TaskEntity } from './entities/task.entity';
import { TaskSubtaskEntity } from './entities/task-subtask.entity';
import { UserEntity } from './entities/user.entity';
import { getLegacyDatabasePath } from './database-paths';

export interface User {
    id: number;
    username: string;
    email: string;
    password: string;
    tokenVersion?: number;
}

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskRecurrence = 'daily' | 'weekly' | 'monthly';

export interface TaskSubtask {
    id: number;
    title: string;
    completed: boolean;
}

export interface Task {
    id: number;
    title: string;
    description?: string;
    completed: boolean;
    ownerId?: number;
    workspaceId?: number;
    assigneeId?: number;
    dueDate?: string;
    priority?: TaskPriority;
    project?: string;
    labels?: string[];
    recurrence?: TaskRecurrence;
    subtasks?: TaskSubtask[];
    recurrenceSeriesId?: number;
}

interface LegacyDatabaseShape {
    tasks: Task[];
    users: User[];
    nextId: number;
    nextUserId: number;
    nextSubtaskId: number;
}

const TASK_PRIORITIES: readonly unknown[] = ['low', 'medium', 'high'];
const TASK_RECURRENCES: readonly unknown[] = ['daily', 'weekly', 'monthly'];
const LEGACY_IMPORT_KEY = 'legacy-json-import';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDateOnly(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function isSubtask(value: unknown): value is TaskSubtask {
    return (
        isRecord(value) &&
        typeof value.id === 'number' &&
        Number.isSafeInteger(value.id) &&
        value.id > 0 &&
        typeof value.title === 'string' &&
        value.title.trim().length > 0 &&
        typeof value.completed === 'boolean'
    );
}

function isTask(value: unknown): value is Task {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.id === 'number' &&
        Number.isSafeInteger(value.id) &&
        value.id > 0 &&
        typeof value.title === 'string' &&
        (value.description === undefined ||
            typeof value.description === 'string') &&
        typeof value.completed === 'boolean' &&
        (value.ownerId === undefined ||
            (typeof value.ownerId === 'number' &&
                Number.isSafeInteger(value.ownerId) &&
                value.ownerId > 0)) &&
        (value.dueDate === undefined || isDateOnly(value.dueDate)) &&
        (value.priority === undefined ||
            TASK_PRIORITIES.includes(value.priority)) &&
        (value.project === undefined || typeof value.project === 'string') &&
        (value.labels === undefined ||
            (Array.isArray(value.labels) &&
                value.labels.every((label) => typeof label === 'string'))) &&
        (value.recurrence === undefined ||
            TASK_RECURRENCES.includes(value.recurrence)) &&
        (value.recurrenceSeriesId === undefined ||
            (typeof value.recurrenceSeriesId === 'number' &&
                Number.isSafeInteger(value.recurrenceSeriesId) &&
                value.recurrenceSeriesId > 0)) &&
        (value.subtasks === undefined ||
            (Array.isArray(value.subtasks) &&
                value.subtasks.every(isSubtask) &&
                new Set(value.subtasks.map((subtask) => subtask.id)).size ===
                    value.subtasks.length))
    );
}

function isUser(value: unknown): value is User {
    return (
        isRecord(value) &&
        typeof value.id === 'number' &&
        Number.isSafeInteger(value.id) &&
        value.id > 0 &&
        typeof value.username === 'string' &&
        typeof value.email === 'string' &&
        typeof value.password === 'string'
    );
}

function isLegacyDatabase(value: unknown): value is LegacyDatabaseShape {
    if (
        !isRecord(value) ||
        typeof value.nextId !== 'number' ||
        !Number.isSafeInteger(value.nextId) ||
        value.nextId < 1 ||
        !Array.isArray(value.tasks) ||
        !value.tasks.every(isTask)
    ) {
        return false;
    }

    const tasks = value.tasks;
    const taskIds = new Set(tasks.map((task) => task.id));
    if (
        taskIds.size !== tasks.length ||
        value.nextId <= Math.max(0, ...taskIds)
    ) {
        return false;
    }

    const users = value.users ?? [];
    if (!Array.isArray(users) || !users.every(isUser)) {
        return false;
    }

    const userIds = new Set(users.map((user) => user.id));
    const highestUserId = Math.max(0, ...userIds);
    const nextUserId = value.nextUserId ?? highestUserId + 1;
    if (
        userIds.size !== users.length ||
        typeof nextUserId !== 'number' ||
        !Number.isSafeInteger(nextUserId) ||
        nextUserId <= highestUserId
    ) {
        return false;
    }

    const subtaskIds = tasks.flatMap((task) =>
        (task.subtasks ?? []).map((subtask) => subtask.id),
    );
    const highestSubtaskId = Math.max(0, ...subtaskIds);
    const nextSubtaskId = value.nextSubtaskId ?? highestSubtaskId + 1;

    return (
        new Set(subtaskIds).size === subtaskIds.length &&
        typeof nextSubtaskId === 'number' &&
        Number.isSafeInteger(nextSubtaskId) &&
        nextSubtaskId > highestSubtaskId
    );
}

function getLegacyDatabase(value: LegacyDatabaseShape): LegacyDatabaseShape {
    const users = value.users ?? [];
    return {
        tasks: value.tasks.map((task) => ({
            ...task,
            priority: task.priority ?? 'medium',
            labels: task.labels ?? [],
            subtasks: task.subtasks ?? [],
        })),
        users,
        nextId: value.nextId,
        nextUserId:
            value.nextUserId ??
            Math.max(0, ...users.map((user) => user.id)) + 1,
        nextSubtaskId:
            value.nextSubtaskId ??
            Math.max(
                0,
                ...value.tasks.flatMap((task) =>
                    (task.subtasks ?? []).map((subtask) => subtask.id),
                ),
            ) + 1,
    };
}

function nextDueDate(dueDate: string, recurrence: TaskRecurrence): string {
    const date = new Date(`${dueDate}T00:00:00.000Z`);

    if (recurrence === 'daily') {
        date.setUTCDate(date.getUTCDate() + 1);
    } else if (recurrence === 'weekly') {
        date.setUTCDate(date.getUTCDate() + 7);
    } else {
        const dayOfMonth = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + 1);
        const lastDayOfMonth = new Date(
            Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate();
        date.setUTCDate(Math.min(dayOfMonth, lastDayOfMonth));
    }

    return date.toISOString().slice(0, 10);
}

function isUniqueEmailError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
        return false;
    }

    const driverError: unknown = error.driverError;
    if (!isRecord(driverError)) {
        return false;
    }
    if (
        driverError.code === '23505' &&
        driverError.constraint === 'IDX_users_email'
    ) {
        return true;
    }
    return (
        driverError.code === 'SQLITE_CONSTRAINT' &&
        typeof driverError.message === 'string' &&
        driverError.message.includes('UNIQUE constraint failed: users.email')
    );
}

function toUser(entity: UserEntity): User {
    return {
        id: entity.id,
        username: entity.username,
        email: entity.email,
        password: entity.password,
        tokenVersion: entity.tokenVersion,
    };
}

function toTask(entity: TaskEntity): Task {
    const task: Task = {
        id: entity.id,
        title: entity.title,
        completed: entity.completed,
        priority: entity.priority,
        labels: [...(entity.labels ?? [])],
        subtasks: [...(entity.subtasks ?? [])]
            .sort((left, right) => left.id - right.id)
            .map(({ id, title, completed }) => ({ id, title, completed })),
    };

    if (entity.description !== null) {
        task.description = entity.description;
    }
    if (entity.ownerId !== null) {
        task.ownerId = entity.ownerId;
    }
    if (entity.workspaceId !== null) {
        task.workspaceId = entity.workspaceId;
    }
    if (entity.assigneeId !== null) {
        task.assigneeId = entity.assigneeId;
    }
    if (entity.dueDate !== null) {
        task.dueDate = entity.dueDate;
    }
    if (entity.project !== null) {
        task.project = entity.project;
    }
    if (entity.recurrence !== null) {
        task.recurrence = entity.recurrence;
    }
    if (entity.recurrenceSeriesId !== null) {
        task.recurrenceSeriesId = entity.recurrenceSeriesId;
    }

    delete task.recurrenceSeriesId;
    return task;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
    constructor(
        @InjectRepository(UserEntity)
        private readonly users: Repository<UserEntity>,
        @InjectRepository(TaskEntity)
        private readonly tasks: Repository<TaskEntity>,
        @InjectRepository(TaskSubtaskEntity)
        private readonly subtasks: Repository<TaskSubtaskEntity>,
        private readonly dataSource: DataSource,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.dataSource.options.type !== 'sqlite') {
            return;
        }

        const legacyPath = getLegacyDatabasePath();

        if (legacyPath) {
            await this.importLegacyDatabase(legacyPath);
        }
    }

    async findAll(ownerId: number, workspaceId?: number): Promise<Task[]> {
        const tasks = await this.tasks.find({
            where:
                workspaceId === undefined
                    ? { ownerId, workspaceId: IsNull() }
                    : { workspaceId },
            relations: { subtasks: true },
            order: { id: 'ASC' },
        });
        return tasks.map(toTask);
    }

    async findOne(id: number, ownerId: number): Promise<Task | undefined> {
        const task = await this.tasks.findOne({
            where: { id, ownerId },
            relations: { subtasks: true },
        });
        return task ? toTask(task) : undefined;
    }

    async findOneById(id: number): Promise<Task | undefined> {
        const task = await this.tasks.findOne({
            where: { id },
            relations: { subtasks: true },
        });
        return task ? toTask(task) : undefined;
    }

    async createUser(user: Omit<User, 'id'>): Promise<User | undefined> {
        const entity = this.users.create({
            ...user,
            email: user.email.trim().toLowerCase(),
        });
        try {
            return toUser(await this.users.save(entity));
        } catch (error) {
            if (isUniqueEmailError(error)) {
                return undefined;
            }
            throw error;
        }
    }

    async findUser(id: number): Promise<User | undefined> {
        const user = await this.users.findOneBy({ id });
        return user ? toUser(user) : undefined;
    }

    async findUserByEmail(email: string): Promise<User | undefined> {
        const user = await this.users.findOneBy({
            email: email.trim().toLowerCase(),
        });
        return user ? toUser(user) : undefined;
    }

    async create(
        task: Omit<Task, 'id' | 'subtasks' | 'recurrenceSeriesId'> & {
            ownerId: number;
        },
    ): Promise<Task> {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(TaskEntity);
            const entity = repository.create({
                title: task.title,
                description: task.description ?? null,
                completed: task.completed,
                ownerId: task.ownerId,
                workspaceId: task.workspaceId ?? null,
                assigneeId: task.assigneeId ?? null,
                dueDate: task.dueDate ?? null,
                priority: task.priority ?? 'medium',
                project: task.project ?? null,
                labels: task.labels ?? [],
                recurrence: task.recurrence ?? null,
                recurrenceSeriesId: null,
            });
            const created = await repository.save(entity);

            if (created.recurrence) {
                created.recurrenceSeriesId = created.id;
                await repository.save(created);
            }

            return toTask(created);
        });
    }

    async update(
        id: number,
        ownerId: number,
        changes: Partial<Omit<Task, 'id'>>,
    ): Promise<Task | undefined> {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(TaskEntity);
            const task = await repository.findOne({
                where: { id },
                relations: { subtasks: true },
            });
            if (!task) {
                return undefined;
            }

            const wasCompleted = task.completed;
            if (changes.title !== undefined) task.title = changes.title;
            if ('description' in changes) {
                task.description = changes.description ?? null;
            }
            if (changes.completed !== undefined) {
                task.completed = changes.completed;
            }
            if ('dueDate' in changes) task.dueDate = changes.dueDate ?? null;
            if (changes.priority !== undefined) {
                task.priority = changes.priority;
            }
            if ('project' in changes) task.project = changes.project ?? null;
            if (changes.labels !== undefined) task.labels = changes.labels;
            if ('recurrence' in changes) {
                task.recurrence = changes.recurrence ?? null;
            }
            if ('assigneeId' in changes) {
                task.assigneeId = changes.assigneeId ?? null;
            }
            if (task.recurrence && task.recurrenceSeriesId === null) {
                task.recurrenceSeriesId = task.id;
            }

            await repository.save(task);

            if (
                !wasCompleted &&
                task.completed &&
                task.recurrence &&
                task.dueDate &&
                task.recurrenceSeriesId !== null
            ) {
                const dueDate = nextDueDate(task.dueDate, task.recurrence);
                const alreadyScheduled = await repository.existsBy({
                    recurrenceSeriesId: task.recurrenceSeriesId,
                    dueDate,
                });

                if (!alreadyScheduled) {
                    await repository.save(
                        repository.create({
                            title: task.title,
                            description: task.description,
                            completed: false,
                            ownerId: task.ownerId,
                            workspaceId: task.workspaceId,
                            assigneeId: task.assigneeId,
                            dueDate,
                            priority: task.priority,
                            project: task.project,
                            labels: [...task.labels],
                            recurrence: task.recurrence,
                            recurrenceSeriesId: task.recurrenceSeriesId,
                        }),
                    );
                }
            }

            return toTask(task);
        });
    }

    async createSubtask(
        taskId: number,
        ownerId: number,
        title: string,
    ): Promise<Task | undefined> {
        return this.dataSource.transaction(async (manager) => {
            const task = await manager.getRepository(TaskEntity).findOne({
                where: { id: taskId },
                relations: { subtasks: true },
            });
            if (!task) {
                return undefined;
            }

            const repository = manager.getRepository(TaskSubtaskEntity);
            const subtask = repository.create({
                title,
                completed: false,
                task,
            });
            task.subtasks = [...(task.subtasks ?? []), await repository.save(subtask)];
            return toTask(task);
        });
    }

    async updateSubtask(
        taskId: number,
        ownerId: number,
        subtaskId: number,
        completed: boolean,
    ): Promise<Task | undefined> {
        return this.dataSource.transaction(async (manager) => {
            const task = await manager.getRepository(TaskEntity).findOne({
                where: { id: taskId },
                relations: { subtasks: true },
            });
            const subtask = task?.subtasks.find((item) => item.id === subtaskId);
            if (!task || !subtask) {
                return undefined;
            }

            subtask.completed = completed;
            await manager.getRepository(TaskSubtaskEntity).save(subtask);
            return toTask(task);
        });
    }

    async removeSubtask(
        taskId: number,
        ownerId: number,
        subtaskId: number,
    ): Promise<Task | undefined> {
        return this.dataSource.transaction(async (manager) => {
            const task = await manager.getRepository(TaskEntity).findOne({
                where: { id: taskId },
                relations: { subtasks: true },
            });
            const subtask = task?.subtasks.find((item) => item.id === subtaskId);
            if (!task || !subtask) {
                return undefined;
            }

            await manager.getRepository(TaskSubtaskEntity).remove(subtask);
            task.subtasks = task.subtasks.filter((item) => item.id !== subtaskId);
            return toTask(task);
        });
    }

    async remove(id: number, _ownerId: number): Promise<Task | undefined> {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(TaskEntity);
            const task = await repository.findOne({
                where: { id },
                relations: { subtasks: true },
            });
            if (!task) {
                return undefined;
            }

            const removed = toTask(task);
            await repository.remove(task);
            return removed;
        });
    }

    private async importLegacyDatabase(legacyPath: string): Promise<void> {
        const importMarker = await this.dataSource.query(
            'SELECT "value" FROM "task_api_metadata" WHERE "key" = ?',
            [LEGACY_IMPORT_KEY],
        );
        if (importMarker.length > 0) {
            return;
        }

        let contents: string;
        try {
            contents = await readFile(legacyPath, 'utf8');
        } catch (error) {
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === 'ENOENT' &&
                !process.env.TASK_LEGACY_DATABASE_PATH
            ) {
                return;
            }
            throw error;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(contents);
        } catch (error) {
            throw new Error(
                `Could not parse legacy task database at ${legacyPath}`,
                { cause: error },
            );
        }

        if (!isLegacyDatabase(parsed)) {
            throw new Error(`Invalid legacy task database at ${legacyPath}`);
        }

        const [taskCount, userCount] = await Promise.all([
            this.tasks.count(),
            this.users.count(),
        ]);
        if (taskCount > 0 || userCount > 0) {
            throw new Error(
                `Cannot import legacy task database at ${legacyPath}: the SQLite database is not empty`,
            );
        }

        const legacy = getLegacyDatabase(parsed);
        await this.dataSource.transaction(async (manager) => {
            const users = manager.getRepository(UserEntity);
            const tasks = manager.getRepository(TaskEntity);
            const subtasks = manager.getRepository(TaskSubtaskEntity);

            if (legacy.users.length > 0) {
                await users.insert(
                    legacy.users.map((user) => ({
                        ...user,
                        email: user.email.toLowerCase(),
                    })),
                );
            }

            if (legacy.tasks.length > 0) {
                await tasks.insert(
                    legacy.tasks.map((task) => ({
                        id: task.id,
                        title: task.title,
                        description: task.description ?? null,
                        completed: task.completed,
                        ownerId: task.ownerId ?? null,
                        dueDate: task.dueDate ?? null,
                        priority: task.priority ?? 'medium',
                        project: task.project ?? null,
                        labels: task.labels ?? [],
                        recurrence: task.recurrence ?? null,
                        recurrenceSeriesId:
                            task.recurrenceSeriesId ??
                            (task.recurrence ? task.id : null),
                    })),
                );
            }

            const subtaskRows = legacy.tasks.flatMap((task) =>
                (task.subtasks ?? []).map((subtask) => ({
                    id: subtask.id,
                    title: subtask.title,
                    completed: subtask.completed,
                    task: { id: task.id },
                })),
            );
            if (subtaskRows.length > 0) {
                await subtasks.insert(subtaskRows);
            }

            await this.preserveSequence(manager, 'users', legacy.nextUserId);
            await this.preserveSequence(manager, 'tasks', legacy.nextId);
            await this.preserveSequence(
                manager,
                'subtasks',
                legacy.nextSubtaskId,
            );
            await manager.query(
                'INSERT INTO "task_api_metadata" ("key", "value") VALUES (?, ?)',
                [LEGACY_IMPORT_KEY, legacyPath],
            );
        });
    }

    private async preserveSequence(
        manager: EntityManager,
        table: 'users' | 'tasks' | 'subtasks',
        nextId: number,
    ): Promise<void> {
        await manager.query(
            'INSERT INTO "sqlite_sequence" ("name", "seq") SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM "sqlite_sequence" WHERE "name" = ?)',
            [table, nextId - 1, table],
        );
        await manager.query(
            'UPDATE "sqlite_sequence" SET "seq" = MAX("seq", ?) WHERE "name" = ?',
            [nextId - 1, table],
        );
    }
}
