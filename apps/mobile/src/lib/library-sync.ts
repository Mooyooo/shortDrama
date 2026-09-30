import type { LibraryChange, LibrarySnapshot } from '@shortdrama/shared';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';

import { api } from './api';
import { usingApi } from './config';
import { acceptServerLibrary, everythingAsChanges, pendingChanges, startTracking } from './library';

// Sends queued library changes to the API and takes back the merged library.
// When: on launch, on returning to or leaving the app, 2 s after a like or save, and every 30 s
// while watching (progress ticks every second, so it waits rather than resetting the timer).

const FIRST_SYNC_KEY = 'library.first-sync.v1';
const BATCH = 500; // the API's limit per request
const RETRY_MS = 60_000;

let started = false;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let dueAt = Infinity;

function schedule(delayMs: number) {
  const target = Date.now() + delayMs;
  if (timer && dueAt <= target) return; // an earlier sync is already coming
  if (timer) clearTimeout(timer);
  dueAt = target;
  timer = setTimeout(() => {
    timer = null;
    dueAt = Infinity;
    syncLibrary();
  }, delayMs);
}

export async function syncLibrary() {
  if (!usingApi) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    // A phone that had data before the API was connected uploads all of it once.
    const firstSync = Storage.getItemSync(FIRST_SYNC_KEY) !== 'done';
    let changes: LibraryChange[] = [
      ...(firstSync ? everythingAsChanges() : []),
      ...pendingChanges(),
    ];
    do {
      const batch = changes.slice(0, BATCH);
      const { library } = await api<{ library: LibrarySnapshot }>('/v1/me/library', {
        method: 'POST',
        body: { changes: batch },
        auth: 'required',
      });
      acceptServerLibrary(library, batch);
      changes = changes.slice(BATCH);
    } while (changes.length > 0);
    if (firstSync) Storage.setItemSync(FIRST_SYNC_KEY, 'done');
  } catch {
    // Offline or the server is unreachable: the queue stays on the phone; try again later.
    schedule(RETRY_MS);
  } finally {
    running = false;
    if (again) {
      again = false;
      syncLibrary();
    }
  }
}

export function startLibrarySync() {
  if (!usingApi || started) return;
  started = true;
  startTracking((kind) => schedule(kind === 'progress' ? 30_000 : 2_000));
  AppState.addEventListener('change', (next) => {
    if (next === 'active' || next === 'background') syncLibrary();
  });
  syncLibrary();
}
