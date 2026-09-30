import type { LibraryChange, LibrarySnapshot } from '@shortdrama/shared';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

// The viewer's library on this phone: always read and written here first, so it works offline.
// With the API connected, each change is also queued and sent by library-sync.ts; the server's
// merged copy then replaces this one.

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

const PENDING_KEY = 'library.pending.v1';

let state: Library | null = null;
let pending: LibraryChange[] | null = null;
let tracking = false;
let onChange: ((kind: 'progress' | 'toggle') => void) | null = null;
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

function loadPending(): LibraryChange[] {
  if (pending) return pending;
  try {
    const raw = Storage.getItemSync(PENDING_KEY);
    pending = raw ? (JSON.parse(raw) as LibraryChange[]) : [];
  } catch {
    pending = [];
  }
  return pending;
}

function savePending(next: LibraryChange[]) {
  pending = next;
  Storage.setItem(PENDING_KEY, JSON.stringify(next)).catch(() => {});
}

// Queue a change for the server. Progress keeps only the latest entry per series.
function record(change: LibraryChange) {
  if (!tracking) return;
  const queue = loadPending().filter(
    (c) => !(change.type === 'progress' && c.type === 'progress' && c.series === change.series),
  );
  savePending([...queue, change]);
  onChange?.(change.type === 'progress' ? 'progress' : 'toggle');
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
  record({
    type: 'progress',
    series: seriesId,
    episode,
    seconds,
    duration,
    at: new Date().toISOString(),
  });
}

export function toggleSaved(seriesId: string) {
  const current = load();
  const saved = current.saved.includes(seriesId)
    ? current.saved.filter((id) => id !== seriesId)
    : [seriesId, ...current.saved];
  update({ ...current, saved }, { force: true });
  record({
    type: 'save',
    series: seriesId,
    saved: saved.includes(seriesId),
    at: new Date().toISOString(),
  });
}

export const likeKey = (seriesId: string, episode: number) => `${seriesId}:${episode}`;

export function toggleLiked(seriesId: string, episode: number) {
  const current = load();
  const key = likeKey(seriesId, episode);
  const likes = current.likes.includes(key)
    ? current.likes.filter((k) => k !== key)
    : [...current.likes, key];
  update({ ...current, likes }, { force: true });
  record({
    type: 'like',
    series: seriesId,
    episode,
    liked: likes.includes(key),
    at: new Date().toISOString(),
  });
}

// Wipes everything stored on this phone (used when the viewer deletes their account).
export function clearLibrary() {
  update(EMPTY, { force: true });
  savePending([]);
}

// --- Used by library-sync.ts -------------------------------------------------------------------

export function startTracking(listener: (kind: 'progress' | 'toggle') => void) {
  tracking = true;
  onChange = listener;
}

export function pendingChanges(): LibraryChange[] {
  return loadPending();
}

// The whole library as changes, for the very first sync of a phone that already has data.
export function everythingAsChanges(): LibraryChange[] {
  const library = load();
  const now = new Date().toISOString();
  return [
    ...Object.entries(library.progress).map(([series, p]): LibraryChange => ({
      type: 'progress',
      series,
      episode: p.episode,
      seconds: p.seconds,
      duration: p.duration,
      at: new Date(p.updatedAt).toISOString(),
    })),
    ...library.saved.map((series): LibraryChange => ({
      type: 'save',
      series,
      saved: true,
      at: now,
    })),
    ...library.likes.map((key): LibraryChange => {
      const cut = key.lastIndexOf(':');
      return {
        type: 'like',
        series: key.slice(0, cut),
        episode: Number(key.slice(cut + 1)),
        liked: true,
        at: now,
      };
    }),
  ];
}

function applyChange(library: Library, change: LibraryChange): Library {
  switch (change.type) {
    case 'progress':
      return {
        ...library,
        progress: {
          ...library.progress,
          [change.series]: {
            episode: change.episode,
            seconds: change.seconds,
            duration: change.duration,
            updatedAt: Date.parse(change.at),
          },
        },
      };
    case 'save': {
      const others = library.saved.filter((id) => id !== change.series);
      return { ...library, saved: change.saved ? [change.series, ...others] : others };
    }
    case 'like': {
      const key = likeKey(change.series, change.episode);
      const others = library.likes.filter((k) => k !== key);
      return { ...library, likes: change.liked ? [...others, key] : others };
    }
  }
}

// After a successful sync: drop what the server has, and take its merged library, with any
// changes made during the request laid back on top.
export function acceptServerLibrary(snapshot: LibrarySnapshot, sent: LibraryChange[]) {
  const remaining = loadPending().filter((c) => !sent.includes(c));
  savePending(remaining);
  const fromServer: Library = {
    progress: Object.fromEntries(
      snapshot.progress.map((p) => [
        p.series,
        {
          episode: p.episode,
          seconds: p.seconds,
          duration: p.duration,
          updatedAt: Date.parse(p.updatedAt),
        },
      ]),
    ),
    saved: snapshot.saved.map((s) => s.series),
    likes: snapshot.likes.map((l) => likeKey(l.series, l.episode)),
  };
  update(remaining.reduce(applyChange, fromServer), { force: true });
}

// Flush throttled progress, e.g. when the player closes.
export function flushLibrary() {
  if (!state) return;
  lastWrite = Date.now();
  Storage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}
