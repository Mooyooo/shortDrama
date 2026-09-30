import { useCallback, useEffect, useState } from 'react';

// A small shared cache for API reads: screens asking for the same key share one request and one
// result, and `reload()` fetches again (pull to refresh, retry after an error).

type Entry = { promise?: Promise<unknown>; data?: unknown; error?: unknown };

const cache = new Map<string, Entry>();

function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) ?? {};
  if (!entry.promise) {
    entry.promise = fetcher().then(
      (data) => {
        entry.data = data;
        entry.error = undefined;
        return data;
      },
      (error) => {
        entry.error = error;
        entry.promise = undefined; // let the next attempt try again
        throw error;
      },
    );
    cache.set(key, entry);
  }
  return entry.promise as Promise<T>;
}

export function invalidate(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function useResource<T>(key: string | null, fetcher: () => Promise<T>) {
  const cached = key ? cache.get(key) : undefined;
  const [state, setState] = useState<{ key: string | null; data?: T; error?: unknown }>(() => ({
    key,
    data: cached?.data as T | undefined,
  }));
  const [version, setVersion] = useState(0);

  // A new key starts from whatever the cache already holds for it.
  if (state.key !== key) {
    setState({ key, data: cached?.data as T | undefined });
  }

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    load(key, fetcher).then(
      (data) => !cancelled && setState({ key, data }),
      (error) => !cancelled && setState((s) => ({ ...s, key, error })),
    );
    return () => {
      cancelled = true;
    };
    // `fetcher` is recreated every render; the key and explicit reloads decide when to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const reload = useCallback(() => {
    if (key) cache.delete(key);
    setVersion((v) => v + 1);
  }, [key]);

  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    loading: state.key === key && state.data === undefined && state.error === undefined,
    reload,
  };
}
