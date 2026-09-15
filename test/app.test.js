import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const token = 'test-token-that-is-at-least-24-characters';
const auth = { Authorization: `Bearer ${token}` };
function fixture(overrides = {}) {
  const tasks = new Map();
  const store = {
    async ready() {},
    async list(limit, offset) { return [...tasks.values()].slice(offset, offset + limit); },
    async get(id) { return tasks.get(id); },
    async create(id, title) { const task = { id, title, completed: false }; tasks.set(id, task); return task; },
    async update(id, fields) { if (!tasks.has(id)) return undefined; const task = { ...tasks.get(id), ...fields }; tasks.set(id, task); return task; },
    async remove(id) { return tasks.delete(id); },
    ...overrides
  };
  const logs = [];
  return { app: createApp({ store, token, defaultMetrics: false, logger: line => logs.push(JSON.parse(line)) }), logs };
}

test('CRUD: create, fetch, list, complete, reopen, rename, delete', async () => {
  const { app } = fixture();
  const created = await request(app).post('/tasks').set(auth).send({ title: '  Learn CI  ' }).expect(201);
  const id = created.body.id;
  assert.equal(created.body.title, 'Learn CI');
  assert.equal(created.headers.location, `/tasks/${id}`);
  await request(app).get(`/tasks/${id}`).set(auth).expect(200);
  const list = await request(app).get('/tasks?limit=1&offset=0').set(auth).expect(200);
  assert.equal(list.body.tasks.length, 1);
  const completed = await request(app).patch(`/tasks/${id}`).set(auth).send({ completed: true }).expect(200);
  assert.equal(completed.body.completed, true);
  const reopened = await request(app).patch(`/tasks/${id}`).set(auth).send({ completed: false, title: 'Learn CD' }).expect(200);
  assert.equal(reopened.body.completed, false);
  assert.equal(reopened.body.title, 'Learn CD');
  await request(app).delete(`/tasks/${id}`).set(auth).expect(204);
  await request(app).get(`/tasks/${id}`).set(auth).expect(404);
  await request(app).delete(`/tasks/${id}`).set(auth).expect(404);
});

test('tasks and metrics require valid authentication', async () => {
  const { app } = fixture();
  for (const path of ['/tasks', '/metrics']) {
    await request(app).get(path).expect(401);
    await request(app).get(path).set('Authorization', 'Bearer wrong').expect(401);
  }
  await request(app).post('/tasks').send({ title: 'Forbidden' }).expect(401);
  await request(app).get('/health/live').expect(200);
  await request(app).get('/health/ready').expect(200);
  assert.throws(() => createApp({ store: {}, token: 'short' }), /API_TOKEN/);
});

test('rejects invalid bodies, identifiers and pagination', async () => {
  const { app } = fixture();
  for (const body of [{}, { title: '' }, { title: '  ' }, { title: 3 }, { title: 'x'.repeat(201) }, { title: 'ok', completed: true }, []]) {
    await request(app).post('/tasks').set(auth).send(body).expect(400);
  }
  const created = await request(app).post('/tasks').set(auth).send({ title: 'Valid' }).expect(201);
  for (const body of [{}, { completed: 'true' }, { completed: null }, { title: null }, { unknown: 1 }]) {
    await request(app).patch(`/tasks/${created.body.id}`).set(auth).send(body).expect(400);
  }
  await request(app).get('/tasks/not-a-uuid').set(auth).expect(400);
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'limit=a', 'limit=1&limit=2', 'offset=2147483648']) {
    await request(app).get(`/tasks?${query}`).set(auth).expect(400);
  }
  await request(app).post('/tasks').set(auth).set('Content-Type', 'application/json').send('{broken').expect(400);
  await request(app).post('/tasks').set(auth).send({ title: 'a'.repeat(17000) }).expect(413);
});

test('database outage affects readiness but not liveness; errors do not expose secrets', async () => {
  const { app, logs } = fixture({ async ready() { throw new Error('secret connection string'); }, async list() { throw new Error('secret connection string'); } });
  await request(app).get('/health/live').expect(200);
  await request(app).get('/health/ready').expect(503);
  const failure = await request(app).get('/tasks').set(auth).expect(500);
  assert.equal(failure.body.error, 'Internal server error');
  assert.equal(failure.body.requestId, failure.headers['x-request-id']);
  const metrics = await request(app).get('/metrics').set(auth).expect(200);
  assert.match(metrics.text, /app_database_ready 0/);
  assert.ok(!JSON.stringify(logs).includes('secret connection string'));
});

test('metrics use bounded route labels and logs exclude credentials and task content', async () => {
  const { app, logs } = fixture();
  await request(app).get('/unknown-private-value').expect(404);
  const created = await request(app).post('/tasks').set(auth).send({ title: 'private-task-title' }).expect(201);
  await request(app).get(`/tasks/${created.body.id}`).set(auth).expect(200);
  const metrics = await request(app).get('/metrics').set(auth).expect(200);
  assert.match(metrics.text, /route="\/tasks\/:id"/);
  assert.match(metrics.text, /route="unmatched"/);
  assert.match(metrics.text, /app_database_ready 1/);
  for (const privateValue of [token, 'private-task-title', created.body.id, 'unknown-private-value']) {
    assert.ok(!JSON.stringify(logs).includes(privateValue));
  }
});
