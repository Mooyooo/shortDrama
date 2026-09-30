import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { processWebhookEvents } from './modules/webhooks/worker.js';

const WORKER_INTERVAL_MS = 5000;

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = createApp(pool, config);

const server = app.listen(config.port, () => {
  console.log(`shortDrama API listening on :${config.port}`);
});

// Applies queued webhooks. Runs in every API process; SKIP LOCKED keeps them from colliding.
const worker = setInterval(() => {
  processWebhookEvents(pool).catch((err) => console.error('webhook worker failed', err));
}, WORKER_INTERVAL_MS);

function shutdown() {
  clearInterval(worker);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
