import { createPrivateKey, sign } from 'node:crypto';

// Self-signed Cloudflare Stream token: an RS256 JWT with the video uid as `sub`.
// Signing happens here, so playback links cost no Cloudflare API call.
// https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

export type StreamSigner = {
  keyId: string;
  // Base64-encoded PEM, exactly as Cloudflare returns it from POST /stream/keys.
  keyPemBase64: string;
};

export function signStreamToken(
  { keyId, keyPemBase64 }: StreamSigner,
  videoUid: string,
  expiresAt: Date,
): string {
  const header = { alg: 'RS256', kid: keyId };
  const payload = { sub: videoUid, kid: keyId, exp: Math.floor(expiresAt.getTime() / 1000) };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(Buffer.from(keyPemBase64, 'base64').toString('utf8'));
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), key);
  return `${unsigned}.${base64url(signature)}`;
}

export function hlsUrl(customerCode: string, token: string) {
  return `https://customer-${customerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`;
}
