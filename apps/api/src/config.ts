// Every setting comes from the environment (.env locally, the server's .env in production).
// Cloudflare settings are optional so the API runs locally without them; the routes that
// need them answer 503 until they're set.

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return {
    port: Number(optional('PORT') ?? 3101),
    databaseUrl: required('DATABASE_URL'),
    adminToken: optional('ADMIN_TOKEN'),
    stream: {
      accountId: optional('CF_ACCOUNT_ID'),
      apiToken: optional('CF_STREAM_API_TOKEN'),
      // The <CODE> in https://customer-<CODE>.cloudflarestream.com
      customerCode: optional('CF_STREAM_CUSTOMER_CODE'),
      signingKeyId: optional('CF_STREAM_SIGNING_KEY_ID'),
      // Base64-encoded PEM, as returned by POST /stream/keys.
      signingKeyPem: optional('CF_STREAM_SIGNING_KEY_PEM'),
      webhookSecret: optional('CF_STREAM_WEBHOOK_SECRET'),
      playbackTtlSeconds: Number(optional('PLAYBACK_TTL_SECONDS') ?? 4 * 60 * 60),
    },
  };
}
