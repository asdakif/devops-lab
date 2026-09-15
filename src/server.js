import { createApp } from './app.js';
import { createStore } from './store.js';

const store = createStore(process.env.DATABASE_URL);
try {
  const app = createApp({ store, token: process.env.API_TOKEN, version: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.APP_VERSION ?? 'dev' });
  await store.migrate();
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', event: 'started', port })));
  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
    server.close(async () => {
      try { await store.close(); clearTimeout(timer); process.exit(0); }
      catch { process.exit(1); }
    });
  }
  server.on('error', async (error) => {
    console.error(JSON.stringify({ level: 'error', event: 'listen_failed', code: error.code }));
    await store.close(); process.exitCode = 1;
  });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} catch (error) {
  console.error(JSON.stringify({ level: 'error', event: 'startup_failed', code: error.code ?? 'invalid_configuration' }));
  await store.close(); process.exitCode = 1;
}
