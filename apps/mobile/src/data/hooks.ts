import {
  fetchEpisodeUrl,
  fetchSeries,
  fetchSeriesList,
  fetchUnlockedEpisodeIds,
  fetchViewer,
} from './source';
import type { Episode, Series } from './catalog';
import { useResource } from './use-resource';

export const useSeriesList = () => useResource('series-list', fetchSeriesList);

export const useSeries = (id: string, enabled = true) =>
  useResource(enabled ? `series:${id}` : null, () => fetchSeries(id));

export const useViewer = () => useResource('viewer', fetchViewer);

export const useUnlockedEpisodeIds = (series: Series | undefined) =>
  useResource(series?.uuid ? `unlocks:${series.uuid}` : null, () =>
    fetchUnlockedEpisodeIds(series!),
  );

// Resolves when the episode's player mounts, which also covers the preloaded neighbours.
export const useEpisodeUrl = (episode: Episode, enabled: boolean) =>
  useResource(enabled ? `episode-url:${episode.id}` : null, () => fetchEpisodeUrl(episode));
