import type pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { DEV_SAMPLE_PREFIX } from '../src/modules/playback/links.js';
import { freshDatabase, testApp, testConfig } from './helpers.js';

const SAMPLE = 'https://example.com/sample.m3u8';
let pool: pg.Pool;
let episodeId: string;

beforeAll(async () => {
  pool = await freshDatabase();
  const video = await pool.query<{ id: string }>(
    `INSERT INTO video_assets (stream_uid, status) VALUES ($1, 'ready') RETURNING id`,
    [`${DEV_SAMPLE_PREFIX}${SAMPLE}`],
  );
  const series = await pool.query<{ id: string }>(
    `INSERT INTO series (slug, title, status, cover_url, trailer_video_id)
     VALUES ('dev', 'Dev', 'published', 'https://example.com/c.jpg', $1) RETURNING id`,
    [video.rows[0].id],
  );
  const episode = await pool.query<{ id: string }>(
    `INSERT INTO episodes (series_id, number, status, video_id) VALUES ($1, 1, 'published', $2)
     RETURNING id`,
    [series.rows[0].id, video.rows[0].id],
  );
  episodeId = episode.rows[0].id;
});

afterAll(() => pool.end());

describe('development sample videos', () => {
  const withSamples = () => testApp(pool, { ...testConfig(), devSampleVideos: true });
  const withoutSamples = () => testApp(pool, { ...testConfig(), devSampleVideos: false });

  it('play only when DEV_SAMPLE_VIDEOS is on', async () => {
    const on = await request(withSamples()).get(`/v1/playback/episodes/${episodeId}`).expect(200);
    expect(on.body.playback.hlsUrl).toBe(SAMPLE);
    await request(withoutSamples()).get(`/v1/playback/episodes/${episodeId}`).expect(503);
  });

  it('give the catalog a trailer link', async () => {
    const on = await request(withSamples()).get('/v1/catalog/series/dev').expect(200);
    expect(on.body.series.trailerUrl).toBe(SAMPLE);
    const off = await request(withoutSamples()).get('/v1/catalog/series/dev').expect(200);
    expect(off.body.series.trailerUrl).toBeNull();
  });
});

describe('loadConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses DEV_SAMPLE_VIDEOS in production', () => {
    process.env.DEV_SAMPLE_VIDEOS = 'true';
    process.env.NODE_ENV = 'production';
    expect(() => loadConfig()).toThrow(/must not be enabled in production/);
  });
});
