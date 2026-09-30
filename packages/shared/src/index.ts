// The API contract shared by apps/api, apps/admin and apps/mobile.
// Types only: every import of this package must be `import type`, so nothing reaches the runtime.

export type ApiOk<T> = { ok: true } & T;
export type ApiError = { ok: false; error: string };
export type ApiResponse<T> = ApiOk<T> | ApiError;

export type PublishStatus = 'draft' | 'ready' | 'scheduled' | 'published' | 'unpublished';

export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type CatalogSeries = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  tags: string[];
  coverUrl: string | null;
  bannerUrl: string | null;
  episodeCount: number;
  freeEpisodes: number;
  coinPrice: number;
  trailerPlaybackId: string | null;
};

export type CatalogEpisode = {
  id: string;
  number: number;
  title: string | null;
  durationSeconds: number | null;
  free: boolean;
  coinPrice: number;
};

export type SeriesDetail = CatalogSeries & { episodes: CatalogEpisode[] };

export type PlaybackLink = {
  hlsUrl: string;
  expiresAt: string;
};

export type SubtitleTrack = {
  language: string;
  url: string;
  isDefault: boolean;
};
