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
  // A playable HLS link to the trailer, or null when there's none yet.
  trailerUrl: string | null;
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

// Admin API (staff only).

export type AdminSeriesSummary = {
  id: string;
  slug: string;
  title: string;
  status: PublishStatus;
  freeEpisodes: number;
  coinPrice: number;
  coverUrl: string | null;
  episodeCount: number;
  updatedAt: string;
};

export type AdminEpisode = {
  id: string;
  number: number;
  title: string | null;
  status: PublishStatus;
  videoStatus: VideoStatus | null;
  pendingVideoStatus: VideoStatus | null;
  durationSeconds: string | null;
};

export type AdminSeries = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  status: PublishStatus;
  freeEpisodes: number;
  coinPrice: number;
  coverUrl: string | null;
  bannerUrl: string | null;
  releaseAt: string | null;
  episodes: AdminEpisode[];
};

export type AdminSeriesPatch = Partial<
  Pick<AdminSeries, 'title' | 'synopsis' | 'freeEpisodes' | 'coinPrice' | 'coverUrl' | 'bannerUrl'>
> & { status?: PublishStatus };

// Viewers (the app).

export type Viewer = {
  id: string;
  isGuest: boolean;
  coins: number;
};

export type GuestSession = {
  token: string;
  viewer: Pick<Viewer, 'id' | 'isGuest'>;
};

export type UnlockResponse = {
  status: 'unlocked' | 'already_unlocked' | 'free';
  coins?: number;
};

// Comments.

export type EpisodeComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  isMine: boolean;
};

export type ReportReason = 'spam' | 'abuse' | 'sexual' | 'spoiler' | 'other';

export type ReviewComment = {
  id: string;
  body: string;
  status: 'visible' | 'hidden' | 'removed';
  createdAt: string;
  reportCount: number;
  reasons: ReportReason[];
  author: { id: string; name: string; banned: boolean };
  episode: { id: string; number: number; seriesTitle: string };
};
