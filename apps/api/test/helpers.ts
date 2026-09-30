import { generateKeyPairSync } from 'node:crypto';
import type pg from 'pg';

import { createApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

export const ADMIN_TOKEN = 'test-admin-token';
export const WEBHOOK_SECRET = 'test-webhook-secret';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const signingPublicKey = publicKey;

export function testConfig(overrides: Partial<Config['stream']> = {}): Config {
  const base = loadConfig();
  return {
    ...base,
    adminToken: ADMIN_TOKEN,
    stream: {
      ...base.stream,
      customerCode: 'testcode',
      signingKeyId: 'test-key',
      signingKeyPem: Buffer.from(
        privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      ).toString('base64'),
      webhookSecret: WEBHOOK_SECRET,
      ...overrides,
    },
  };
}

// A fresh, fully migrated schema for each test file.
export async function freshDatabase() {
  const pool = createPool(process.env.DATABASE_URL!);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, () => {});
  return pool;
}

export function testApp(pool: pg.Pool, config = testConfig()) {
  return createApp(pool, config);
}

let uidCounter = 0;

export async function readyVideo(pool: pg.Pool) {
  const { rows } = await pool.query<{ id: string; stream_uid: string }>(
    `INSERT INTO video_assets (stream_uid, status, duration_seconds)
     VALUES ($1, 'ready', 90) RETURNING id, stream_uid`,
    [`uid-${++uidCounter}`],
  );
  return rows[0];
}

type SeriesOptions = {
  slug: string;
  status?: string;
  episodes?: number;
  freeEpisodes?: number;
  coinPrice?: number;
  releaseAt?: Date;
  tags?: string[];
};

// A series with `episodes` episodes, each with a ready video, in the given status.
export async function seedSeries(pool: pg.Pool, options: SeriesOptions) {
  const status = options.status ?? 'published';
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO series (slug, title, status, free_episodes, coin_price, cover_url, release_at,
                         published_at)
     VALUES ($1, $2, $3, $4, $5, 'https://example.com/cover.jpg', $6,
             CASE WHEN $3 = 'published' THEN NOW() END)
     RETURNING id`,
    [
      options.slug,
      `Title of ${options.slug}`,
      status,
      options.freeEpisodes ?? 2,
      options.coinPrice ?? 30,
      options.releaseAt ?? null,
    ],
  );
  const seriesId = rows[0].id;
  const episodeIds: string[] = [];
  for (let n = 1; n <= (options.episodes ?? 4); n++) {
    const video = await readyVideo(pool);
    const ep = await pool.query<{ id: string }>(
      `INSERT INTO episodes (series_id, number, status, video_id) VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [seriesId, n, status, video.id],
    );
    episodeIds.push(ep.rows[0].id);
  }
  for (const tag of options.tags ?? []) {
    await pool.query(
      `WITH t AS (INSERT INTO tags (name) VALUES ($2)
                  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id)
       INSERT INTO series_tags (series_id, tag_id) SELECT $1, id FROM t`,
      [seriesId, tag],
    );
  }
  return { seriesId, episodeIds };
}

export async function seedUser(pool: pg.Pool) {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users DEFAULT VALUES RETURNING id',
  );
  return rows[0].id;
}
