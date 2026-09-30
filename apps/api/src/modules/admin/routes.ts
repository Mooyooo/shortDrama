import type { PublishStatus, ReviewComment } from '@shortdrama/shared';
import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type pg from 'pg';

import type { Config } from '../../config.js';
import { withTransaction } from '../../db.js';
import { DISPLAY_NAME } from '../comments/routes.js';
import { creditCoins } from '../wallet/wallet.js';
import { createDirectUpload } from './stream-api.js';

const STATUSES: PublishStatus[] = ['draft', 'ready', 'scheduled', 'published', 'unpublished'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class BadRequest extends Error {}

// Interim protection: one shared admin token from the environment, until staff accounts exist.
function requireAdmin(config: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.adminToken) {
      res.status(503).json({ ok: false, error: 'admin_not_configured' });
      return;
    }
    const given = Buffer.from(req.get('authorization')?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(config.adminToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    next();
  };
}

function text(body: Record<string, unknown>, key: string, { required = false } = {}) {
  const value = body[key];
  if (value === undefined || value === null) {
    if (required) throw new BadRequest(`${key} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new BadRequest(`${key} must be a string`);
  return value.trim();
}

function count(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new BadRequest(`${key} must be a whole number of 0 or more`);
  }
  return value as number;
}

// What must be true before a series can go live (Publishing workflow in the Content Pipeline doc).
export async function publishProblems(db: pg.Pool | pg.PoolClient, seriesId: string) {
  const { rows } = await db.query<{
    cover_url: string | null;
    license_ends_on: Date | null;
    episodes: number;
    without_video: number;
  }>(
    `SELECT s.cover_url, s.license_ends_on,
            (SELECT COUNT(*)::int FROM episodes e WHERE e.series_id = s.id) AS episodes,
            (SELECT COUNT(*)::int FROM episodes e
             LEFT JOIN video_assets v ON v.id = e.video_id
             WHERE e.series_id = s.id AND (v.id IS NULL OR v.status <> 'ready')) AS without_video
     FROM series s WHERE s.id = $1`,
    [seriesId],
  );
  const s = rows[0];
  if (!s) return ['series not found'];
  const problems: string[] = [];
  if (!s.cover_url) problems.push('needs a cover image');
  if (s.episodes === 0) problems.push('needs at least one episode');
  if (s.without_video > 0) problems.push(`${s.without_video} episode(s) have no ready video`);
  if (s.license_ends_on && s.license_ends_on <= new Date()) problems.push('license has ended');
  return problems;
}

export function adminRoutes(pool: pg.Pool, config: Config) {
  const router = Router();
  router.use(requireAdmin(config));

  router.get('/series', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.slug, s.title, s.status, s.free_episodes AS "freeEpisodes",
              s.coin_price AS "coinPrice", s.cover_url AS "coverUrl", s.updated_at AS "updatedAt",
              (SELECT COUNT(*)::int FROM episodes e WHERE e.series_id = s.id) AS "episodeCount"
       FROM series s ORDER BY s.updated_at DESC`,
    );
    res.json({ ok: true, series: rows });
  });

  router.get('/series/:id', async (req, res) => {
    const series = await pool.query(
      `SELECT id, slug, title, synopsis, status, free_episodes AS "freeEpisodes",
              coin_price AS "coinPrice", cover_url AS "coverUrl", banner_url AS "bannerUrl",
              release_at AS "releaseAt"
       FROM series WHERE id = $1`,
      [req.params.id],
    );
    if (!series.rows[0]) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const episodes = await pool.query(
      `SELECT e.id, e.number, e.title, e.status,
              v.status AS "videoStatus", pv.status AS "pendingVideoStatus",
              v.duration_seconds AS "durationSeconds"
       FROM episodes e
       LEFT JOIN video_assets v ON v.id = e.video_id
       LEFT JOIN video_assets pv ON pv.id = e.pending_video_id
       WHERE e.series_id = $1 ORDER BY e.number`,
      [req.params.id],
    );
    res.json({
      ok: true,
      series: { ...series.rows[0], episodes: episodes.rows },
      publishProblems: await publishProblems(pool, req.params.id),
    });
  });

  router.post('/series', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const slug = text(body, 'slug', { required: true })!;
    if (!SLUG.test(slug)) throw new BadRequest('slug must be lowercase words joined by hyphens');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO series (slug, title, synopsis, free_episodes, coin_price)
       VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, 5), COALESCE($5, 30))
       RETURNING id`,
      [
        slug,
        text(body, 'title', { required: true }),
        text(body, 'synopsis'),
        count(body, 'freeEpisodes'),
        count(body, 'coinPrice'),
      ],
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  });

  router.patch('/series/:id', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const status = text(body, 'status') as PublishStatus | undefined;
    if (status && !STATUSES.includes(status)) throw new BadRequest('unknown status');

    const result = await withTransaction(pool, async (client) => {
      if (status === 'published' || status === 'ready' || status === 'scheduled') {
        const problems = await publishProblems(client, req.params.id as string);
        if (problems.length) return { problems };
      }
      const updated = await client.query(
        `UPDATE series SET
           title = COALESCE($2, title),
           synopsis = COALESCE($3, synopsis),
           free_episodes = COALESCE($4, free_episodes),
           coin_price = COALESCE($5, coin_price),
           cover_url = COALESCE($6, cover_url),
           banner_url = COALESCE($7, banner_url),
           status = COALESCE($8, status),
           published_at = CASE WHEN $8 = 'published' AND published_at IS NULL THEN NOW()
                               ELSE published_at END,
           updated_at = NOW()
         WHERE id = $1`,
        [
          req.params.id,
          text(body, 'title'),
          text(body, 'synopsis'),
          count(body, 'freeEpisodes'),
          count(body, 'coinPrice'),
          text(body, 'coverUrl'),
          text(body, 'bannerUrl'),
          status,
        ],
      );
      if (updated.rowCount === 0) return { notFound: true };
      // Publishing a series publishes its episodes with them; unpublishing hides them all.
      if (status === 'published' || status === 'unpublished') {
        await client.query(
          `UPDATE episodes SET status = $2, updated_at = NOW() WHERE series_id = $1`,
          [req.params.id, status],
        );
      }
      return {};
    });

    if ('notFound' in result) {
      res.status(404).json({ ok: false, error: 'not_found' });
    } else if ('problems' in result) {
      res.status(409).json({ ok: false, error: 'not_ready', problems: result.problems });
    } else {
      res.json({ ok: true });
    }
  });

  // One-time upload link for the series trailer (the clip the For You feed and series page play).
  // The catalog only shows a trailer once Stream reports it ready.
  router.post('/series/:id/trailer/upload', async (req, res) => {
    const { accountId, apiToken } = config.stream;
    if (!accountId || !apiToken) {
      res.status(503).json({ ok: false, error: 'stream_not_configured' });
      return;
    }
    const series = await pool.query<{ slug: string }>('SELECT slug FROM series WHERE id = $1', [
      req.params.id,
    ]);
    if (!series.rows[0]) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const upload = await createDirectUpload(accountId, apiToken, {
      name: `${series.rows[0].slug}/trailer`,
    });
    await withTransaction(pool, async (client) => {
      const asset = await client.query<{ id: string }>(
        'INSERT INTO video_assets (stream_uid) VALUES ($1) RETURNING id',
        [upload.uid],
      );
      await client.query(
        'UPDATE series SET trailer_video_id = $2, updated_at = NOW() WHERE id = $1',
        [req.params.id, asset.rows[0].id],
      );
    });
    res.status(201).json({ ok: true, uploadUrl: upload.uploadURL, streamUid: upload.uid });
  });

  // One-time Cloudflare Stream upload link for an episode's video; creates the episode if needed.
  router.post('/series/:id/episodes/:number/upload', async (req, res) => {
    const { accountId, apiToken } = config.stream;
    if (!accountId || !apiToken) {
      res.status(503).json({ ok: false, error: 'stream_not_configured' });
      return;
    }
    const number = Number(req.params.number);
    if (!Number.isInteger(number) || number < 1) throw new BadRequest('bad episode number');

    const series = await pool.query<{ slug: string }>('SELECT slug FROM series WHERE id = $1', [
      req.params.id,
    ]);
    if (!series.rows[0]) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    const upload = await createDirectUpload(accountId, apiToken, {
      name: `${series.rows[0].slug}/EP${String(number).padStart(2, '0')}`,
    });
    await withTransaction(pool, async (client) => {
      const asset = await client.query<{ id: string }>(
        `INSERT INTO video_assets (stream_uid) VALUES ($1) RETURNING id`,
        [upload.uid],
      );
      await client.query(
        `INSERT INTO episodes (series_id, number, pending_video_id) VALUES ($1, $2, $3)
         ON CONFLICT (series_id, number)
         DO UPDATE SET pending_video_id = EXCLUDED.pending_video_id, updated_at = NOW()`,
        [req.params.id, number, asset.rows[0].id],
      );
    });
    res.status(201).json({ ok: true, uploadUrl: upload.uploadURL, streamUid: upload.uid });
  });

  // Moderation queue: comments with reports newer than the last staff decision, oldest first,
  // so nothing waits long (Apple expects timely action on reports).
  router.get('/comments/review', async (_req, res) => {
    const { rows } = await pool.query<{
      id: string;
      body: string;
      status: ReviewComment['status'];
      created_at: Date;
      report_count: number;
      reasons: ReviewComment['reasons'];
      user_id: string;
      name: string;
      banned: boolean;
      episode_id: string;
      number: number;
      series_title: string;
    }>(
      `SELECT c.id, c.body, c.status, c.created_at, c.report_count,
              ARRAY(SELECT DISTINCT r.reason FROM comment_reports r WHERE r.comment_id = c.id
                    ORDER BY r.reason) AS reasons,
              u.id AS user_id, ${DISPLAY_NAME} AS name, u.banned_at IS NOT NULL AS banned,
              e.id AS episode_id, e.number, s.title AS series_title
       FROM comments c
       JOIN users u ON u.id = c.user_id
       JOIN episodes e ON e.id = c.episode_id
       JOIN series s ON s.id = e.series_id
       WHERE c.status <> 'removed'
         AND EXISTS (SELECT 1 FROM comment_reports r WHERE r.comment_id = c.id
                     AND r.created_at > COALESCE(c.reviewed_at, '-infinity'))
       ORDER BY c.created_at
       LIMIT 100`,
    );
    const comments: ReviewComment[] = rows.map((r) => ({
      id: r.id,
      body: r.body,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      reportCount: r.report_count,
      reasons: r.reasons,
      author: { id: r.user_id, name: r.name, banned: r.banned },
      episode: { id: r.episode_id, number: r.number, seriesTitle: r.series_title },
    }));
    res.json({ ok: true, comments });
  });

  router.post('/comments/:id/decision', async (req, res) => {
    const action = text(req.body as Record<string, unknown>, 'action', { required: true });
    if (action !== 'keep' && action !== 'remove')
      throw new BadRequest('action must be keep or remove');
    const result = await pool.query(
      `UPDATE comments
       SET status = CASE WHEN $2 = 'keep' THEN 'visible' ELSE 'removed' END, reviewed_at = NOW()
       WHERE id = $1`,
      [req.params.id, action],
    );
    if (!result.rowCount) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.json({ ok: true });
  });

  // A banned viewer can still watch but can't comment; their existing comments are removed.
  router.post('/users/:id/ban', async (req, res) => {
    const result = await withTransaction(pool, async (client) => {
      const user = await client.query(
        'UPDATE users SET banned_at = COALESCE(banned_at, NOW()) WHERE id = $1',
        [req.params.id],
      );
      if (user.rowCount) {
        await client.query(
          `UPDATE comments SET status = 'removed', reviewed_at = NOW()
           WHERE user_id = $1 AND status <> 'removed'`,
          [req.params.id],
        );
      }
      return user.rowCount;
    });
    if (!result) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.json({ ok: true });
  });

  // Support tool: give (or, with a negative amount, take back) coins, recorded in the ledger as an
  // adjustment. `reference` makes a retried request harmless; the admin sends a fresh one per grant.
  router.post('/users/:id/coins', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const amount = body.amount;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount as number) > 100_000) {
      throw new BadRequest('amount must be a whole number between -100000 and 100000, not 0');
    }
    const reference = text(body, 'reference', { required: true })!;
    const user = await pool.query('SELECT 1 FROM users WHERE id = $1', [req.params.id]);
    if (!user.rowCount) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const applied = await creditCoins(
      pool,
      req.params.id as string,
      amount as number,
      'adjustment',
      `admin:${reference}`,
    );
    const wallet = await pool.query<{ balance: number }>(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [req.params.id],
    );
    res.json({ ok: true, applied, coins: wallet.rows[0].balance });
  });

  router.post('/users/:id/unban', async (req, res) => {
    await pool.query('UPDATE users SET banned_at = NULL WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  });

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof BadRequest) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    if ((err as { code?: string }).code === '22P02') {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ ok: false, error: 'already_exists' });
      return;
    }
    next(err);
  });

  return router;
}
