import type { UnlockResponse, Viewer } from '@shortdrama/shared';
import { Router } from 'express';
import type pg from 'pg';

import { requireViewer } from '../auth/sessions.js';
import { unlockWithCoins } from '../wallet/wallet.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Everything about the signed-in viewer. Never cached: it differs per person.
export function meRoutes(pool: pg.Pool) {
  const router = Router();
  router.use(requireViewer(pool));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/', async (_req, res) => {
    const { rows } = await pool.query<{ id: string; is_guest: boolean; balance: number }>(
      `SELECT u.id, u.is_guest, COALESCE(w.balance, 0) AS balance
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.id = $1`,
      [res.locals.userId],
    );
    const viewer: Viewer = { id: rows[0].id, isGuest: rows[0].is_guest, coins: rows[0].balance };
    res.json({ ok: true, viewer });
  });

  // Apple requires in-app account deletion once an app has accounts. Deleting the user removes
  // their sessions, wallet, ledger, unlocks and comments with it (ON DELETE CASCADE).
  router.delete('/', async (_req, res) => {
    await pool.query('DELETE FROM users WHERE id = $1', [res.locals.userId]);
    res.json({ ok: true });
  });

  // Which episodes of a series this viewer has unlocked, for the lock icons in the app.
  router.get('/unlocks', async (req, res) => {
    const seriesId = String(req.query.seriesId ?? '');
    if (!UUID.test(seriesId)) {
      res.status(400).json({ ok: false, error: 'seriesId is required' });
      return;
    }
    const { rows } = await pool.query<{ episode_id: string }>(
      `SELECT u.episode_id FROM unlocks u JOIN episodes e ON e.id = u.episode_id
       WHERE u.user_id = $1 AND e.series_id = $2`,
      [res.locals.userId, seriesId],
    );
    res.json({ ok: true, episodeIds: rows.map((r) => r.episode_id) });
  });

  router.post('/unlocks/:episodeId', async (req, res) => {
    if (!UUID.test(req.params.episodeId)) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const result = await unlockWithCoins(pool, res.locals.userId, req.params.episodeId);
    switch (result.status) {
      case 'not_found':
        res.status(404).json({ ok: false, error: 'not_found' });
        return;
      case 'insufficient_coins':
        res.status(402).json({
          ok: false,
          error: 'insufficient_coins',
          coins: result.balance,
          price: result.price,
        });
        return;
      default: {
        const body: UnlockResponse = { status: result.status };
        if ('balance' in result) body.coins = result.balance;
        res.json({ ok: true, ...body });
      }
    }
  });

  return router;
}
