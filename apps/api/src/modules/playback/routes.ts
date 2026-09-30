import type { PlaybackLink } from '@shortdrama/shared';
import { Router } from 'express';
import type pg from 'pg';

import type { Config } from '../../config.js';
import { optionalViewer } from '../auth/sessions.js';
import { hlsUrl, signStreamToken } from './stream-token.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function playbackRoutes(pool: pg.Pool, config: Config) {
  const router = Router();
  const { customerCode, signingKeyId, signingKeyPem, playbackTtlSeconds } = config.stream;

  // Every episode, free or not, plays through a short-lived signed link.
  router.get('/episodes/:id', optionalViewer(pool), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!customerCode || !signingKeyId || !signingKeyPem) {
      res.status(503).json({ ok: false, error: 'playback_not_configured' });
      return;
    }
    const episodeId = String(req.params.id);
    if (!UUID.test(episodeId)) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    const { rows } = await pool.query<{
      number: number;
      free_episodes: number;
      stream_uid: string;
      unlocked: boolean;
    }>(
      `SELECT e.number, s.free_episodes, v.stream_uid,
              EXISTS (SELECT 1 FROM unlocks u WHERE u.episode_id = e.id AND u.user_id = $2)
                AS unlocked
       FROM episodes e
       JOIN series s ON s.id = e.series_id
       JOIN video_assets v ON v.id = e.video_id AND v.status = 'ready'
       WHERE e.id = $1
         AND e.status = 'published' AND (e.release_at IS NULL OR e.release_at <= NOW())
         AND s.status = 'published' AND (s.release_at IS NULL OR s.release_at <= NOW())`,
      [episodeId, res.locals.userId ?? null],
    );
    const episode = rows[0];
    if (!episode) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    // Free episodes play for anyone; locked ones only for a viewer who has unlocked them.
    if (episode.number > episode.free_episodes && !episode.unlocked) {
      res.status(402).json({ ok: false, error: 'locked' });
      return;
    }

    const expiresAt = new Date(Date.now() + playbackTtlSeconds * 1000);
    const token = signStreamToken(
      { keyId: signingKeyId, keyPemBase64: signingKeyPem },
      episode.stream_uid,
      expiresAt,
    );
    const playback: PlaybackLink = {
      hlsUrl: hlsUrl(customerCode, token),
      expiresAt: expiresAt.toISOString(),
    };
    res.json({ ok: true, playback });
  });

  return router;
}
