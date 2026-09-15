import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const local = existsSync('.env') ? Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; })) : {};
const token = process.env.API_TOKEN ?? local.API_TOKEN;
const base = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? local.API_PORT ?? 3080}`;
assert.ok(token, 'API_TOKEN is required');
async function request(path, method = 'GET', body) {
  return fetch(base + path, { method, signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
let id;
try {
  assert.equal((await request('/health/ready')).status, 200);
  assert.equal((await fetch(base + '/tasks', { signal: AbortSignal.timeout(10000) })).status, 401);
  const created = await request('/tasks', 'POST', { title: 'DevOps smoke test' });
  assert.equal(created.status, 201);
  id = (await created.json()).id;
  assert.equal((await request(`/tasks/${id}`)).status, 200);
  const updated = await request(`/tasks/${id}`, 'PATCH', { completed: true });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).completed, true);
  assert.equal((await request('/tasks')).status, 200);
  const metrics = await request('/metrics');
  assert.equal(metrics.status, 200);
  assert.match(await metrics.text(), /http_requests_total/);
  assert.equal((await request(`/tasks/${id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/tasks/${id}`)).status, 404);
  id = undefined;
  console.log('Smoke passed: readiness, authentication, CRUD, metrics.');
} finally {
  if (id) await request(`/tasks/${id}`, 'DELETE').catch(() => {});
}
