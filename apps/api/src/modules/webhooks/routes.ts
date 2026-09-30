import express, { Router } from 'express';
import type pg from 'pg';

import type { Config } from '../../config.js';
import { verifyStreamWebhook } from './stream-signature.js';

type StreamWebhook = { uid?: string; status?: { state?: string } };

export function webhookRoutes(pool: pg.Pool, config: Config) {
  const router = Router();

  // The signature covers the exact bytes, so this route reads the raw body, not parsed JSON.
  router.post('/stream', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const secret = config.stream.webhookSecret;
    if (!secret) {
      res.status(503).json({ ok: false, error: 'webhooks_not_configured' });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!verifyStreamWebhook(secret, req.get('webhook-signature'), rawBody)) {
      res.status(401).json({ ok: false, error: 'bad_signature' });
      return;
    }

    let payload: StreamWebhook;
    try {
      payload = JSON.parse(rawBody) as StreamWebhook;
    } catch {
      res.status(400).json({ ok: false, error: 'bad_json' });
      return;
    }
    if (!payload.uid) {
      res.status(400).json({ ok: false, error: 'missing_uid' });
      return;
    }

    // Stream sends no event id; one row per video and state makes a repeated delivery a no-op.
    await pool.query(
      `INSERT INTO webhook_events (provider, event_id, payload)
       VALUES ('cloudflare_stream', $1, $2)
       ON CONFLICT (provider, event_id) DO NOTHING`,
      [`${payload.uid}:${payload.status?.state ?? 'unknown'}`, payload],
    );
    res.json({ ok: true });
  });

  return router;
}
