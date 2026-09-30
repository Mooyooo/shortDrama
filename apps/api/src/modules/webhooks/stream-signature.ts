import { createHmac, timingSafeEqual } from 'node:crypto';

// Cloudflare Stream signs webhooks as `Webhook-Signature: time=<unix>,sig1=<hex>`, where sig1 is
// HMAC-SHA256(secret, `${time}.${rawBody}`).
// https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/

const MAX_AGE_SECONDS = 5 * 60;

export function signStreamWebhook(secret: string, time: number, rawBody: string) {
  const sig = createHmac('sha256', secret).update(`${time}.${rawBody}`).digest('hex');
  return `time=${time},sig1=${sig}`;
}

export function verifyStreamWebhook(
  secret: string,
  header: string | undefined,
  rawBody: string,
  now = Date.now(),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
  const time = Number(parts.time);
  if (!Number.isFinite(time) || !parts.sig1) return false;
  // Reject old deliveries so a captured request can't be replayed later.
  if (Math.abs(now / 1000 - time) > MAX_AGE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${time}.${rawBody}`).digest();
  const given = Buffer.from(parts.sig1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
