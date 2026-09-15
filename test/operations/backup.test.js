import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

test('backup restores a real task into a new database and refuses overwrite', async () => {
  // Deliberately targets this local Compose stack, never a remote BASE_URL.
  const env = Object.fromEntries(readFileSync('.env', 'utf8').trim().split('\n').filter(line => line && !line.startsWith('#')).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
  }));
  const base = `http://127.0.0.1:${env.API_PORT ?? 3080}`;
  const headers = { Authorization: `Bearer ${env.API_TOKEN}`, 'Content-Type': 'application/json' };
  const target = `devops_restore_test_${randomBytes(6).toString('hex')}`;
  const docker = args => execFileSync('docker', ['compose', 'exec', '-T', 'db', ...args], { encoding: 'utf8', timeout: 30000 });
  let id, file, restored = false;
  try {
    const response = await fetch(base + '/tasks', { method: 'POST', headers, body: JSON.stringify({ title: 'Backup verification marker' }), signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 201);
    id = (await response.json()).id;
    assert.match(id, /^[0-9a-f-]{36}$/);
    const output = execFileSync('bash', ['scripts/backup.sh'], { encoding: 'utf8', timeout: 30000 });
    file = output.trim().replace('Backup saved: ', '');
    assert.match(file, /^backups\/tasks-[A-Za-z0-9-]+$/);
    execFileSync('bash', ['scripts/restore.sh', file, target], { encoding: 'utf8', timeout: 30000 });
    restored = true;
    const query = `SELECT title FROM tasks WHERE id = '${id}'`;
    const title = docker(['sh', '-c', 'psql -U "$POSTGRES_USER" -d "$1" -tAc "$2"', 'sh', target, query]).trim();
    assert.equal(title, 'Backup verification marker');
    assert.throws(() => execFileSync('bash', ['scripts/restore.sh', file, target], { encoding: 'utf8', timeout: 30000, stdio: 'pipe' }));
    const titleAfterRefusal = docker(['sh', '-c', 'psql -U "$POSTGRES_USER" -d "$1" -tAc "$2"', 'sh', target, query]).trim();
    assert.equal(titleAfterRefusal, title);
  } finally {
    if (id) {
      const deleted = await fetch(`${base}/tasks/${id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(10000) });
      assert.equal(deleted.status, 204);
    }
    if (restored) docker(['sh', '-c', 'dropdb -U "$POSTGRES_USER" "$1"', 'sh', target]);
    if (file && /^backups\/tasks-[A-Za-z0-9-]+$/.test(file)) unlinkSync(file);
  }
});
