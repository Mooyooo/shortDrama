import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { freshDatabase, seedSeries, testApp } from './helpers.js';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await freshDatabase();
  await seedSeries(pool, { slug: 'live-one', tags: ['Revenge', 'Billionaire'], episodes: 3 });
  await seedSeries(pool, { slug: 'still-draft', status: 'draft' });
  await seedSeries(pool, {
    slug: 'next-week',
    releaseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });
  const { episodeIds } = await seedSeries(pool, { slug: 'with-override', freeEpisodes: 1 });
  await pool.query('UPDATE episodes SET coin_price = 50 WHERE id = $1', [episodeIds[3]]);
});

afterAll(() => pool.end());

describe('GET /v1/catalog/series', () => {
  it('lists only live series, with tags and episode counts, cacheable at the edge', async () => {
    const res = await request(testApp(pool)).get('/v1/catalog/series').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const slugs = res.body.series.map((s: { slug: string }) => s.slug).sort();
    expect(slugs).toEqual(['live-one', 'with-override']);
    const live = res.body.series.find((s: { slug: string }) => s.slug === 'live-one');
    expect(live).toMatchObject({ tags: ['Billionaire', 'Revenge'], episodeCount: 3 });
  });
});

describe('GET /v1/catalog/series/:slug', () => {
  it('marks free and locked episodes and applies per-episode prices', async () => {
    const res = await request(testApp(pool)).get('/v1/catalog/series/with-override').expect(200);
    const episodes = res.body.series.episodes;
    expect(episodes.map((e: { free: boolean }) => e.free)).toEqual([true, false, false, false]);
    expect(episodes.map((e: { coinPrice: number }) => e.coinPrice)).toEqual([30, 30, 30, 50]);
    expect(episodes[0].durationSeconds).toBe(90);
  });

  it('hides drafts and scheduled series', async () => {
    await request(testApp(pool)).get('/v1/catalog/series/still-draft').expect(404);
    await request(testApp(pool)).get('/v1/catalog/series/next-week').expect(404);
  });
});
