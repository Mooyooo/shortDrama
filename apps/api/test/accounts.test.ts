import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creditCoins } from '../src/modules/wallet/wallet.js';
import { freshDatabase, seedSeries, testApp } from './helpers.js';

let pool: pg.Pool;
let seriesId: string;
let episodeIds: string[];

beforeAll(async () => {
  pool = await freshDatabase();
  ({ seriesId, episodeIds } = await seedSeries(pool, {
    slug: 'accounts',
    freeEpisodes: 2,
    coinPrice: 30,
  }));
});

afterAll(() => pool.end());

async function newGuest() {
  const res = await request(testApp(pool)).post('/v1/auth/guest').expect(201);
  return { token: res.body.token as string, id: res.body.viewer.id as string };
}

describe('guest accounts', () => {
  it('creates a guest with an empty wallet and a working token', async () => {
    const guest = await newGuest();
    expect(guest.token).toMatch(/^[\w-]{43}$/);
    const me = await request(testApp(pool))
      .get('/v1/me')
      .set('Authorization', `Bearer ${guest.token}`)
      .expect(200);
    expect(me.body.viewer).toEqual({ id: guest.id, isGuest: true, coins: 0 });
    expect(me.headers['cache-control']).toBe('private, no-store');
  });

  it('stores only a hash of the token', async () => {
    const guest = await newGuest();
    const { rows } = await pool.query('SELECT token_hash FROM sessions WHERE user_id = $1', [
      guest.id,
    ]);
    expect(rows[0].token_hash.toString('base64url')).not.toBe(guest.token);
  });

  it('rejects missing, wrong and signed-out tokens', async () => {
    const app = testApp(pool);
    await request(app).get('/v1/me').expect(401);
    await request(app).get('/v1/me').set('Authorization', 'Bearer not-a-token').expect(401);

    const guest = await newGuest();
    await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${guest.token}`)
      .expect(200);
    await request(app).get('/v1/me').set('Authorization', `Bearer ${guest.token}`).expect(401);
  });

  it('deletes the account and everything tied to it', async () => {
    const guest = await newGuest();
    await creditCoins(pool, guest.id, 50, 'bonus', `delete-test-${guest.id}`);
    await request(testApp(pool))
      .delete('/v1/me')
      .set('Authorization', `Bearer ${guest.token}`)
      .expect(200);
    const left = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM users WHERE id = $1) AS users,
              (SELECT COUNT(*)::int FROM coin_ledger WHERE user_id = $1) AS ledger,
              (SELECT COUNT(*)::int FROM sessions WHERE user_id = $1) AS sessions`,
      [guest.id],
    );
    expect(left.rows[0]).toEqual({ users: 0, ledger: 0, sessions: 0 });
  });
});

describe('unlocking and playing a locked episode', () => {
  it('goes from locked, to unlocked with coins, to playable', async () => {
    const app = testApp(pool);
    const guest = await newGuest();
    const auth = { Authorization: `Bearer ${guest.token}` };
    const locked = episodeIds[2];

    await request(app).get(`/v1/playback/episodes/${locked}`).set(auth).expect(402);

    const poor = await request(app).post(`/v1/me/unlocks/${locked}`).set(auth).expect(402);
    expect(poor.body).toMatchObject({ error: 'insufficient_coins', coins: 0, price: 30 });

    await creditCoins(pool, guest.id, 100, 'purchase', `txn-${guest.id}`);
    const unlocked = await request(app).post(`/v1/me/unlocks/${locked}`).set(auth).expect(200);
    expect(unlocked.body).toEqual({ ok: true, status: 'unlocked', coins: 70 });

    const again = await request(app).post(`/v1/me/unlocks/${locked}`).set(auth).expect(200);
    expect(again.body).toEqual({ ok: true, status: 'already_unlocked', coins: 70 });

    const list = await request(app)
      .get(`/v1/me/unlocks?seriesId=${seriesId}`)
      .set(auth)
      .expect(200);
    expect(list.body.episodeIds).toEqual([locked]);

    await request(app).get(`/v1/playback/episodes/${locked}`).set(auth).expect(200);
    // Another viewer's unlock doesn't carry over.
    await request(app).get(`/v1/playback/episodes/${locked}`).expect(402);
  });

  it('answers 404 for a malformed episode id instead of failing', async () => {
    const guest = await newGuest();
    const auth = { Authorization: `Bearer ${guest.token}` };
    await request(testApp(pool)).post('/v1/me/unlocks/not-a-uuid').set(auth).expect(404);
    await request(testApp(pool)).get('/v1/playback/episodes/not-a-uuid').expect(404);
  });
});
