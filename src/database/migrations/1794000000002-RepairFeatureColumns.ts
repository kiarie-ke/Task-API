import type { MigrationInterface, QueryRunner } from 'typeorm';

const columns: ReadonlyArray<{
    table: 'users' | 'tasks';
    name: string;
    definition: string;
}> = [
    { table: 'users', name: 'token_version', definition: 'integer NOT NULL DEFAULT 0' },
    { table: 'users', name: 'timezone', definition: "text NOT NULL DEFAULT 'UTC'" },
    {
        table: 'users',
        name: 'reminder_time',
        definition: "text NOT NULL DEFAULT '09:00'",
    },
    {
        table: 'users',
        name: 'reminder_channels',
        definition: `text NOT NULL DEFAULT '["email"]'`,
    },
    { table: 'tasks', name: 'workspace_id', definition: 'integer' },
    { table: 'tasks', name: 'assignee_id', definition: 'integer' },
];

export class RepairFeatureColumns1794000000002 implements MigrationInterface {
    name = 'RepairFeatureColumns1794000000002';

    async up(queryRunner: QueryRunner): Promise<void> {
        for (const column of columns) {
            if (!(await queryRunner.hasColumn(column.table, column.name))) {
                await queryRunner.query(
                    `ALTER TABLE "${column.table}" ADD COLUMN "${column.name}" ${column.definition}`,
                );
            }
        }
    }

    async down(): Promise<void> {}
}
