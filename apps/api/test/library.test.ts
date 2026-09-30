import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { freshDatabase, seedSeries, testApp } from './helpers.js';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await freshDatabase();
  await seedSeries(pool, { slug: 'lib-one', episodes: 3 });
  await seedSeries(pool, { slug: 'lib-two', episodes: 3 });
});

afterAll(() => pool.end());

async function viewer() {
  const res = await request(testApp(pool)).post('/v1/auth/guest').expect(201);
  return { Authorization: `Bearer ${res.body.token}` };
}

const sync = (auth: Record<string, string>, changes: unknown) =>
  request(testApp(pool)).post('/v1/me/library').set(auth).send({ changes });

const t = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

describe('library sync', () => {
  it('stores progress, saves and likes, and returns the whole library', async () => {
    const auth = await viewer();
    const res = await sync(auth, [
      { type: 'progress', series: 'lib-one', episode: 2, seconds: 30.5, duration: 90, at: t(3) },
      { type: 'save', series: 'lib-one', saved: true, at: t(3) },
      { type: 'like', series: 'lib-one', episode: 2, liked: true, at: t(3) },
    ]).expect(200);
    expect(res.body.skipped).toBe(0);
    expect(res.body.library.progress).toEqual([
      expect.objectContaining({ series: 'lib-one', episode: 2, seconds: 30.5, duration: 90 }),
    ]);
    expect(res.body.library.saved.map((s: { series: string }) => s.series)).toEqual(['lib-one']);
    expect(res.body.library.likes).toEqual([{ series: 'lib-one', episode: 2 }]);

    const again = await request(testApp(pool)).get('/v1/me/library').set(auth).expect(200);
    expect(again.body.library).toEqual(res.body.library);
  });

  it('keeps the newest change when an older one arrives later', async () => {
    const auth = await viewer();
    await sync(auth, [
      { type: 'save', series: 'lib-two', saved: false, at: t(1) },
      { type: 'progress', series: 'lib-two', episode: 3, seconds: 5, duration: 90, at: t(1) },
    ]).expect(200);
    // From a phone that was offline: older than what the server has.
    const late = await sync(auth, [
      { type: 'save', series: 'lib-two', saved: true, at: t(10) },
      { type: 'progress', series: 'lib-two', episode: 1, seconds: 80, duration: 90, at: t(10) },
    ]).expect(200);
    expect(late.body.library.saved).toEqual([]);
    expect(late.body.library.progress[0]).toMatchObject({ episode: 3, seconds: 5 });
  });

  it('removes likes and saves, and keeps them removed', async () => {
    const auth = await viewer();
    await sync(auth, [{ type: 'like', series: 'lib-one', episode: 1, liked: true, at: t(5) }]);
    const unliked = await sync(auth, [
      { type: 'like', series: 'lib-one', episode: 1, liked: false, at: t(2) },
    ]).expect(200);
    expect(unliked.body.library.likes).toEqual([]);
  });

  it('skips series and episodes that do not exist', async () => {
    const auth = await viewer();
    const res = await sync(auth, [
      { type: 'save', series: 'no-such-series', saved: true, at: t(1) },
      { type: 'like', series: 'lib-one', episode: 99, liked: true, at: t(1) },
      { type: 'save', series: 'lib-one', saved: true, at: t(1) },
    ]).expect(200);
    expect(res.body.skipped).toBe(2);
    expect(res.body.library.saved).toHaveLength(1);
  });

  it('treats a timestamp from the future as now', async () => {
    const auth = await viewer();
    const future = new Date(Date.now() + 24 * 3600_000).toISOString();
    await sync(auth, [{ type: 'save', series: 'lib-one', saved: true, at: future }]).expect(200);
    // A genuine later change still wins, so a fast phone clock can't lock an item.
    const res = await sync(auth, [
      {
        type: 'save',
        series: 'lib-one',
        saved: false,
        at: new Date(Date.now() + 1000).toISOString(),
      },
    ]).expect(200);
    expect(res.body.library.saved).toEqual([]);
  });

  it('refuses malformed changes and requires a viewer', async () => {
    const auth = await viewer();
    await sync(auth, 'nope').expect(400);
    await sync(auth, [{ type: 'save', series: 'lib-one', saved: 'yes', at: t(1) }]).expect(400);
    await sync(auth, [{ type: 'teleport', series: 'lib-one', at: t(1) }]).expect(400);
    await sync(auth, [{ type: 'save', series: 'lib-one', saved: true, at: 'yesterday' }]).expect(
      400,
    );
    const tooMany = Array.from({ length: 501 }, () => ({
      type: 'save',
      series: 'lib-one',
      saved: true,
      at: t(1),
    }));
    await sync(auth, tooMany).expect(400);
    await request(testApp(pool)).get('/v1/me/library').expect(401);
  });
});
