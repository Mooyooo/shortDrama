// Loads the app's five sample series into a LOCAL database, so the iPhone app can run against the
// API before Cloudflare Stream exists. Videos are public test streams ("dev-sample:" uids), which
// the API plays only with DEV_SAMPLE_VIDEOS=true. Refuses anything but a local database.
//
//   npm run seed:dev

import { DEV_SAMPLE_PREFIX } from '../src/modules/playback/links.js';
import { createPool, withTransaction } from '../src/db.js';

const SAMPLES = [
  {
    slug: 'billionaire-return',
    title: "The Billionaire's Return",
    synopsis: 'Cast out on her wedding day, she comes back five years later owning the company.',
    tags: ['Revenge', 'Billionaire'],
    episodes: 80,
    free: 8,
    video: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    slug: 'alpha-mate',
    title: "The Alpha's Rejected Mate",
    synopsis: 'Rejected by the pack leader, she discovers the bloodline that makes her his equal.',
    tags: ['Werewolf', 'Romance'],
    episodes: 95,
    free: 10,
    video: 'https://test-streams.mux.dev/tos_ismc/main.m3u8',
  },
  {
    slug: 'hidden-heiress',
    title: 'The Hidden Heiress',
    synopsis: 'The quiet intern everyone mocks is the heir to the family they work for.',
    tags: ['Secret identity', 'Family'],
    episodes: 72,
    free: 6,
    video:
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
  },
  {
    slug: 'second-chance',
    title: 'Second Chance Marriage',
    synopsis: 'Divorced for a lie, they are forced to share one house for thirty days.',
    tags: ['Romance', 'Family'],
    episodes: 64,
    free: 5,
    video:
      'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  },
  {
    slug: 'ceo-bodyguard',
    title: "The CEO's Secret Bodyguard",
    synopsis: 'Her new driver is the soldier who vanished the night her father died.',
    tags: ['Action', 'Romance'],
    episodes: 88,
    free: 8,
    video:
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
  },
];

const url = process.env.DATABASE_URL ?? '';
const host = (() => {
  try {
    return new URL(url).hostname || 'localhost';
  } catch {
    return '';
  }
})();
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', ''].includes(host)) {
  console.error(`Refusing to seed: ${host || 'unknown host'} is not a local database.`);
  process.exit(1);
}

const pool = createPool(url);
try {
  await withTransaction(pool, async (client) => {
    for (const [index, sample] of SAMPLES.entries()) {
      await client.query('DELETE FROM series WHERE slug = $1', [sample.slug]);
      await client.query(`DELETE FROM video_assets WHERE stream_uid = $1`, [
        `${DEV_SAMPLE_PREFIX}${sample.video}`,
      ]);
      const video = await client.query<{ id: string }>(
        `INSERT INTO video_assets (stream_uid, status, duration_seconds, width, height)
         VALUES ($1, 'ready', 90, 1080, 1920) RETURNING id`,
        [`${DEV_SAMPLE_PREFIX}${sample.video}`],
      );
      const videoId = video.rows[0].id;
      const series = await client.query<{ id: string }>(
        `INSERT INTO series (slug, title, synopsis, status, free_episodes, coin_price, cover_url,
                             trailer_video_id, published_at)
         VALUES ($1, $2, $3, 'published', $4, 30, 'https://example.com/cover.jpg', $5,
                 NOW() - make_interval(days => $6))
         RETURNING id`,
        [sample.slug, sample.title, sample.synopsis, sample.free, videoId, index],
      );
      const seriesId = series.rows[0].id;
      // Every episode plays the same sample clip, as in the app's built-in data.
      await client.query(
        `INSERT INTO episodes (series_id, number, status, video_id)
         SELECT $1, n, 'published', $2 FROM generate_series(1, $3) AS n`,
        [seriesId, videoId, sample.episodes],
      );
      for (const tag of sample.tags) {
        await client.query(
          `WITH t AS (INSERT INTO tags (name) VALUES ($2)
                      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id)
           INSERT INTO series_tags (series_id, tag_id) SELECT $1, id FROM t`,
          [seriesId, tag],
        );
      }
    }
  });
  console.log(`Seeded ${SAMPLES.length} sample series into ${url}`);
} finally {
  await pool.end();
}
