import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
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

  it('validates task input and task IDs', async () => {
    const server = app.getHttpServer();
    await request(server).post('/tasks').send({ title: 42 }).expect(400);
    await request(server).get('/tasks/not-a-number').expect(400);
    await request(server).get('/tasks/1').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
