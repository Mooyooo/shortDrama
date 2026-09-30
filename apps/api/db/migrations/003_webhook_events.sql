-- Durable inbox for webhooks (Cloudflare Stream now; RevenueCat and AdMob later).
-- The receiver verifies the signature, inserts a row and replies 2xx; a worker applies pending rows.
-- Same pattern as socialManager's fub_webhook_events.

CREATE TABLE webhook_events (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT NOT NULL CHECK (provider IN ('cloudflare_stream', 'revenuecat', 'admob')),
  event_id      TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  attempts      INT NOT NULL DEFAULT 0,
  error         TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  UNIQUE (provider, event_id)
);

CREATE INDEX idx_webhook_events_pending ON webhook_events (received_at) WHERE status = 'pending';
