import { verify } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signStreamToken } from '../src/modules/playback/stream-token.js';
import { freshDatabase, seedSeries, signingPublicKey, testApp, testConfig } from './helpers.js';

let pool: pg.Pool;
let episodeIds: string[];

beforeAll(async () => {
  pool = await freshDatabase();
  ({ episodeIds } = await seedSeries(pool, { slug: 'play-me', freeEpisodes: 2 }));
});

afterAll(() => pool.end());

describe('signStreamToken', () => {
  it('makes an RS256 JWT Cloudflare can verify with the public key', () => {
    const config = testConfig();
    const expiresAt = new Date('2030-01-01T00:00:00Z');
    const token = signStreamToken(
      { keyId: 'test-key', keyPemBase64: config.stream.signingKeyPem! },
      'video-uid',
      expiresAt,
    );
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      kid: 'test-key',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      sub: 'video-uid',
      kid: 'test-key',
      exp: expiresAt.getTime() / 1000,
    });
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      signingPublicKey,
      Buffer.from(signature, 'base64url'),
    );
    expect(valid).toBe(true);
  });
});

describe('GET /v1/playback/episodes/:id', () => {
  it('returns a signed HLS link for a free episode, never cached', async () => {
    const res = await request(testApp(pool))
      .get(`/v1/playback/episodes/${episodeIds[0]}`)
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.playback.hlsUrl).toMatch(
      /^https:\/\/customer-testcode\.cloudflarestream\.com\/[\w-]+\.[\w-]+\.[\w-]+\/manifest\/video\.m3u8$/,
    );
    expect(Date.parse(res.body.playback.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('refuses a locked episode', async () => {
    const res = await request(testApp(pool))
      .get(`/v1/playback/episodes/${episodeIds[2]}`)
      .expect(402);
    expect(res.body).toEqual({ ok: false, error: 'locked' });
  });

  it('answers 503 until signing is configured', async () => {
    const app = testApp(pool, testConfig({ signingKeyPem: undefined }));
    await request(app).get(`/v1/playback/episodes/${episodeIds[0]}`).expect(503);
  });
});
