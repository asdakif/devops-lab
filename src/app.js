import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from '@prometheus-io/client';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validTitle = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createApp({ store, token, version = 'dev', logger = console.log, defaultMetrics = true }) {
  if (!token || token.length < 24) throw new Error('API_TOKEN must contain at least 24 characters');
  const app = express();
  app.disable('x-powered-by');
  const registry = new Registry();
  if (defaultMetrics) collectDefaultMetrics({ register: registry });
  const requests = new Counter({ name: 'http_requests_total', help: 'HTTP requests', labelNames: ['method', 'route', 'status'], registers: [registry] });
  const duration = new Histogram({ name: 'http_request_duration_seconds', help: 'HTTP latency', labelNames: ['method', 'route'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [registry] });
  new Gauge({ name: 'app_database_ready', help: 'Database reachable at scrape time', registers: [registry], async collect() {
    try { await store.ready(); this.set(1); } catch { this.set(0); }
  } });

  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path ?? (req.path.startsWith('/tasks') ? '/tasks/*' : 'unmatched');
      const method = ['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
      requests.inc({ method, route, status: String(res.statusCode) });
      duration.observe({ method, route }, elapsed);
      logger(JSON.stringify({ level: 'info', event: 'http_request', requestId: req.requestId, method, route, status: res.statusCode, durationMs: Math.round(elapsed * 1000) }));
    });
    next();
  });
  const authenticate = (req, res, next) => {
    const actual = Buffer.from(req.get('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };
  app.get('/', (_req, res) => res.json({ name: 'DevOps Task API', version, health: '/health/live', readiness: '/health/ready', tasks: '/tasks' }));
  app.get('/health/live', (_req, res) => res.json({ status: 'ok', version }));
  app.get('/health/ready', async (_req, res) => {
    try { await store.ready(); res.json({ status: 'ready', version }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.get('/metrics', authenticate, async (_req, res) => {
    res.set('Content-Type', registry.contentType).send(await registry.metrics());
  });
  app.use('/tasks', authenticate, express.json({ limit: '16kb' }));
  app.param('id', (req, res, next, id) => {
    if (!uuid.test(id)) return res.status(400).json({ error: 'Invalid task id' });
    next();
  });
  app.get('/tasks', async (req, res) => {
    const { limit = '50', offset = '0' } = req.query;
    if (typeof limit !== 'string' || typeof offset !== 'string' || !/^\d+$/.test(limit) || !/^\d+$/.test(offset) ||
        Number(limit) < 1 || Number(limit) > 100 || !Number.isSafeInteger(Number(offset)) || Number(offset) > 2147483647) {
      return res.status(400).json({ error: 'limit must be 1–100; offset must be 0–2147483647' });
    }
    res.json({ tasks: await store.list(Number(limit), Number(offset)) });
  });
  app.get('/tasks/:id', async (req, res) => {
    const task = await store.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  });
  app.post('/tasks', async (req, res) => {
    if (!isObject(req.body) || !validTitle(req.body.title) || Object.keys(req.body).some(key => key !== 'title')) {
      return res.status(400).json({ error: 'Only title is accepted; it must contain 1–200 characters' });
    }
    const task = await store.create(randomUUID(), req.body.title.trim());
    res.status(201).location(`/tasks/${task.id}`).json(task);
  });
  app.patch('/tasks/:id', async (req, res) => {
    const body = req.body;
    if (!isObject(body) || !Object.keys(body).length || Object.keys(body).some(key => !['title', 'completed'].includes(key)) ||
        ('title' in body && !validTitle(body.title)) || ('completed' in body && typeof body.completed !== 'boolean')) {
      return res.status(400).json({ error: 'Provide title (1–200 characters) and/or completed (boolean)' });
    }
    const task = await store.update(req.params.id, { ...body, ...('title' in body ? { title: body.title.trim() } : {}) });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  });
  app.delete('/tasks/:id', async (req, res) => {
    if (!await store.remove(req.params.id)) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    logger(JSON.stringify({ level: 'error', event: 'request_failed', requestId: req.requestId, code: error.code ?? error.type ?? 'internal_error' }));
    res.status(status).json({ error: status === 413 ? 'Payload too large' : status === 400 ? 'Invalid JSON' : 'Internal server error', requestId: req.requestId });
  });
  return app;
}
