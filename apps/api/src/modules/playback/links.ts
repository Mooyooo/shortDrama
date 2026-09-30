import type { Config } from '../../config.js';
import { hlsUrl, signStreamToken } from './stream-token.js';

export const DEV_SAMPLE_PREFIX = 'dev-sample:';

export type VideoLink = { url: string; expiresAt: Date };

// Turns a video's Cloudflare Stream uid into a playable link, or null if playback isn't set up.
export function createLinker(config: Config) {
  const { customerCode, signingKeyId, signingKeyPem, playbackTtlSeconds } = config.stream;

  return (streamUid: string | null): VideoLink | null => {
    if (!streamUid) return null;
    if (streamUid.startsWith(DEV_SAMPLE_PREFIX)) {
      if (!config.devSampleVideos) return null;
      return {
        url: streamUid.slice(DEV_SAMPLE_PREFIX.length),
        expiresAt: new Date(Date.now() + playbackTtlSeconds * 1000),
      };
    }
    if (!customerCode || !signingKeyId || !signingKeyPem) return null;
    const expiresAt = new Date(Date.now() + playbackTtlSeconds * 1000);
    const token = signStreamToken(
      { keyId: signingKeyId, keyPemBase64: signingKeyPem },
      streamUid,
      expiresAt,
    );
    return { url: hlsUrl(customerCode, token), expiresAt };
  };
}

export type Linker = ReturnType<typeof createLinker>;
