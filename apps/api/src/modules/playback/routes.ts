import type { PlaybackLink } from '@shortdrama/shared';
import { Router } from 'express';
import type pg from 'pg';

import type { Config } from '../../config.js';
import { hlsUrl, signStreamToken } from './stream-token.js';

export function playbackRoutes(pool: pg.Pool, config: Config) {
  const router = Router();
  const { customerCode, signingKeyId, signingKeyPem, playbackTtlSeconds } = config.stream;

  // Every episode, free or not, plays through a short-lived signed link.
  router.get('/episodes/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!customerCode || !signingKeyId || !signingKeyPem) {
      res.status(503).json({ ok: false, error: 'playback_not_configured' });
      return;
    }

    const { rows } = await pool.query<{
      number: number;
      free_episodes: number;
      stream_uid: string;
    }>(
      `SELECT e.number, s.free_episodes, v.stream_uid
       FROM episodes e
       JOIN series s ON s.id = e.series_id
       JOIN video_assets v ON v.id = e.video_id AND v.status = 'ready'
       WHERE e.id = $1
         AND e.status = 'published' AND (e.release_at IS NULL OR e.release_at <= NOW())
         AND s.status = 'published' AND (s.release_at IS NULL OR s.release_at <= NOW())`,
      [req.params.id],
    );
    const episode = rows[0];
    if (!episode) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    // Until sign-in exists there is no viewer to check unlocks for, so only free episodes play.
    if (episode.number > episode.free_episodes) {
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
