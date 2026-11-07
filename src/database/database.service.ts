import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface User {
    id: number;
    username: string;
    email: string;
    password: string;
}
export interface Task {
    id: number;
    title: string;
    description?: string;
    completed: boolean;
}

interface DatabaseShape {
    tasks: Task[];
    users: User[];
    nextId: number;
    nextUserId: number;

}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
        typeof value.completed === 'boolean'
    );
}

function isUser(value: unknown): value is User {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.id === 'number' &&
        Number.isSafeInteger(value.id) &&
        value.id > 0 &&
        typeof value.username === 'string' &&
        typeof value.email === 'string' &&
        typeof value.password === 'string'
    );
}

function isDatabaseShape(value: unknown): value is DatabaseShape {
    if (!isRecord(value) || typeof value.nextId !== 'number') {
        return false;
    }

    if (!Number.isSafeInteger(value.nextId) || value.nextId < 1) {
        return false;
    }

    if (!Array.isArray(value.tasks)) {
        return false;
    }

    const tasks: Task[] = [];
    for (const task of value.tasks as unknown[]) {
        if (!isTask(task)) {
            return false;
        }
        tasks.push(task);
    }

    const ids = new Set(tasks.map((task) => task.id));
    const highestId = Math.max(0, ...ids);
    if (ids.size !== tasks.length || value.nextId <= highestId) {
        return false;
    }

    const users = value.users ?? [];
    if (!Array.isArray(users) || !users.every(isUser)) {
        return false;
    }

    const userIds = new Set(users.map((user) => user.id));
    const highestUserId = Math.max(0, ...userIds);
    const nextUserId = value.nextUserId ?? highestUserId + 1;
    return (
        userIds.size === users.length &&
        typeof nextUserId === 'number' &&
        Number.isSafeInteger(nextUserId) &&
        nextUserId > highestUserId
    );
}

function hasErrorCode(error: unknown, code: string): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === code
    );
}

@Injectable()
export class DatabaseService implements OnModuleInit {
    private readonly filePath =
        process.env.TASK_DATABASE_PATH ??
        join(process.cwd(), 'data', 'tasks.json');
    private database: DatabaseShape = { tasks: [], users: [], nextId: 1, nextUserId: 1 };
    private operationQueue: Promise<void> = Promise.resolve();

    async onModuleInit(): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });

        let contents: string;
        try {
            contents = await readFile(this.filePath, 'utf8');
        } catch (error) {
            if (!hasErrorCode(error, 'ENOENT')) {
                throw error;
            }

            await this.persist(this.database);
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(contents);
        } catch (error) {
            throw new Error(
                `Could not parse task database at ${this.filePath}`,
                { cause: error },
            );
        }

        if (!isDatabaseShape(parsed)) {
            throw new Error(`Invalid task database at ${this.filePath}`);
        }

        this.database = {
            tasks: parsed.tasks,
            users: parsed.users ?? [],
            nextId: parsed.nextId,
            nextUserId:
                parsed.nextUserId ??
                Math.max(0, ...((parsed.users ?? []).map((user) => user.id))) + 1,
        };
    }

    findAll(): Promise<Task[]> {
        return this.enqueue(() =>
            Promise.resolve(this.database.tasks.map((task) => ({ ...task }))),
        );
    }

    findOne(id: number): Promise<Task | undefined> {
        return this.enqueue(() => {
            const task = this.database.tasks.find((item) => item.id === id);
            return Promise.resolve(task ? { ...task } : undefined);
        });
    }

    createUser(user: Omit<User, 'id'>): Promise<User | undefined> {
        return this.enqueue(async () => {
            if (
                this.database.users.some(
                    (existing) =>
                        existing.email.toLowerCase() ===
                        user.email.toLowerCase(),
                )
            ) {
                return undefined;
            }

            const createdUser: User = {
                id: this.database.nextUserId,
                ...user,
            };
            const nextDatabase: DatabaseShape = {
                tasks: [...this.database.tasks],
                users: [...this.database.users, createdUser],
                nextId: this.database.nextId,
                nextUserId: this.database.nextUserId + 1,
            };

            await this.persist(nextDatabase);
            this.database = nextDatabase;
            return { ...createdUser };
        });
    }

    findUser(id: number): Promise<User | undefined> {
        return this.enqueue(() => {
            const user = this.database.users.find((item) => item.id === id);
            return Promise.resolve(user ? { ...user } : undefined);
        });
    }

    findUserByEmail(email: string): Promise<User | undefined> {
        return this.enqueue(() => {
            const user = this.database.users.find(
                (item) => item.email.toLowerCase() === email.toLowerCase(),
            );
            return Promise.resolve(user ? { ...user } : undefined);
        });
    }

    create(task: Omit<Task, 'id'>): Promise<Task> {
        return this.enqueue(async () => {
            const createdTask: Task = {
                id: this.database.nextId,
                ...task,
            };
            const nextDatabase: DatabaseShape = {
                tasks: [...this.database.tasks, createdTask],
                users: [...this.database.users],
                nextId: this.database.nextId + 1,
                nextUserId: this.database.nextUserId,
            };

            await this.persist(nextDatabase);
            this.database = nextDatabase;
            return { ...createdTask };
        });
    }

    update(
        id: number,
        changes: Partial<Omit<Task, 'id'>>,
    ): Promise<Task | undefined> {
        return this.enqueue(async () => {
            const taskIndex = this.database.tasks.findIndex(
                (task) => task.id === id,
            );
            if (taskIndex === -1) {
                return undefined;
            }

            const updatedTask = {
                ...this.database.tasks[taskIndex],
                ...changes,
            };
            const tasks = [...this.database.tasks];
            tasks[taskIndex] = updatedTask;
            const nextDatabase = { ...this.database, tasks };

            await this.persist(nextDatabase);
            this.database = nextDatabase;
            return { ...updatedTask };
        });
    }

    remove(id: number): Promise<Task | undefined> {
        return this.enqueue(async () => {
            const taskIndex = this.database.tasks.findIndex(
                (task) => task.id === id,
            );
            if (taskIndex === -1) {
                return undefined;
            }

            const removedTask = this.database.tasks[taskIndex];
            const tasks = this.database.tasks.filter(
                (_, index) => index !== taskIndex,
            );
            const nextDatabase = { ...this.database, tasks };
            await this.persist(nextDatabase);
            this.database = nextDatabase;
            return { ...removedTask };
        });
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.operationQueue.then(operation);
        this.operationQueue = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    private async persist(database: DatabaseShape): Promise<void> {
        const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
        await writeFile(
            temporaryPath,
            `${JSON.stringify(database, null, 2)}\n`,
            'utf8',
        );
        await rename(temporaryPath, this.filePath);
    }
}
