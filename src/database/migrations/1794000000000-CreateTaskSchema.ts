import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTaskSchema1794000000000 implements MigrationInterface {
    name = 'CreateTaskSchema1794000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "username" text NOT NULL,
                "email" text NOT NULL,
                "password" text NOT NULL
            )
        `);
        await queryRunner.query(
            'CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email")',
        );
        await queryRunner.query(`
            CREATE TABLE "tasks" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "title" text NOT NULL,
                "description" text,
                "completed" boolean NOT NULL DEFAULT (0),
                "owner_id" integer,
                "due_date" text,
                "priority" text NOT NULL DEFAULT ('medium'),
                "project" text,
                "labels" text NOT NULL DEFAULT ('[]'),
                "recurrence" text,
                "recurrence_series_id" integer
            )
        `);
        await queryRunner.query(
            'CREATE INDEX "IDX_tasks_owner_id" ON "tasks" ("owner_id")',
        );
        await queryRunner.query(`
            CREATE TABLE "subtasks" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "title" text NOT NULL,
                "completed" boolean NOT NULL DEFAULT (0),
                "task_id" integer NOT NULL,
                CONSTRAINT "FK_subtasks_task_id" FOREIGN KEY ("task_id")
                    REFERENCES "tasks" ("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "task_api_metadata" (
                "key" text PRIMARY KEY NOT NULL,
                "value" text NOT NULL
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "task_api_metadata"');
        await queryRunner.query('DROP TABLE "subtasks"');
        await queryRunner.query('DROP INDEX "IDX_tasks_owner_id"');
        await queryRunner.query('DROP TABLE "tasks"');
        await queryRunner.query('DROP INDEX "IDX_users_email"');
        await queryRunner.query('DROP TABLE "users"');
    }
}
