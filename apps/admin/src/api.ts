import type {
  AdminSeries,
  AdminSeriesPatch,
  AdminSeriesSummary,
  ApiError,
  ReviewComment,
} from '@shortdrama/shared';

// The admin token lives only in this browser tab's session, until staff accounts exist.
const TOKEN_KEY = 'shortdrama.adminToken';

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token then lasts only until reload.
  }
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError & { problems?: string[] },
  ) {
    super(body.error);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/v1/admin${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken() ?? ''}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || !json.ok) throw new ApiRequestError(response.status, json);
  return json as T;
}

// Subtitle files are sent as text, not JSON.
async function callText(method: string, path: string, text: string): Promise<object> {
  const response = await fetch(`/v1/admin${path}`, {
    method,
    headers: { Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': 'text/vtt' },
    body: text,
  });
  const json = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || !json.ok) throw new ApiRequestError(response.status, json);
  return json;
}

export const adminApi = {
  listSeries: () => call<{ series: AdminSeriesSummary[] }>('GET', '/series'),
  getSeries: (id: string) =>
    call<{ series: AdminSeries; publishProblems: string[] }>('GET', `/series/${id}`),
  createSeries: (input: { slug: string; title: string; synopsis?: string }) =>
    call<{ id: string }>('POST', '/series', input),
  updateSeries: (id: string, patch: AdminSeriesPatch) =>
    call<object>('PATCH', `/series/${id}`, patch),
  reviewComments: () => call<{ comments: ReviewComment[] }>('GET', '/comments/review'),
  decideComment: (id: string, action: 'keep' | 'remove') =>
    call<object>('POST', `/comments/${id}/decision`, { action }),
  banUser: (id: string) => call<object>('POST', `/users/${id}/ban`),
  unbanUser: (id: string) => call<object>('POST', `/users/${id}/unban`),
  // Each grant gets a fresh reference, so a retried request can't pay twice.
  grantCoins: (userId: string, amount: number) =>
    call<{ applied: boolean; coins: number }>('POST', `/users/${userId}/coins`, {
      amount,
      reference: crypto.randomUUID(),
    }),
  createImageUpload: () =>
    call<{ uploadUrl: string; deliveryUrl: string }>('POST', '/images/upload'),
  createTrailerUpload: (seriesId: string) =>
    call<{ uploadUrl: string; streamUid: string }>('POST', `/series/${seriesId}/trailer/upload`),
  putSubtitles: (episodeId: string, language: string, vtt: string) =>
    callText('PUT', `/episodes/${episodeId}/subtitles/${language}`, vtt),
  deleteSubtitles: (episodeId: string, language: string) =>
    call<object>('DELETE', `/episodes/${episodeId}/subtitles/${language}`),
  createUpload: (seriesId: string, episodeNumber: number) =>
    call<{ uploadUrl: string; streamUid: string }>(
      'POST',
      `/series/${seriesId}/episodes/${episodeNumber}/upload`,
    ),
};

// Sends a file straight to Cloudflare (Stream videos up to 200 MB, or Images), reporting progress.
export function uploadToStream(
  uploadUrl: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
