import { dirname, join } from 'node:path';

export function getDatabasePath(): string {
    const configuredPath = process.env.TASK_DATABASE_PATH;
    if (configuredPath?.toLowerCase().endsWith('.json')) {
        return join(dirname(configuredPath), 'taskflow.sqlite');
    }

    return configuredPath ?? join(process.cwd(), 'data', 'taskflow.sqlite');
}

export function getLegacyDatabasePath(): string | undefined {
    const explicitLegacyPath = process.env.TASK_LEGACY_DATABASE_PATH;
    if (explicitLegacyPath) {
        return explicitLegacyPath;
    }

    const configuredPath = process.env.TASK_DATABASE_PATH;
    if (configuredPath?.toLowerCase().endsWith('.json')) {
        return configuredPath;
    }

    if (!configuredPath) {
        return join(process.cwd(), 'data', 'tasks.json');
    }

    return undefined;
}
