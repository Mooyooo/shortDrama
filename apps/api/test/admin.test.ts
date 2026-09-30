import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_TOKEN, freshDatabase, readyVideo, testApp } from './helpers.js';

let pool: pg.Pool;
const auth = { Authorization: `Bearer ${ADMIN_TOKEN}` };

beforeAll(async () => {
  pool = await freshDatabase();
});

afterAll(() => pool.end());

describe('admin API', () => {
  it('requires the admin token', async () => {
    await request(testApp(pool)).get('/v1/admin/series').expect(401);
    await request(testApp(pool))
      .get('/v1/admin/series')
      .set('Authorization', 'Bearer nope')
      .expect(401);
  });

  it('validates new series', async () => {
    const res = await request(testApp(pool))
      .post('/v1/admin/series')
      .set(auth)
      .send({ slug: 'Not A Slug', title: 'x' })
      .expect(400);
    expect(res.body.error).toMatch(/slug/);
  });

  it('blocks publishing until the checks pass, then shows the series in the catalog', async () => {
    const app = testApp(pool);
    const created = await request(app)
      .post('/v1/admin/series')
      .set(auth)
      .send({ slug: 'first-drama', title: 'First Drama', freeEpisodes: 1 })
      .expect(201);
    const id = created.body.id;

    const blocked = await request(app)
      .patch(`/v1/admin/series/${id}`)
      .set(auth)
      .send({ status: 'published' })
      .expect(409);
    expect(blocked.body.problems).toEqual(['needs a cover image', 'needs at least one episode']);

    const video = await readyVideo(pool);
    await pool.query(`INSERT INTO episodes (series_id, number, video_id) VALUES ($1, 1, $2)`, [
      id,
      video.id,
    ]);
    await request(app)
      .patch(`/v1/admin/series/${id}`)
      .set(auth)
      .send({ coverUrl: 'https://example.com/c.jpg' })
      .expect(200);
    await request(app)
      .patch(`/v1/admin/series/${id}`)
      .set(auth)
      .send({ status: 'published' })
      .expect(200);

    const catalog = await request(app).get('/v1/catalog/series/first-drama').expect(200);
    expect(catalog.body.series.episodes).toHaveLength(1);
  });

  it('refuses a duplicate slug', async () => {
    await request(testApp(pool))
      .post('/v1/admin/series')
      .set(auth)
      .send({ slug: 'first-drama', title: 'Again' })
      .expect(409);
  });

  it('answers 503 for uploads until Cloudflare Stream is configured', async () => {
    const list = await request(testApp(pool)).get('/v1/admin/series').set(auth).expect(200);
    await request(testApp(pool))
      .post(`/v1/admin/series/${list.body.series[0].id}/episodes/2/upload`)
      .set(auth)
      .expect(503);
  });
});
