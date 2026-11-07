import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let databaseDirectory: string;
  const originalDatabasePath = process.env.TASK_DATABASE_PATH;

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'task-api-e2e-'));
    process.env.TASK_DATABASE_PATH = join(databaseDirectory, 'tasks.json');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
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
      .send({ title: 'Test task', description: 'Task details' })
      .expect(201);

    expect(created.body).toEqual({
      id: 1,
      title: 'Test task',
      description: 'Task details',
      completed: false,
    });

    await request(server)
      .patch('/tasks/1')
      .send({ completed: true })
      .expect(200)
      .expect({ ...created.body, completed: true });

    await request(server)
      .delete('/tasks/1')
      .expect(200)
      .expect({ ...created.body, completed: true });
  });

  it('does not reuse IDs after a task is deleted', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
      .send({ title: 'First task' })
      .expect(201);
    await request(server).delete('/tasks/1').expect(200);
    await request(server)
      .post('/tasks')
      .send({ title: 'Second task' })
      .expect(201)
      .expect(({ body }) => expect(body.id).toBe(2));

    await request(server).get('/tasks/1').expect(404);
  });

  it('persists tasks across application restarts', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
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
      .expect(200)
      .expect([{ id: 1, title: 'Persistent task', completed: false }]);
  });

  it('validates task input and task IDs', async () => {
    const server = app.getHttpServer();
    await request(server).post('/tasks').send({ title: 42 }).expect(400);
    await request(server).get('/tasks/not-a-number').expect(400);
    await request(server).get('/tasks/1').expect(404);
  });

  afterEach(async () => {
    await app.close();
    if (originalDatabasePath === undefined) {
      delete process.env.TASK_DATABASE_PATH;
    } else {
      process.env.TASK_DATABASE_PATH = originalDatabasePath;
    }
    await rm(databaseDirectory, { recursive: true, force: true });
  });
});
