import type { ApiError, GuestSession } from '@shortdrama/shared';
import * as SecureStore from 'expo-secure-store';

import { API_URL } from './config';

const TOKEN_KEY = 'shortdrama.session';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError & Record<string, unknown>,
  ) {
    super(body.error);
  }
}

async function send<T>(path: string, init: RequestInit & { token?: string }): Promise<T> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL is not set');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
  });
  const json = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || !json.ok) throw new ApiRequestError(response.status, json);
  return json as T;
}

// The session token lives in the iPhone's Keychain. One guest account is created on first use;
// concurrent callers share that single request.
let tokenPromise: Promise<string> | null = null;

export function viewerToken(): Promise<string> {
  tokenPromise ??= (async () => {
    const saved = await SecureStore.getItemAsync(TOKEN_KEY);
    if (saved) return saved;
    const session = await send<GuestSession>('/v1/auth/guest', { method: 'POST' });
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    return session.token;
  })().catch((err) => {
    tokenPromise = null;
    throw err;
  });
  return tokenPromise;
}

export async function forgetSession() {
  tokenPromise = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

type Options = { method?: string; body?: unknown; auth?: 'required' | 'optional' | 'none' };

export async function api<T>(path: string, { method = 'GET', body, auth = 'none' }: Options = {}) {
  const token = auth === 'none' ? undefined : await viewerToken();
  try {
    return await send<T>(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      token,
    });
  } catch (err) {
    // A revoked or deleted session: start a fresh guest account once, then retry.
    if (err instanceof ApiRequestError && err.status === 401 && token) {
      await forgetSession();
      return send<T>(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        token: await viewerToken(),
      });
    }
    throw err;
  }
}
