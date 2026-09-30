import express, { type NextFunction, type Request, type Response } from 'express';
import type pg from 'pg';

import type { Config } from './config.js';
import { adminRoutes } from './modules/admin/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { commentRoutes } from './modules/comments/routes.js';
import { meRoutes } from './modules/me/routes.js';
import { playbackRoutes } from './modules/playback/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';

// Responses are always `{ ok: true, ...data }` or `{ ok: false, error }`, as in socialManager.
export function createApp(pool: pg.Pool, config: Config) {
  const app = express();
  app.disable('x-powered-by');
  // Behind Cloudflare and Caddy: trust their X-Forwarded-For for client IPs.
  app.set('trust proxy', true);

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  // Webhooks read their raw body for signature checks, so they mount before the JSON parser.
  app.use('/v1/webhooks', webhookRoutes(pool, config));
  app.use(express.json({ limit: '100kb' }));
  app.use('/v1/auth', authRoutes(pool));
  app.use('/v1/me', meRoutes(pool));
  app.use('/v1/catalog', catalogRoutes(pool));
  app.use('/v1/playback', playbackRoutes(pool, config));
  app.use('/v1', commentRoutes(pool));
  app.use('/v1/admin', adminRoutes(pool, config));

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if ((err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ ok: false, error: 'bad_json' });
      return;
    }
    console.error(err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  });

  return app;
}
