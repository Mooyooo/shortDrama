// Cloudflare Stream API calls made by the admin. Viewers never trigger these.
// https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/

// Episodes run 1-2 minutes; this leaves room for longer trailers without allowing huge files.
const MAX_DURATION_SECONDS = 10 * 60;

type DirectUpload = { uploadURL: string; uid: string };

export async function createDirectUpload(
  accountId: string,
  apiToken: string,
  meta: { name: string },
): Promise<DirectUpload> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maxDurationSeconds: MAX_DURATION_SECONDS,
        // Locked or not, every episode plays only through links our API signs.
        requireSignedURLs: true,
        meta,
      }),
    },
  );
  return cloudflare<DirectUpload>(response, 'Stream upload');
}

// A failed Cloudflare call. Admin-only routes show its message to staff, so it says what to fix.
export class CloudflareError extends Error {}

async function cloudflare<T>(response: Response, what: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    result?: T;
    errors?: { message: string }[];
  };
  if (!response.ok || !body.success) {
    const reason = body.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
    const hint =
      response.status === 401 || response.status === 403 || /authentication/i.test(reason)
        ? ' Check the Cloudflare API token: it needs Stream: Edit and Images: Edit.'
        : '';
    throw new CloudflareError(`Cloudflare ${what} failed: ${reason}.${hint}`);
  }
  return body.result as T;
}

// One-time upload link for Cloudflare Images (covers, banners). The same API token needs the
// "Images: Edit" permission. The delivery address uses the account hash, which is part of the
// upload link: https://upload.imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>
// https://developers.cloudflare.com/images/upload-images/direct-creator-upload/
export async function createImageUpload(accountId: string, apiToken: string) {
  const form = new FormData();
  form.append('requireSignedURLs', 'false');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
    { method: 'POST', headers: { Authorization: `Bearer ${apiToken}` }, body: form },
  );
  const result = await cloudflare<{ id: string; uploadURL: string }>(response, 'image upload');
  const accountHash = new URL(result.uploadURL).pathname.split('/').filter(Boolean)[0];
  if (!accountHash) throw new Error('Cloudflare image upload: no account hash in the upload link');
  return {
    uploadURL: result.uploadURL,
    deliveryUrl: `https://imagedelivery.net/${accountHash}/${result.id}/public`,
  };
}

// Subtitles belong to one Stream video; Stream then lists them in the HLS manifest itself.
// https://developers.cloudflare.com/stream/edit-videos/adding-captions/
export async function uploadCaptions(
  accountId: string,
  apiToken: string,
  videoUid: string,
  language: string,
  vtt: string,
) {
  const form = new FormData();
  form.append('file', new Blob([vtt], { type: 'text/vtt' }), `${language}.vtt`);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}/captions/${language}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${apiToken}` }, body: form },
  );
  await cloudflare(response, 'caption upload');
}

export async function deleteCaptions(
  accountId: string,
  apiToken: string,
  videoUid: string,
  language: string,
) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}/captions/${language}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${apiToken}` } },
  );
  // Already gone on Cloudflare's side is fine.
  if (response.status !== 404) await cloudflare(response, 'caption delete');
}
