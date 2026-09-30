import type { PublishStatus } from '@shortdrama/shared';
import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type pg from 'pg';

import type { Config } from '../../config.js';
import { withTransaction } from '../../db.js';
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

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof BadRequest) {
      res.status(400).json({ ok: false, error: err.message });
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
