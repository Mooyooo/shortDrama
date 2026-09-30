import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  signStreamWebhook,
  verifyStreamWebhook,
} from '../src/modules/webhooks/stream-signature.js';
import { processWebhookEvents } from '../src/modules/webhooks/worker.js';
import { freshDatabase, seedSeries, testApp, WEBHOOK_SECRET } from './helpers.js';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await freshDatabase();
});

afterAll(() => pool.end());

function deliver(
  body: object,
  { secret = WEBHOOK_SECRET, time = Math.floor(Date.now() / 1000) } = {},
) {
  const raw = JSON.stringify(body);
  return request(testApp(pool))
    .post('/v1/webhooks/stream')
    .set('Content-Type', 'application/json')
    .set('Webhook-Signature', signStreamWebhook(secret, time, raw))
    .send(raw);
}

describe('verifyStreamWebhook', () => {
  it('accepts a fresh, correct signature and rejects tampering or old deliveries', () => {
    const now = Date.now();
    const time = Math.floor(now / 1000);
    const header = signStreamWebhook('s', time, '{"a":1}');
    expect(verifyStreamWebhook('s', header, '{"a":1}', now)).toBe(true);
    expect(verifyStreamWebhook('s', header, '{"a":2}', now)).toBe(false);
    expect(verifyStreamWebhook('other', header, '{"a":1}', now)).toBe(false);
    expect(verifyStreamWebhook('s', header, '{"a":1}', now + 10 * 60 * 1000)).toBe(false);
    expect(verifyStreamWebhook('s', undefined, '{"a":1}', now)).toBe(false);
  });
});

describe('POST /v1/webhooks/stream', () => {
  it('rejects a bad signature', async () => {
    await deliver({ uid: 'x', status: { state: 'ready' } }, { secret: 'wrong' }).expect(401);
  });

  it('stores an event once, however often it is delivered', async () => {
    const event = { uid: 'dupe', status: { state: 'ready' } };
    await deliver(event).expect(200);
    await deliver(event).expect(200);
    const { rows } = await pool.query(`SELECT * FROM webhook_events WHERE event_id = 'dupe:ready'`);
    expect(rows).toHaveLength(1);
    await pool.query('DELETE FROM webhook_events');
  });

  it('lets the worker mark the video ready and swap it into its episode', async () => {
    const { seriesId } = await seedSeries(pool, { slug: 'swap', episodes: 1 });
    const pending = await pool.query<{ id: string }>(
      `INSERT INTO video_assets (stream_uid) VALUES ('new-upload') RETURNING id`,
    );
    await pool.query('UPDATE episodes SET pending_video_id = $2 WHERE series_id = $1', [
      seriesId,
      pending.rows[0].id,
    ]);

    await deliver({
      uid: 'new-upload',
      readyToStream: true,
      status: { state: 'ready' },
      duration: 95.5,
      thumbnail: 'https://example.com/thumb.jpg',
      input: { width: 1080, height: 1920 },
    }).expect(200);
    expect(await processWebhookEvents(pool)).toBe(1);

    const video = await pool.query(`SELECT * FROM video_assets WHERE stream_uid = 'new-upload'`);
    expect(video.rows[0]).toMatchObject({
      status: 'ready',
      duration_seconds: '95.5',
      width: 1080,
      height: 1920,
      thumbnail_url: 'https://example.com/thumb.jpg',
    });
    const episode = await pool.query(
      'SELECT video_id, pending_video_id FROM episodes WHERE series_id = $1',
      [seriesId],
    );
    expect(episode.rows[0]).toEqual({ video_id: pending.rows[0].id, pending_video_id: null });
  });

  it('retries an event for an unknown video, then marks it failed', async () => {
    await deliver({ uid: 'ghost', status: { state: 'ready' } }).expect(200);
    for (let i = 0; i < 5; i++) await processWebhookEvents(pool);
    const { rows } = await pool.query(
      `SELECT status, attempts, error FROM webhook_events WHERE event_id = 'ghost:ready'`,
    );
    expect(rows[0]).toMatchObject({ status: 'failed', attempts: 5 });
    expect(rows[0].error).toMatch(/No video_assets row/);
  });
});
