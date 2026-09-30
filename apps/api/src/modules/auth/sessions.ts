import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type pg from 'pg';

import type { Queryable } from '../../db.js';

// Writing last_used_at on every request would turn each read into a write; hourly is plenty.
const TOUCH_INTERVAL = '1 hour';

export const hashToken = (token: string) => createHash('sha256').update(token).digest();

export async function createSession(db: Queryable, userId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [
    userId,
    hashToken(token),
  ]);
  return token;
}

function bearer(req: Request) {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

async function viewerFor(pool: pg.Pool, token: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ user_id: string }>(
    `UPDATE sessions
     SET last_used_at = CASE WHEN last_used_at < NOW() - INTERVAL '${TOUCH_INTERVAL}'
                             THEN NOW() ELSE last_used_at END
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING user_id`,
    [hashToken(token)],
  );
  return rows[0]?.user_id;
}

// Sets res.locals.userId, or answers 401.
export function requireViewer(pool: pg.Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearer(req);
    const userId = token ? await viewerFor(pool, token) : undefined;
    if (!userId) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    res.locals.userId = userId;
    next();
  };
}

// Sets res.locals.userId when a valid token is sent; anonymous requests carry on without it.
export function optionalViewer(pool: pg.Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (token) res.locals.userId = await viewerFor(pool, token);
    next();
  };
}

export async function revokeSession(db: Queryable, token: string) {
  await db.query('UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1', [
    hashToken(token),
  ]);
}
