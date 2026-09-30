import type { CatalogEpisode, CatalogSeries, SeriesDetail } from '@shortdrama/shared';

import type { Queryable } from '../../db.js';
import type { Linker } from '../playback/links.js';

// "Live" = published and past any scheduled release time. The app never sees anything else.
const live = (alias: string) =>
  `${alias}.status = 'published' AND (${alias}.release_at IS NULL OR ${alias}.release_at <= NOW())`;

type SeriesRow = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  cover_url: string | null;
  banner_url: string | null;
  free_episodes: number;
  coin_price: number;
  trailer_uid: string | null;
  tags: string[];
  episode_count: number;
};

const SERIES_SELECT = `
  SELECT s.id, s.slug, s.title, s.synopsis, s.cover_url, s.banner_url, s.free_episodes,
         s.coin_price, v.stream_uid AS trailer_uid,
         COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM series_tags st
                   JOIN tags t ON t.id = st.tag_id WHERE st.series_id = s.id), '{}') AS tags,
         (SELECT COUNT(*)::int FROM episodes e WHERE e.series_id = s.id AND ${live('e')}) AS episode_count
  FROM series s
  LEFT JOIN video_assets v ON v.id = s.trailer_video_id AND v.status = 'ready'`;

function toSeries(row: SeriesRow, link: Linker): CatalogSeries {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    synopsis: row.synopsis,
    tags: row.tags,
    coverUrl: row.cover_url,
    bannerUrl: row.banner_url,
    episodeCount: row.episode_count,
    freeEpisodes: row.free_episodes,
    coinPrice: row.coin_price,
    // Trailers are free promotion, so every viewer gets the same signed link (fine to cache).
    trailerUrl: link(row.trailer_uid)?.url ?? null,
  };
}

export async function listSeries(db: Queryable, link: Linker): Promise<CatalogSeries[]> {
  const { rows } = await db.query<SeriesRow>(
    `${SERIES_SELECT} WHERE ${live('s')} ORDER BY s.published_at DESC NULLS LAST, s.title`,
  );
  return rows.map((row) => toSeries(row, link));
}

export async function getSeriesDetail(
  db: Queryable,
  link: Linker,
  slug: string,
): Promise<SeriesDetail | null> {
  const { rows } = await db.query<SeriesRow>(
    `${SERIES_SELECT} WHERE s.slug = $1 AND ${live('s')}`,
    [slug],
  );
  const series = rows[0];
  if (!series) return null;

  const episodes = await db.query<{
    id: string;
    number: number;
    title: string | null;
    duration_seconds: string | null;
    coin_price: number;
  }>(
    `SELECT e.id, e.number, e.title, v.duration_seconds,
            COALESCE(e.coin_price, s.coin_price) AS coin_price
     FROM episodes e
     JOIN series s ON s.id = e.series_id
     LEFT JOIN video_assets v ON v.id = e.video_id
     WHERE e.series_id = $1 AND ${live('e')}
     ORDER BY e.number`,
    [series.id],
  );

  return {
    ...toSeries(series, link),
    episodes: episodes.rows.map((e): CatalogEpisode => ({
      id: e.id,
      number: e.number,
      title: e.title,
      durationSeconds: e.duration_seconds == null ? null : Number(e.duration_seconds),
      free: e.number <= series.free_episodes,
      coinPrice: e.coin_price,
    })),
  };
}
