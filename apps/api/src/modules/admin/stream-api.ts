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
  const body = (await response.json()) as {
    success: boolean;
    result?: DirectUpload;
    errors?: { message: string }[];
  };
  if (!response.ok || !body.success || !body.result) {
    const reason = body.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
    throw new Error(`Cloudflare Stream direct upload failed: ${reason}`);
  }
  return body.result;
}
