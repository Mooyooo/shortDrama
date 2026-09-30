import type { LibraryChange, LibrarySnapshot } from '@shortdrama/shared';
import type pg from 'pg';

import type { Queryable } from '../../db.js';

export const MAX_CHANGES = 500;
// Phone clocks drift; a change stamped in the future is treated as happening now.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export class InvalidChange extends Error {}

function when(at: unknown): Date {
  const date = typeof at === 'string' ? new Date(at) : null;
  if (!date || Number.isNaN(date.getTime())) throw new InvalidChange('bad "at" timestamp');
  const latest = Date.now() + MAX_CLOCK_SKEW_MS;
  return date.getTime() > latest ? new Date() : date;
}

function count(value: unknown, name: string, min: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new InvalidChange(`bad ${name}`);
  }
  return value;
}

// Checks shape only; which series and episodes exist is decided while applying.
export function parseChanges(raw: unknown): LibraryChange[] {
  if (!Array.isArray(raw)) throw new InvalidChange('changes must be a list');
  if (raw.length > MAX_CHANGES) throw new InvalidChange(`at most ${MAX_CHANGES} changes at once`);
  return raw.map((c): LibraryChange => {
    const change = c as Record<string, unknown>;
    if (typeof change.series !== 'string' || !change.series) throw new InvalidChange('bad series');
    const at = when(change.at).toISOString();
    switch (change.type) {
      case 'progress':
        return {
          type: 'progress',
          series: change.series,
          episode: Math.trunc(count(change.episode, 'episode', 1)),
          seconds: count(change.seconds, 'seconds', 0),
          duration: count(change.duration, 'duration', 0),
          at,
        };
      case 'save':
        if (typeof change.saved !== 'boolean') throw new InvalidChange('bad saved');
        return { type: 'save', series: change.series, saved: change.saved, at };
      case 'like':
        if (typeof change.liked !== 'boolean') throw new InvalidChange('bad liked');
        return {
          type: 'like',
          series: change.series,
          episode: Math.trunc(count(change.episode, 'episode', 1)),
          liked: change.liked,
          at,
        };
      default:
        throw new InvalidChange('unknown change type');
    }
  });
}

// Applies changes; for each item the newest timestamp wins. Returns how many were skipped
// because their series or episode doesn't exist (e.g. sample data from before the API).
export async function applyChanges(
  client: pg.PoolClient,
  userId: string,
  changes: LibraryChange[],
): Promise<number> {
  const slugs = [...new Set(changes.map((c) => c.series))];
  const { rows } = await client.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM series WHERE slug = ANY($1)',
    [slugs],
  );
  const seriesIds = new Map(rows.map((r) => [r.slug, r.id]));
  let skipped = 0;

  for (const change of changes) {
    const seriesId = seriesIds.get(change.series);
    if (!seriesId) {
      skipped++;
      continue;
    }
    if (change.type === 'progress') {
      await client.query(
        `INSERT INTO watch_progress (user_id, series_id, episode_number, seconds, duration, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, series_id) DO UPDATE SET
           episode_number = EXCLUDED.episode_number, seconds = EXCLUDED.seconds,
           duration = EXCLUDED.duration, updated_at = EXCLUDED.updated_at
         WHERE watch_progress.updated_at < EXCLUDED.updated_at`,
        [userId, seriesId, change.episode, change.seconds, change.duration, change.at],
      );
    } else if (change.type === 'save') {
      await client.query(
        `INSERT INTO saved_series (user_id, series_id, saved, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, series_id) DO UPDATE SET
           saved = EXCLUDED.saved, updated_at = EXCLUDED.updated_at
         WHERE saved_series.updated_at < EXCLUDED.updated_at`,
        [userId, seriesId, change.saved, change.at],
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO episode_likes (user_id, episode_id, liked, updated_at)
         SELECT $1, e.id, $4, $5 FROM episodes e WHERE e.series_id = $2 AND e.number = $3
         ON CONFLICT (user_id, episode_id) DO UPDATE SET
           liked = EXCLUDED.liked, updated_at = EXCLUDED.updated_at
         WHERE episode_likes.updated_at < EXCLUDED.updated_at
         RETURNING 1`,
        [userId, seriesId, change.episode, change.liked, change.at],
      );
      // No row back: either no such episode, or an older change losing to a newer one.
      if (!inserted.rowCount) {
        const exists = await client.query(
          'SELECT 1 FROM episodes WHERE series_id = $1 AND number = $2',
          [seriesId, change.episode],
        );
        if (!exists.rowCount) skipped++;
      }
    }
  }
  return skipped;
}

export async function getSnapshot(db: Queryable, userId: string): Promise<LibrarySnapshot> {
  const [progress, saved, likes] = await Promise.all([
    db.query<{
      series: string;
      episode: number;
      seconds: string;
      duration: string;
      updated_at: Date;
    }>(
      `SELECT s.slug AS series, p.episode_number AS episode, p.seconds, p.duration, p.updated_at
       FROM watch_progress p JOIN series s ON s.id = p.series_id
       WHERE p.user_id = $1 ORDER BY p.updated_at DESC`,
      [userId],
    ),
    db.query<{ series: string; updated_at: Date }>(
      `SELECT s.slug AS series, v.updated_at FROM saved_series v JOIN series s ON s.id = v.series_id
       WHERE v.user_id = $1 AND v.saved ORDER BY v.updated_at DESC`,
      [userId],
    ),
    db.query<{ series: string; episode: number }>(
      `SELECT s.slug AS series, e.number AS episode
       FROM episode_likes l JOIN episodes e ON e.id = l.episode_id JOIN series s ON s.id = e.series_id
       WHERE l.user_id = $1 AND l.liked`,
      [userId],
    ),
  ]);
  return {
    progress: progress.rows.map((r) => ({
      series: r.series,
      episode: r.episode,
      seconds: Number(r.seconds),
      duration: Number(r.duration),
      updatedAt: r.updated_at.toISOString(),
    })),
    saved: saved.rows.map((r) => ({ series: r.series, savedAt: r.updated_at.toISOString() })),
    likes: likes.rows,
  };
}
