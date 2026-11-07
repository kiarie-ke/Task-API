import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let databaseDirectory: string;
  const originalDatabasePath = process.env.TASK_DATABASE_PATH;
  const originalJwtSecret = process.env.JWT_SECRET;
  let accessToken: string;

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'task-api-e2e-'));
    process.env.TASK_DATABASE_PATH = join(databaseDirectory, 'tasks.json');
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
        },
      ]);
  });

  it('only allows users to access their own tasks', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Private task' })
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
      .get('/tasks/1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({
        id: 1,
        title: 'Private task',
        completed: false,
        ownerId: 1,
      });
  });

  it('keeps pre-authentication tasks inaccessible to users', async () => {
    await app.close();
    await writeFile(
      join(databaseDirectory, 'tasks.json'),
      JSON.stringify({
        tasks: [{ id: 1, title: 'Legacy task', completed: false }],
        nextId: 2,
      }),
    );

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

    await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .get('/tasks/1')
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(404);
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
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    await rm(databaseDirectory, { recursive: true, force: true });
  });
});
