import { useCallback, useEffect, useState } from 'react';

import { ApiRequestError } from './api';

// Loads data on mount and on `reload()`; errors come back as readable text.
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeError(err));
      });
    return () => {
      cancelled = true;
    };
    // `load` is recreated each render by callers; `version` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

export function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 401) return 'The admin token was refused. Sign out and try again.';
    if (err.status === 503) return `Not configured on the server yet (${err.body.error}).`;
    return err.body.problems?.length ? err.body.problems.join('; ') : err.body.error;
  }
  return err instanceof Error ? err.message : String(err);
}
