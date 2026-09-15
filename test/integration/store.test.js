import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStore } from '../../src/store.js';

test('PostgreSQL persists tasks across connections and repeated migrations', async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to an isolated test database');
  const store = createStore(process.env.TEST_DATABASE_URL);
  const second = createStore(process.env.TEST_DATABASE_URL);
  const id = randomUUID();
  try {
    await store.migrate();
    await store.ready();
    const title = "Learn SQL'); DROP TABLE tasks; --";
    const task = await store.create(id, title);
    assert.equal(task.title, title);
    assert.equal(task.completed, false);
    await second.migrate();
    assert.equal((await second.get(id)).title, title);
    assert.equal((await second.update(id, { completed: true })).completed, true);
    assert.equal((await store.update(id, { completed: false })).completed, false);
    const updated = await store.update(id, { title: 'Renamed' });
    assert.equal(updated.title, 'Renamed');
    assert.ok(updated.updated_at >= updated.created_at);
    assert.ok((await store.list(100, 0)).some(row => row.id === id));
    assert.equal(await store.remove(id), true);
    assert.equal(await second.get(id), undefined);
    assert.equal(await store.remove(id), false);
    assert.equal(await store.update(id, { completed: true }), undefined);
  } finally {
    await store.remove(id).catch(() => {});
    await Promise.all([store.close(), second.close()]);
  }
});
