import { Router } from 'express';
import type pg from 'pg';

import { getSeriesDetail, listSeries } from './queries.js';

// Same answer for every viewer, so Cloudflare's edge may cache it for a minute.
const CACHE_PUBLIC_60S = 'public, max-age=60';

export function catalogRoutes(pool: pg.Pool) {
  const router = Router();

  router.get('/series', async (_req, res) => {
    const series = await listSeries(pool);
    res.set('Cache-Control', CACHE_PUBLIC_60S).json({ ok: true, series });
  });

  router.get('/series/:slug', async (req, res) => {
    const series = await getSeriesDetail(pool, req.params.slug);
    if (!series) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.set('Cache-Control', CACHE_PUBLIC_60S).json({ ok: true, series });
  });

  return router;
}
