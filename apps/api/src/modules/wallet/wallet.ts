import type pg from 'pg';

import { withTransaction } from '../../db.js';

// The rules from "Money must never break" (System Architecture doc):
// - every coin change is an append-only ledger row, never an edit;
// - the wallet balance changes in the same transaction as its ledger row;
// - every outside event carries an id stored with a unique constraint, so replays change nothing;
// - an unlock charges and unlocks in one transaction, so a viewer is never charged without the episode.

export type CreditReason = 'purchase' | 'ad_reward' | 'bonus' | 'refund' | 'adjustment';

export async function ensureWallet(client: pg.PoolClient, userId: string) {
  await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
}

// Adds (or, for refunds, removes) coins. Returns false if this external id was already applied.
export async function creditCoins(
  pool: pg.Pool,
  userId: string,
  delta: number,
  reason: CreditReason,
  externalId: string,
): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    await ensureWallet(client, userId);
    const inserted = await client.query(
      `INSERT INTO coin_ledger (user_id, delta, reason, external_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (reason, external_id) DO NOTHING`,
      [userId, delta, reason, externalId],
    );
    if (inserted.rowCount === 0) return false;
    await client.query(
      'UPDATE wallets SET balance = balance + $2, updated_at = NOW() WHERE user_id = $1',
      [userId, delta],
    );
    return true;
  });
}

export type UnlockResult =
  | { status: 'unlocked'; balance: number; charged: number }
  | { status: 'already_unlocked'; balance: number }
  | { status: 'free' }
  | { status: 'insufficient_coins'; balance: number; price: number }
  | { status: 'not_found' };

export async function unlockWithCoins(
  pool: pg.Pool,
  userId: string,
  episodeId: string,
): Promise<UnlockResult> {
  return withTransaction(pool, async (client) => {
    const episode = await client.query<{ number: number; free_episodes: number; price: number }>(
      `SELECT e.number, s.free_episodes, COALESCE(e.coin_price, s.coin_price) AS price
       FROM episodes e JOIN series s ON s.id = e.series_id
       WHERE e.id = $1 AND e.status = 'published' AND s.status = 'published'`,
      [episodeId],
    );
    const ep = episode.rows[0];
    if (!ep) return { status: 'not_found' };
    if (ep.number <= ep.free_episodes) return { status: 'free' };

    await ensureWallet(client, userId);
    // Lock this viewer's wallet row: two taps at once queue here, and the second sees the unlock.
    const wallet = await client.query<{ balance: number }>(
      'SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    const balance = wallet.rows[0].balance;

    const existing = await client.query(
      'SELECT 1 FROM unlocks WHERE user_id = $1 AND episode_id = $2',
      [userId, episodeId],
    );
    if (existing.rowCount) return { status: 'already_unlocked', balance };
    if (balance < ep.price) return { status: 'insufficient_coins', balance, price: ep.price };

    await client.query(
      `INSERT INTO coin_ledger (user_id, delta, reason, external_id, episode_id)
       VALUES ($1, $2, 'unlock', $3, $4)`,
      [userId, -ep.price, `unlock:${userId}:${episodeId}`, episodeId],
    );
    await client.query(
      'UPDATE wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1',
      [userId, ep.price],
    );
    await client.query(
      `INSERT INTO unlocks (user_id, episode_id, source) VALUES ($1, $2, 'coins')`,
      [userId, episodeId],
    );
    return { status: 'unlocked', balance: balance - ep.price, charged: ep.price };
  });
}
