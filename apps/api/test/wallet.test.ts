import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creditCoins, unlockWithCoins } from '../src/modules/wallet/wallet.js';
import { freshDatabase, seedSeries, seedUser } from './helpers.js';

let pool: pg.Pool;
let episodeIds: string[];

beforeAll(async () => {
  pool = await freshDatabase();
  ({ episodeIds } = await seedSeries(pool, { slug: 'paid', freeEpisodes: 2, coinPrice: 30 }));
});

afterAll(() => pool.end());

async function balance(userId: string) {
  const { rows } = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
  return rows[0]?.balance;
}

describe('creditCoins', () => {
  it('applies each purchase once, even if the webhook repeats', async () => {
    const user = await seedUser(pool);
    expect(await creditCoins(pool, user, 100, 'purchase', 'rc-txn-1')).toBe(true);
    expect(await creditCoins(pool, user, 100, 'purchase', 'rc-txn-1')).toBe(false);
    expect(await balance(user)).toBe(100);
  });
});

describe('unlockWithCoins', () => {
  it('charges the price and records the unlock', async () => {
    const user = await seedUser(pool);
    await creditCoins(pool, user, 100, 'purchase', 'rc-txn-2');
    expect(await unlockWithCoins(pool, user, episodeIds[2])).toEqual({
      status: 'unlocked',
      balance: 70,
      charged: 30,
    });
    const ledger = await pool.query(
      'SELECT delta, reason FROM coin_ledger WHERE user_id = $1 ORDER BY id',
      [user],
    );
    expect(ledger.rows).toEqual([
      { delta: 100, reason: 'purchase' },
      { delta: -30, reason: 'unlock' },
    ]);
  });

  it('charges once when the same unlock arrives twice at the same moment', async () => {
    const user = await seedUser(pool);
    await creditCoins(pool, user, 100, 'purchase', 'rc-txn-3');
    const results = await Promise.all([
      unlockWithCoins(pool, user, episodeIds[3]),
      unlockWithCoins(pool, user, episodeIds[3]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['already_unlocked', 'unlocked']);
    expect(await balance(user)).toBe(70);
  });

  it('refuses when the balance is too low, and changes nothing', async () => {
    const user = await seedUser(pool);
    await creditCoins(pool, user, 10, 'bonus', 'welcome-bonus-x');
    expect(await unlockWithCoins(pool, user, episodeIds[2])).toEqual({
      status: 'insufficient_coins',
      balance: 10,
      price: 30,
    });
    expect(await balance(user)).toBe(10);
  });

  it('never charges for a free episode', async () => {
    const user = await seedUser(pool);
    expect(await unlockWithCoins(pool, user, episodeIds[0])).toEqual({ status: 'free' });
  });
});
