import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { RepairFeatureColumns1794000000002 } from '../src/database/migrations/1794000000002-RepairFeatureColumns';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let databaseDirectory: string;
  const originalDatabasePath = process.env.TASK_DATABASE_PATH;
  const originalLegacyDatabasePath = process.env.TASK_LEGACY_DATABASE_PATH;
  const originalJwtSecret = process.env.JWT_SECRET;
  let accessToken: string;
  let mailbox: InMemoryMailTransport;

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'task-api-e2e-'));
    process.env.TASK_DATABASE_PATH = join(databaseDirectory, 'tasks.sqlite');
    delete process.env.TASK_LEGACY_DATABASE_PATH;
    process.env.JWT_SECRET = 'test-secret-with-sufficient-length';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    mailbox = app.get(MailTransport) as InMemoryMailTransport;
    mailbox.clear();
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'test-user',
        email: 'test@example.com',
        password: 'secure-password',
      })
      .expect(201);
    accessToken = registration.body.accessToken;
  }, 30_000);

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('creates, updates, and deletes tasks', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Test task', description: 'Task details' })
      .expect(201);

    expect(created.body).toEqual({
      id: 1,
      title: 'Test task',
      description: 'Task details',
      completed: false,
      ownerId: 1,
      priority: 'medium',
      labels: [],
      subtasks: [],
    });

    await request(server)
      .patch('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ completed: true })
      .expect(200)
      .expect({ ...created.body, completed: true });

    await request(server)
      .delete('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ ...created.body, completed: true });
  });

  it('does not reuse IDs after a task is deleted', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'First task' })
      .expect(201);
    await request(server)
      .delete('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Second task' })
      .expect(201)
      .expect(({ body }) => expect(body.id).toBe(2));

    await request(server)
      .get('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('persists tasks across application restarts', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Persistent task' })
      .expect(201);
    await app.close();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect([
        {
          id: 1,
          title: 'Persistent task',
          completed: false,
          ownerId: 1,
          priority: 'medium',
          labels: [],
          subtasks: [],
        },
      ]);
  });

  it('creates recurring tasks with metadata and generates the next occurrence once', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Weekly planning',
        dueDate: '2026-11-10',
        priority: 'high',
        project: 'Work',
        labels: ['planning', 'team'],
        recurrence: 'weekly',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      dueDate: '2026-11-10',
      priority: 'high',
      project: 'Work',
      labels: ['planning', 'team'],
      recurrence: 'weekly',
      subtasks: [],
    });

    const withSubtask = await request(server)
      .post('/tasks/1/subtasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Check the calendar' })
      .expect(201);
    expect(withSubtask.body.subtasks).toEqual([
      { id: 1, title: 'Check the calendar', completed: false },
    ]);

    await request(server)
      .patch('/tasks/1/subtasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ completed: true })
      .expect(200)
      .expect(({ body }) =>
        expect(body.subtasks[0].completed).toBe(true),
      );

    await request(server)
      .patch('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ completed: true })
      .expect(200);

    const tasks = await request(server)
      .get('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(tasks.body).toHaveLength(2);
    expect(tasks.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          completed: true,
          dueDate: '2026-11-10',
          subtasks: [
            { id: 1, title: 'Check the calendar', completed: true },
          ],
        }),
        expect.objectContaining({
          id: 2,
          completed: false,
          dueDate: '2026-11-17',
          priority: 'high',
          project: 'Work',
          labels: ['planning', 'team'],
          recurrence: 'weekly',
          subtasks: [],
        }),
      ]),
    );

    await request(server)
      .patch('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ completed: false })
      .expect(200);
    await request(server)
      .patch('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ completed: true })
      .expect(200);
    await request(server)
      .get('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(2));
  });

  it('edits task metadata and validates dates and recurrence', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Draft task' })
      .expect(201);

    await request(server)
      .patch('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Updated task',
        dueDate: '2026-12-01',
        priority: 'low',
        project: 'Personal',
        labels: ['home', 'home', 'errands'],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          title: 'Updated task',
          dueDate: '2026-12-01',
          priority: 'low',
          project: 'Personal',
          labels: ['home', 'errands'],
        });
      });

    await request(server)
      .patch('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        dueDate: null,
        project: null,
        labels: [],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.dueDate).toBeUndefined();
        expect(body.project).toBeUndefined();
        expect(body.labels).toEqual([]);
      });

    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Invalid recurring task', recurrence: 'daily' })
      .expect(400);
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Invalid date', dueDate: '2026-02-31' })
      .expect(400);
  });

  it('only allows users to access their own tasks', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Private task' })
      .expect(201);
    await request(server)
      .post('/tasks/1/subtasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Owner-only subtask' })
      .expect(201);

    const secondUser = await request(server)
      .post('/auth/register')
      .send({
        username: 'second-user',
        email: 'second@example.com',
        password: 'secure-password',
      })
      .expect(201);

    await request(server)
      .get('/tasks')
      .set('Authorization', `Bearer ${secondUser.body.accessToken}`)
      .expect(200)
      .expect([]);
    await request(server)
      .get('/tasks/1')
      .set('Authorization', `Bearer ${secondUser.body.accessToken}`)
      .expect(404);
    await request(server)
      .patch('/tasks/1')
      .set('Authorization', `Bearer ${secondUser.body.accessToken}`)
      .send({ title: 'Hijacked task' })
      .expect(404);
    await request(server)
      .delete('/tasks/1')
      .set('Authorization', `Bearer ${secondUser.body.accessToken}`)
      .expect(404);
    await request(server)
      .post('/tasks/1/subtasks')
      .set('Authorization', `Bearer ${secondUser.body.accessToken}`)
      .send({ title: 'Unauthorized subtask' })
      .expect(404);
    await request(server)
      .patch('/tasks/1/subtasks/1')
      .set('Authorization', `Bearer ${secondUser.body.accessToken}`)
      .send({ completed: true })
      .expect(404);
    await request(server)
      .delete('/tasks/1/subtasks/1')
      .set('Authorization', `Bearer ${secondUser.body.accessToken}`)
      .expect(404);

    await request(server)
      .get('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({
        id: 1,
        title: 'Private task',
        completed: false,
        ownerId: 1,
        priority: 'medium',
        labels: [],
        subtasks: [{ id: 1, title: 'Owner-only subtask', completed: false }],
      });
  });

  it('keeps pre-authentication tasks inaccessible to users', async () => {
    await app.close();
    const legacyPath = join(databaseDirectory, 'legacy-tasks.json');
    const legacyContents = JSON.stringify({
      tasks: [
        { id: 1, title: 'Legacy task', completed: false },
        {
          id: 3,
          title: 'Owned legacy task',
          completed: false,
          ownerId: 1,
          priority: 'high',
          labels: ['legacy'],
          subtasks: [
            { id: 2, title: 'Old checklist item', completed: true },
          ],
        },
      ],
      users: [
        {
          id: 1,
          username: 'legacy-user',
          email: 'legacy@example.com',
          password: await bcrypt.hash('legacy-password', 10),
        },
      ],
      nextId: 4,
      nextUserId: 2,
      nextSubtaskId: 3,
    });
    await writeFile(legacyPath, legacyContents);
    process.env.TASK_DATABASE_PATH = legacyPath;
    delete process.env.TASK_LEGACY_DATABASE_PATH;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'new-user',
        email: 'new@example.com',
        password: 'secure-password',
      })
      .expect(201);
    expect(registration.body.user.id).toBe(2);
    expect(await readFile(legacyPath, 'utf8')).toBe(legacyContents);

    await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .get('/tasks/1')
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(404);
    const legacyLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'legacy@example.com',
        password: 'legacy-password',
      })
      .expect(200);
    await request(app.getHttpServer())
      .get('/tasks')
      .auth(legacyLogin.body.accessToken, { type: 'bearer' })
      .expect(200)
      .expect([
        {
          id: 3,
          title: 'Owned legacy task',
          completed: false,
          ownerId: 1,
          priority: 'high',
          labels: ['legacy'],
          subtasks: [
            { id: 2, title: 'Old checklist item', completed: true },
          ],
        },
      ]);

    const created = await request(app.getHttpServer())
      .post('/tasks')
      .auth(registration.body.accessToken, { type: 'bearer' })
      .send({ title: 'After migration' })
      .expect(201);
    expect(created.body.id).toBe(4);
    const withSubtask = await request(app.getHttpServer())
      .post('/tasks/4/subtasks')
      .auth(registration.body.accessToken, { type: 'bearer' })
      .send({ title: 'Next checklist item' })
      .expect(201);
    expect(withSubtask.body.subtasks[0].id).toBe(3);
  });

  it('validates task input and task IDs', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 42 })
      .expect(400);
    await request(server)
      .get('/tasks/not-a-number')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
    await request(server)
      .get('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('repairs feature columns missing from an already-migrated SQLite database', async () => {
    const queryRunner = app.get(DataSource).createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(
        'ALTER TABLE "users" DROP COLUMN "token_version"',
      );
      await queryRunner.query(
        'ALTER TABLE "tasks" DROP COLUMN "workspace_id"',
      );

      await new RepairFeatureColumns1794000000002().up(queryRunner);

      expect(await queryRunner.hasColumn('users', 'token_version')).toBe(true);
      expect(await queryRunner.hasColumn('tasks', 'workspace_id')).toBe(true);
    } finally {
      await queryRunner.release();
    }
  });

  it('registers, logs in, and rejects unauthenticated task access', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'secure-password' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.accessToken).toEqual(expect.any(String));
        expect(body.user).toEqual({
          id: 1,
          username: 'test-user',
          email: 'test@example.com',
        });
      });

    await request(server)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'wrong-password' })
      .expect(401);
    await request(server)
      .post('/auth/register')
      .send({
        username: 'another-user',
        email: 'TEST@example.com',
        password: 'secure-password',
      })
      .expect(409);
    await request(server).get('/tasks').expect(401);
  });

  it('rotates refresh cookies and revokes them on logout', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'secure-password' })
      .expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];

    const refreshed = await request(server)
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    const rotatedCookie = refreshed.headers['set-cookie'][0].split(';')[0];

    await request(server)
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
    await request(server)
      .post('/auth/logout')
      .set('Cookie', rotatedCookie)
      .expect(204);
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  it('sends one-time password reset links and revokes existing access tokens', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/auth/password-reset/request')
      .send({ email: 'missing@example.com' })
      .expect(200);
    mailbox.assertNotSent();

    await request(server)
      .post('/auth/password-reset/request')
      .send({ email: 'test@example.com' })
      .expect(200);
    const resetMail = mailbox.assertSent({ to: 'test@example.com' });
    const token = resetMail.link('/reset-password').searchParams.get('token');
    expect(token).toEqual(expect.any(String));

    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'a-new-secure-password' })
      .expect(204);
    await request(server)
      .get('/tasks')
      .auth(accessToken, { type: 'bearer' })
      .expect(401);
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'another-secure-password' })
      .expect(401);
    await request(server)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'secure-password' })
      .expect(401);
    await request(server)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'a-new-secure-password' })
      .expect(200);
  });

  it('isolates workspace tasks and enforces membership roles', async () => {
    const server = app.getHttpServer();
    const workspace = await request(server)
      .post('/workspaces')
      .auth(accessToken, { type: 'bearer' })
      .send({ name: 'Design team' })
      .expect(201);
    const task = await request(server)
      .post('/tasks')
      .auth(accessToken, { type: 'bearer' })
      .send({ title: 'Review the prototype', workspaceId: workspace.body.id })
      .expect(201);

    const member = await request(server)
      .post('/auth/register')
      .send({
        username: 'team-member',
        email: 'member@example.com',
        password: 'secure-password',
      })
      .expect(201);
    await request(server)
      .get(`/tasks?workspaceId=${workspace.body.id}`)
      .auth(member.body.accessToken, { type: 'bearer' })
      .expect(404);

    await request(server)
      .post(`/workspaces/${workspace.body.id}/invitations`)
      .auth(accessToken, { type: 'bearer' })
      .send({ email: 'member@example.com', role: 'member' })
      .expect(201);
    const inviteToken = mailbox
      .assertSent({ to: 'member@example.com' })
      .link('/accept-invitation')
      .searchParams.get('token');
    expect(inviteToken).toEqual(expect.any(String));
    await request(server)
      .post('/workspaces/accept-invitation')
      .auth(member.body.accessToken, { type: 'bearer' })
      .send({ token: inviteToken })
      .expect(201);

    await request(server)
      .get(`/tasks?workspaceId=${workspace.body.id}`)
      .auth(member.body.accessToken, { type: 'bearer' })
      .expect(200)
      .expect([task.body]);
    await request(server)
      .patch(`/tasks/${task.body.id}`)
      .auth(member.body.accessToken, { type: 'bearer' })
      .send({ completed: true })
      .expect(403);
    await request(server)
      .patch(`/workspaces/${workspace.body.id}/members/1`)
      .auth(member.body.accessToken, { type: 'bearer' })
      .send({ role: 'admin' })
      .expect(403);
  });

  it('scopes task comments, activity, saved views, and reminder preferences', async () => {
    const server = app.getHttpServer();
    const task = await request(server)
      .post('/tasks')
      .auth(accessToken, { type: 'bearer' })
      .send({ title: 'Plan release' })
      .expect(201);
    await request(server)
      .post(`/tasks/${task.body.id}/comments`)
      .auth(accessToken, { type: 'bearer' })
      .send({ content: 'Keep the release checklist current.' })
      .expect(201);
    await request(server)
      .get(`/tasks/${task.body.id}/comments`)
      .auth(accessToken, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          content: 'Keep the release checklist current.',
          username: 'test-user',
        });
      });
    await request(server)
      .get(`/tasks/${task.body.id}/activity`)
      .auth(accessToken, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) =>
        expect(body.map((item: { action: string }) => item.action)).toEqual([
          'comment.created',
          'task.created',
        ]),
      );

    const savedView = await request(server)
      .post('/saved-views')
      .auth(accessToken, { type: 'bearer' })
      .send({
        name: 'High priority',
        filters: { filter: 'active', priorityFilter: 'high' },
      })
      .expect(201);
    await request(server)
      .get('/saved-views')
      .auth(accessToken, { type: 'bearer' })
      .expect([savedView.body]);
    await request(server)
      .patch('/notifications/settings')
      .auth(accessToken, { type: 'bearer' })
      .send({
        timezone: 'America/New_York',
        reminderTime: '08:30',
        channels: ['email'],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          timezone: 'America/New_York',
          reminderTime: '08:30',
          channels: ['email'],
        });
      });
    await request(server)
      .post('/notifications/push-subscriptions')
      .auth(accessToken, { type: 'bearer' })
      .send({
        endpoint: 'https://127.0.0.1/internal',
        keys: { p256dh: 'public-key', auth: 'auth-key' },
      })
      .expect(400);

    const otherUser = await request(server)
      .post('/auth/register')
      .send({
        username: 'other-user',
        email: 'other@example.com',
        password: 'secure-password',
      })
      .expect(201);
    await request(server)
      .get('/saved-views')
      .auth(otherUser.body.accessToken, { type: 'bearer' })
      .expect([]);
    await request(server)
      .delete(`/saved-views/${savedView.body.id}`)
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
    if (originalDatabasePath === undefined) {
      delete process.env.TASK_DATABASE_PATH;
    } else {
      process.env.TASK_DATABASE_PATH = originalDatabasePath;
    }
    if (originalLegacyDatabasePath === undefined) {
      delete process.env.TASK_LEGACY_DATABASE_PATH;
    } else {
      process.env.TASK_LEGACY_DATABASE_PATH = originalLegacyDatabasePath;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    await rm(databaseDirectory, { recursive: true, force: true });
  });
});
