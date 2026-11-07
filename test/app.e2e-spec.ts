import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let databaseDirectory: string;
  const originalDatabasePath = process.env.TASK_DATABASE_PATH;
  const originalLegacyDatabasePath = process.env.TASK_LEGACY_DATABASE_PATH;
  const originalJwtSecret = process.env.JWT_SECRET;
  let accessToken: string;

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
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'test-user',
        email: 'test@example.com',
        password: 'secure-password',
      })
      .expect(201);
    accessToken = registration.body.accessToken;
  });

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
