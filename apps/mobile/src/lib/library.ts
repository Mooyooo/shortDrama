import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

// On-device only until accounts exist (Phase 2); then progress syncs through the API.

export type SeriesProgress = {
  episode: number;
  seconds: number;
  duration: number;
  updatedAt: number;
};

export type Library = {
  progress: Record<string, SeriesProgress>;
  // Series ids, most recently saved first.
  saved: string[];
  // Liked episodes as `${seriesId}:${episodeNumber}`.
  likes: string[];
};

const KEY = 'library.v1';
const EMPTY: Library = { progress: {}, saved: [], likes: [] };
// Progress ticks every second; writing to disk that often isn't needed.
const WRITE_INTERVAL_MS = 5000;

let state: Library | null = null;
let lastWrite = 0;
const listeners = new Set<() => void>();

function load(): Library {
  if (state) return state;
  try {
    const raw = Storage.getItemSync(KEY);
    state = raw ? { ...EMPTY, ...(JSON.parse(raw) as Library) } : EMPTY;
  } catch {
    state = EMPTY;
  }
  return state;
}

function update(next: Library, { force = false } = {}) {
  state = next;
  listeners.forEach((listener) => listener());
  const now = Date.now();
  if (force || now - lastWrite >= WRITE_INTERVAL_MS) {
    lastWrite = now;
    Storage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLibrary(): Library {
  return useSyncExternalStore(subscribe, load, load);
}

export function getProgress(seriesId: string): SeriesProgress | undefined {
  return load().progress[seriesId];
}

export function saveProgress(seriesId: string, episode: number, seconds: number, duration: number) {
  const current = load();
  const previous = current.progress[seriesId];
  update(
    {
      ...current,
      progress: {
        ...current.progress,
        [seriesId]: { episode, seconds, duration, updatedAt: Date.now() },
      },
    },
    // Moving to another episode is worth saving at once; ticks within one episode are throttled.
    { force: previous?.episode !== episode },
  );
}

export function toggleSaved(seriesId: string) {
  const current = load();
  const saved = current.saved.includes(seriesId)
    ? current.saved.filter((id) => id !== seriesId)
    : [seriesId, ...current.saved];
  update({ ...current, saved }, { force: true });
}

export const likeKey = (seriesId: string, episode: number) => `${seriesId}:${episode}`;

export function toggleLiked(seriesId: string, episode: number) {
  const current = load();
  const key = likeKey(seriesId, episode);
  const likes = current.likes.includes(key)
    ? current.likes.filter((k) => k !== key)
    : [...current.likes, key];
  update({ ...current, likes }, { force: true });
}

// Flush throttled progress, e.g. when the player closes.
export function flushLibrary() {
  if (!state) return;
  lastWrite = Date.now();
  Storage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}
