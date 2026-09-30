import type pg from 'pg';

import { withTransaction } from '../../db.js';

type StreamPayload = {
  uid: string;
  readyToStream?: boolean;
  status?: { state?: string; errReasonText?: string };
  duration?: number;
  thumbnail?: string;
  input?: { width?: number; height?: number };
};

const MAX_ATTEMPTS = 5;

function videoStatus(payload: StreamPayload) {
  const state = payload.status?.state;
  if (state === 'ready') return 'ready';
  if (state === 'error') return 'failed';
  return 'processing';
}

async function applyStreamEvent(client: pg.PoolClient, payload: StreamPayload) {
  const { rowCount } = await client.query(
    `UPDATE video_assets
     SET status = $2,
         duration_seconds = COALESCE($3, duration_seconds),
         width = COALESCE($4, width),
         height = COALESCE($5, height),
         thumbnail_url = COALESCE($6, thumbnail_url),
         error = $7,
         updated_at = NOW()
     WHERE stream_uid = $1`,
    [
      payload.uid,
      videoStatus(payload),
      payload.duration && payload.duration > 0 ? payload.duration : null,
      payload.input?.width && payload.input.width > 0 ? payload.input.width : null,
      payload.input?.height && payload.input.height > 0 ? payload.input.height : null,
      payload.thumbnail ?? null,
      payload.status?.errReasonText ?? null,
    ],
  );
  if (rowCount === 0) throw new Error(`No video_assets row for stream uid ${payload.uid}`);

  if (videoStatus(payload) === 'ready') {
    await client.query(
      `UPDATE episodes SET video_id = pending_video_id, pending_video_id = NULL, updated_at = NOW()
       WHERE pending_video_id = (SELECT id FROM video_assets WHERE stream_uid = $1)`,
      [payload.uid],
    );
  }
}

// Applies up to `batchSize` pending events. Safe to run from several processes at once:
// SKIP LOCKED hands each row to exactly one of them.
export async function processWebhookEvents(pool: pg.Pool, batchSize = 20): Promise<number> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string; provider: string; payload: StreamPayload }>(
      `SELECT id, provider, payload FROM webhook_events
       WHERE status = 'pending'
       ORDER BY received_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );

    for (const event of rows) {
      await client.query('SAVEPOINT event');
      try {
        if (event.provider !== 'cloudflare_stream')
          throw new Error(`No handler for ${event.provider}`);
        await applyStreamEvent(client, event.payload);
        await client.query('RELEASE SAVEPOINT event');
        await client.query(
          `UPDATE webhook_events SET status = 'processed', processed_at = NOW(), attempts = attempts + 1
           WHERE id = $1`,
          [event.id],
        );
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT event');
        // Retry a few times (the video row may not be committed yet), then give up loudly.
        await client.query(
          `UPDATE webhook_events
           SET attempts = attempts + 1, error = $2,
               status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'pending' END
           WHERE id = $1`,
          [event.id, err instanceof Error ? err.message : String(err), MAX_ATTEMPTS],
        );
      }
    }
    return rows.length;
  });
}
