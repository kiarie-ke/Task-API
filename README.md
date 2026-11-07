# Taskflow

Taskflow is a NestJS task-management API with a Next.js web app. It supports
personal tasks and shared workspaces, task comments and activity, saved views,
scheduled reminders, offline task changes, and SQLite or PostgreSQL storage.

## Run locally

Install the API and frontend dependencies, then run each application in a
separate terminal:

```bash
npm install
npm run start:dev
```

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). The API listens on port
3000 by default. Set `FRONTEND_ORIGIN` on the API if the frontend uses a
different origin.

Set a strong `JWT_SECRET` before starting the API. In development, password
reset and workspace invitation emails are written to `data/mail/`. Set
`FRONTEND_URL` if links in those emails should point to a different frontend.

## Authentication

Register with `POST /auth/register` using `username`, `email`, and `password`;
sign in with `POST /auth/login` using `email` and `password`. Both return an
access token. Send it as a bearer token in the `Authorization` header when
calling protected endpoints. Refresh tokens are rotated in an HttpOnly cookie;
`POST /auth/refresh` renews the session and `POST /auth/logout` revokes it.

Password reset uses `POST /auth/password-reset/request` and
`POST /auth/password-reset/confirm`. Reset links are one-time use and expire
after 30 minutes. Password reset revokes refresh sessions and invalidates
existing access tokens.

## Task features

Tasks support descriptions, due dates, priorities, projects, labels, recurring
tasks, and subtasks. Users can filter and sort tasks, create saved filter views,
and view a weekly planner. Completing a recurring task creates its next
occurrence.

Workspaces support membership, invitations, roles, task sharing, and
assignment. Workspace members can collaborate through task comments and an
activity history. Access is scoped by task ownership and workspace membership.

Reminders can be configured by timezone, local reminder time, and delivery
channel. Email reminders require SMTP in production. Web push requires VAPID
keys and a browser that supports push notifications. The app also supports
installability and an offline task cache with queued task/subtask changes; the
queue syncs when connectivity returns.

## Configuration

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Required signing secret for access tokens |
| `FRONTEND_ORIGIN` | Allowed browser origin; defaults to `http://localhost:3001` |
| `FRONTEND_URL` | Base URL used in password reset and invitation links |
| `MAIL_FROM` | Sender address for email |
| `SMTP_URL` | SMTP connection URL; required when `NODE_ENV=production` |
| `VAPID_PUBLIC_KEY` | Optional Web Push public key |
| `VAPID_PRIVATE_KEY` | Optional Web Push private key; configure with the public key |
| `VAPID_SUBJECT` | Optional Web Push contact, such as a `mailto:` URL |
| `TASK_DATABASE_PATH` | SQLite file path; defaults to `data/taskflow.sqlite` |
| `TASK_LEGACY_DATABASE_PATH` | Optional legacy JSON source to import into SQLite |
| `DATABASE_URL` | PostgreSQL connection URL; cannot be combined with SQLite path variables |
| `TASK_BACKUP_DIR` | Backup directory; defaults to `backups/` |

The TypeORM migrations run automatically at startup. Legacy JSON import is
SQLite-only. For PostgreSQL, provide a reachable database in `DATABASE_URL`.
Production email needs a reachable SMTP server and a valid `SMTP_URL`.

## Backup and restore

Create a local database backup with:

```bash
npm run db:backup
```

SQLite backups use the SQLite online backup API. PostgreSQL backups use
`pg_dump` in custom format, so `pg_dump` must be installed and available on
`PATH`. Set `TASK_BACKUP_DIR` to change the destination.

Restore a SQLite backup by stopping the API and replacing the configured
SQLite database file with the backup. Restore a PostgreSQL backup with
`pg_restore` against the target database. Keep backups encrypted and outside
version control.

## Validation

```bash
npm run build
npm run lint
npm run test:e2e
cd frontend && npm run lint && npm run build
```
