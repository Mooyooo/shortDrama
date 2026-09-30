import { Router } from 'express';
import type pg from 'pg';

import { withTransaction } from '../../db.js';
import { ensureWallet } from '../wallet/wallet.js';
import { createSession, requireViewer, revokeSession } from './sessions.js';

export function authRoutes(pool: pg.Pool) {
  const router = Router();

  // The app calls this once on first launch and keeps the token in the iPhone's secure storage.
  // Abuse (mass guest creation) is limited by a Cloudflare rate-limit rule on this path.
  router.post('/guest', async (_req, res) => {
    const result = await withTransaction(pool, async (client) => {
      const user = await client.query<{ id: string }>(
        'INSERT INTO users (is_guest) VALUES (TRUE) RETURNING id',
      );
      const userId = user.rows[0].id;
      await ensureWallet(client, userId);
      return { userId, token: await createSession(client, userId) };
    });
    res.status(201).json({
      ok: true,
      token: result.token,
      viewer: { id: result.userId, isGuest: true },
    });
  });

  router.post('/logout', requireViewer(pool), async (req, res) => {
    await revokeSession(pool, req.get('authorization')!.slice(7).trim());
    res.json({ ok: true });
  });

  return router;
}
