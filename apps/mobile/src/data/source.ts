import type {
  CatalogSeries,
  EpisodeComment,
  PlaybackLink,
  ReportReason,
  SeriesDetail,
  UnlockResponse,
  Viewer,
} from '@shortdrama/shared';

import { api } from '@/lib/api';
import { usingApi } from '@/lib/config';

import {
  getSampleEpisodes,
  getSampleSeries,
  SAMPLE_SERIES,
  type Episode,
  type Series,
} from './catalog';

// Every screen reads through these functions: the API when it's configured, sample data otherwise.

function fromApi(s: CatalogSeries): Series {
  return {
    id: s.slug,
    uuid: s.id,
    title: s.title,
    synopsis: s.synopsis,
    tags: s.tags,
    episodeCount: s.episodeCount,
    freeEpisodes: s.freeEpisodes,
    coinPrice: s.coinPrice,
    trailerUrl: s.trailerUrl,
  };
}

export async function fetchSeriesList(): Promise<Series[]> {
  if (!usingApi) return SAMPLE_SERIES;
  const { series } = await api<{ series: CatalogSeries[] }>('/v1/catalog/series');
  return series.map(fromApi);
}

export type SeriesWithEpisodes = { series: Series; episodes: Episode[] };

export async function fetchSeries(id: string): Promise<SeriesWithEpisodes | null> {
  if (!usingApi) {
    const series = getSampleSeries(id);
    return series ? { series, episodes: getSampleEpisodes(series) } : null;
  }
  try {
    const { series } = await api<{ series: SeriesDetail }>(
      `/v1/catalog/series/${encodeURIComponent(id)}`,
    );
    return {
      series: fromApi(series),
      episodes: series.episodes.map((e) => ({
        id: e.id,
        number: e.number,
        free: e.free,
        coinPrice: e.coinPrice,
      })),
    };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export class LockedError extends Error {}

// The link the player streams. With the API it's signed per viewer and expires after a few hours.
export async function fetchEpisodeUrl(episode: Episode): Promise<string> {
  if (!usingApi) {
    if (!episode.videoUrl) throw new Error('This sample episode has no video');
    return episode.videoUrl;
  }
  try {
    const { playback } = await api<{ playback: PlaybackLink }>(
      `/v1/playback/episodes/${episode.id}`,
      { auth: 'optional' },
    );
    return playback.hlsUrl;
  } catch (err) {
    if ((err as { status?: number }).status === 402) throw new LockedError('locked');
    throw err;
  }
}

export async function fetchViewer(): Promise<Viewer | null> {
  if (!usingApi) return null;
  const { viewer } = await api<{ viewer: Viewer }>('/v1/me', { auth: 'required' });
  return viewer;
}

export async function fetchUnlockedEpisodeIds(series: Series): Promise<string[]> {
  if (!usingApi || !series.uuid) return [];
  const { episodeIds } = await api<{ episodeIds: string[] }>(
    `/v1/me/unlocks?seriesId=${series.uuid}`,
    { auth: 'required' },
  );
  return episodeIds;
}

export type UnlockOutcome =
  | ({ ok: true } & UnlockResponse)
  | { ok: false; reason: 'insufficient_coins'; coins: number; price: number }
  | { ok: false; reason: 'unavailable' };

export async function unlockEpisode(episode: Episode): Promise<UnlockOutcome> {
  if (!usingApi) return { ok: false, reason: 'unavailable' };
  try {
    const result = await api<UnlockResponse>(`/v1/me/unlocks/${episode.id}`, {
      method: 'POST',
      auth: 'required',
    });
    return { ok: true, ...result };
  } catch (err) {
    const body = (err as { body?: { error?: string; coins?: number; price?: number } }).body;
    if (body?.error === 'insufficient_coins') {
      return {
        ok: false,
        reason: 'insufficient_coins',
        coins: body.coins ?? 0,
        price: body.price ?? 0,
      };
    }
    throw err;
  }
}

// Comments exist only with the API: they need accounts and server-side moderation.

export const commentsAvailable = usingApi;

export async function fetchComments(episode: Episode, before?: string) {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return api<{ comments: EpisodeComment[]; nextBefore: string | null }>(
    `/v1/episodes/${episode.id}/comments${query}`,
    { auth: 'optional' },
  );
}

export async function postComment(episode: Episode, body: string) {
  const { comment } = await api<{ comment: EpisodeComment }>(
    `/v1/episodes/${episode.id}/comments`,
    { method: 'POST', body: { body }, auth: 'required' },
  );
  return comment;
}

export const deleteComment = (id: string) =>
  api(`/v1/comments/${id}`, { method: 'DELETE', auth: 'required' });

export const reportComment = (id: string, reason: ReportReason) =>
  api(`/v1/comments/${id}/report`, { method: 'POST', body: { reason }, auth: 'required' });

export const blockUser = (userId: string) =>
  api(`/v1/me/blocks/${userId}`, { method: 'POST', auth: 'required' });
