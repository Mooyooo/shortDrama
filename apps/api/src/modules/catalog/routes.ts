import { Router } from 'express';
import type pg from 'pg';

import type { Config } from '../../config.js';
import { createLinker } from '../playback/links.js';
import { getSeriesDetail, listSeries } from './queries.js';

// Same answer for every viewer, so Cloudflare's edge may cache it for a minute.
const CACHE_PUBLIC_60S = 'public, max-age=60';

export function catalogRoutes(pool: pg.Pool, config: Config) {
  const router = Router();
  const link = createLinker(config);

  router.get('/series', async (_req, res) => {
    const series = await listSeries(pool, link);
    res.set('Cache-Control', CACHE_PUBLIC_60S).json({ ok: true, series });
  });

  router.get('/series/:slug', async (req, res) => {
    const series = await getSeriesDetail(pool, link, req.params.slug);
    if (!series) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.set('Cache-Control', CACHE_PUBLIC_60S).json({ ok: true, series });
  });

  return router;
}
