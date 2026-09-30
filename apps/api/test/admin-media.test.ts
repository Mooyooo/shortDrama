import type pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { processWebhookEvents } from '../src/modules/webhooks/worker.js';
import {
  ADMIN_TOKEN,
  freshDatabase,
  seedSeries,
  signStreamWebhookFor,
  testApp,
  testConfig,
} from './helpers.js';

let pool: pg.Pool;
let seriesId: string;
let episodeIds: string[];
const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };
const app = () => testApp(pool, testConfig({ accountId: 'acct', apiToken: 'token' }));

const ok = (result: unknown) =>
  new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

beforeAll(async () => {
  pool = await freshDatabase();
  ({ seriesId, episodeIds } = await seedSeries(pool, { slug: 'media', episodes: 2 }));
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => pool.end());

describe('image uploads', () => {
  it('returns a one-time upload link and the delivery address built from the account hash', async () => {
    const fetchMock = vi.fn(async () =>
      ok({ id: 'img-123', uploadURL: 'https://upload.imagedelivery.net/HASH42/img-123' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await request(app()).post('/v1/admin/images/upload').set(admin).expect(201);
    expect(res.body).toEqual({
      ok: true,
      uploadUrl: 'https://upload.imagedelivery.net/HASH42/img-123',
      deliveryUrl: 'https://imagedelivery.net/HASH42/img-123/public',
    });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct/images/v2/direct_upload',
    );
  });

  it('reports Cloudflare errors instead of pretending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, errors: [{ message: 'not entitled' }] }), {
            status: 403,
          }),
      ),
    );
    await request(app()).post('/v1/admin/images/upload').set(admin).expect(500);
  });
});

describe('subtitles', () => {
  const vtt = 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n';

  it('uploads a WebVTT file to the episode video and records the language', async () => {
    const fetchMock = vi.fn(async () => ok({}));
    vi.stubGlobal('fetch', fetchMock);
    await request(app())
      .put(`/v1/admin/episodes/${episodeIds[0]}/subtitles/en`)
      .set(admin)
      .set('Content-Type', 'text/vtt')
      .send(vtt)
      .expect(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/accounts\/acct\/stream\/uid-\d+\/captions\/en$/);
    expect(init.method).toBe('PUT');

    const detail = await request(app()).get(`/v1/admin/series/${seriesId}`).set(admin).expect(200);
    expect(detail.body.series.episodes[0].subtitles).toEqual(['en']);
  });

  it('refuses files that are not WebVTT, bad languages, and episodes without a ready video', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({})),
    );
    await request(app())
      .put(`/v1/admin/episodes/${episodeIds[0]}/subtitles/en`)
      .set(admin)
      .set('Content-Type', 'text/plain')
      .send('1\n00:00:00,000 --> 00:00:02,000\nSRT, not VTT\n')
      .expect(400);
    await request(app())
      .put(`/v1/admin/episodes/${episodeIds[0]}/subtitles/English`)
      .set(admin)
      .set('Content-Type', 'text/vtt')
      .send(vtt)
      .expect(400);
    await pool.query('UPDATE episodes SET video_id = NULL WHERE id = $1', [episodeIds[1]]);
    await request(app())
      .put(`/v1/admin/episodes/${episodeIds[1]}/subtitles/en`)
      .set(admin)
      .set('Content-Type', 'text/vtt')
      .send(vtt)
      .expect(409);
  });

  it('deletes subtitles', async () => {
    const fetchMock = vi.fn(async () => ok({}));
    vi.stubGlobal('fetch', fetchMock);
    await request(app())
      .delete(`/v1/admin/episodes/${episodeIds[0]}/subtitles/en`)
      .set(admin)
      .expect(200);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('DELETE');
    await request(app())
      .delete(`/v1/admin/episodes/${episodeIds[0]}/subtitles/en`)
      .set(admin)
      .expect(404);
  });

  it('clears subtitles when a replacement video goes live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({})),
    );
    await request(app())
      .put(`/v1/admin/episodes/${episodeIds[0]}/subtitles/en`)
      .set(admin)
      .set('Content-Type', 'text/vtt')
      .send(vtt)
      .expect(200);
    const replacement = await pool.query<{ id: string }>(
      `INSERT INTO video_assets (stream_uid) VALUES ('replacement') RETURNING id`,
    );
    await pool.query('UPDATE episodes SET pending_video_id = $2 WHERE id = $1', [
      episodeIds[0],
      replacement.rows[0].id,
    ]);
    const raw = JSON.stringify({ uid: 'replacement', status: { state: 'ready' } });
    await request(app())
      .post('/v1/webhooks/stream')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', signStreamWebhookFor(raw))
      .send(raw)
      .expect(200);
    await processWebhookEvents(pool);
    const { rows } = await pool.query('SELECT 1 FROM subtitle_tracks WHERE episode_id = $1', [
      episodeIds[0],
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('trailer status', () => {
  it('is reported with the series', async () => {
    const detail = await request(app()).get(`/v1/admin/series/${seriesId}`).set(admin).expect(200);
    expect(detail.body.series).toHaveProperty('trailerStatus', null);
  });
});
