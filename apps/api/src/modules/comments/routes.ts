import type { EpisodeComment, ReportReason } from '@shortdrama/shared';
import { Router } from 'express';
import type pg from 'pg';

import { withTransaction } from '../../db.js';
import { optionalViewer, requireViewer } from '../auth/sessions.js';
import { checkComment } from './filter.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: ReportReason[] = ['spam', 'abuse', 'sexual', 'spoiler', 'other'];
const PAGE_SIZE = 30;
const MAX_PER_MINUTE = 5;
// Enough separate reports pull a comment out of view until staff decide.
const AUTO_HIDE_REPORTS = 3;

// Viewers without a chosen name show as "Viewer 1a2b", from their id.
export const DISPLAY_NAME = `COALESCE(u.display_name, 'Viewer ' || substr(u.id::text, 1, 4))`;

const LIVE_EPISODE = `
  SELECT 1 FROM episodes e JOIN series s ON s.id = e.series_id
  WHERE e.id = $1 AND e.status = 'published' AND s.status = 'published'`;

export function commentRoutes(pool: pg.Pool) {
  const router = Router();

  router.get('/episodes/:id/comments', optionalViewer(pool), async (req, res) => {
    const episodeId = String(req.params.id);
    if (!UUID.test(episodeId)) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
    const viewerId: string | null = res.locals.userId ?? null;

    const { rows } = await pool.query<{
      id: string;
      body: string;
      created_at: Date;
      user_id: string;
      name: string;
    }>(
      `SELECT c.id, c.body, c.created_at, c.user_id, ${DISPLAY_NAME} AS name
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.episode_id = $1 AND c.status = 'visible'
         AND ($2::timestamptz IS NULL OR c.created_at < $2)
         AND NOT EXISTS (SELECT 1 FROM user_blocks b
                         WHERE b.blocker_id = $3 AND b.blocked_id = c.user_id)
       ORDER BY c.created_at DESC
       LIMIT ${PAGE_SIZE}`,
      [episodeId, before && !Number.isNaN(before.getTime()) ? before : null, viewerId],
    );
    const comments: EpisodeComment[] = rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at.toISOString(),
      author: { id: r.user_id, name: r.name },
      isMine: r.user_id === viewerId,
    }));
    // Blocks make the list personal, so it can't be cached at the edge.
    res.set('Cache-Control', 'private, no-store').json({
      ok: true,
      comments,
      nextBefore: rows.length === PAGE_SIZE ? comments.at(-1)!.createdAt : null,
    });
  });

  router.post('/episodes/:id/comments', requireViewer(pool), async (req, res) => {
    const episodeId = String(req.params.id);
    const userId: string = res.locals.userId;
    if (!UUID.test(episodeId) || !(await pool.query(LIVE_EPISODE, [episodeId])).rowCount) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const check = checkComment((req.body as { body?: unknown })?.body);
    if (!check.ok) {
      res.status(422).json({ ok: false, error: check.reason });
      return;
    }

    const user = await pool.query<{ banned: boolean; recent: number; duplicate: boolean }>(
      `SELECT u.banned_at IS NOT NULL AS banned,
              (SELECT COUNT(*)::int FROM comments c
               WHERE c.user_id = u.id AND c.created_at > NOW() - INTERVAL '1 minute') AS recent,
              EXISTS (SELECT 1 FROM comments c WHERE c.user_id = u.id AND c.body = $2
                      AND c.created_at > NOW() - INTERVAL '10 minutes') AS duplicate
       FROM users u WHERE u.id = $1`,
      [userId, check.body],
    );
    if (user.rows[0].banned) {
      res.status(403).json({ ok: false, error: 'banned' });
      return;
    }
    if (user.rows[0].recent >= MAX_PER_MINUTE || user.rows[0].duplicate) {
      res.status(429).json({ ok: false, error: 'slow_down' });
      return;
    }

    const { rows } = await pool.query<{ id: string; created_at: Date; name: string }>(
      `WITH c AS (INSERT INTO comments (episode_id, user_id, body) VALUES ($1, $2, $3)
                  RETURNING id, created_at, user_id)
       SELECT c.id, c.created_at, ${DISPLAY_NAME} AS name FROM c JOIN users u ON u.id = c.user_id`,
      [episodeId, userId, check.body],
    );
    const comment: EpisodeComment = {
      id: rows[0].id,
      body: check.body,
      createdAt: rows[0].created_at.toISOString(),
      author: { id: userId, name: rows[0].name },
      isMine: true,
    };
    res.status(201).json({ ok: true, comment });
  });

  router.delete('/comments/:id', requireViewer(pool), async (req, res) => {
    const commentId = String(req.params.id);
    const result = UUID.test(commentId)
      ? await pool.query(
          `UPDATE comments SET status = 'removed' WHERE id = $1 AND user_id = $2 AND status <> 'removed'`,
          [commentId, res.locals.userId],
        )
      : { rowCount: 0 };
    if (!result.rowCount) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/comments/:id/report', requireViewer(pool), async (req, res) => {
    const commentId = String(req.params.id);
    const reason = (req.body as { reason?: ReportReason })?.reason ?? 'other';
    if (!REASONS.includes(reason)) {
      res.status(400).json({ ok: false, error: 'unknown reason' });
      return;
    }
    if (!UUID.test(commentId)) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const found = await withTransaction(pool, async (client) => {
      const comment = await client.query<{ user_id: string }>(
        `SELECT user_id FROM comments WHERE id = $1 AND status <> 'removed' FOR UPDATE`,
        [commentId],
      );
      if (!comment.rows[0]) return false;
      const inserted = await client.query(
        `INSERT INTO comment_reports (comment_id, user_id, reason) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [commentId, res.locals.userId, reason],
      );
      // Count each viewer once; a staff "keep" decision stops automatic hiding.
      if (inserted.rowCount) {
        await client.query(
          `UPDATE comments SET report_count = report_count + 1,
             status = CASE WHEN report_count + 1 >= $2 AND reviewed_at IS NULL AND status = 'visible'
                           THEN 'hidden' ELSE status END
           WHERE id = $1`,
          [commentId, AUTO_HIDE_REPORTS],
        );
      }
      return true;
    });
    if (!found) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
