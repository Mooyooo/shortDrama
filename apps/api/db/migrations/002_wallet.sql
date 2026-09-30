-- Viewers, coins and unlocks. The ledger is append-only: every coin change is a row, never an edit.
-- See "Money must never break" in the System Architecture doc.

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apple_sub   TEXT UNIQUE,                          -- Sign in with Apple subject; NULL for guests
  is_guest    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Current balance, updated in the same transaction as each ledger row.
-- It may go negative after an Apple refund; spending is then refused.
CREATE TABLE wallets (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance     INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coin_ledger (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta        INT NOT NULL CHECK (delta <> 0),
  reason       TEXT NOT NULL
               CHECK (reason IN ('purchase', 'unlock', 'ad_reward', 'bonus', 'refund', 'adjustment')),
  -- RevenueCat transaction id, AdMob reward id, or our own key for unlocks.
  -- Unique per reason, so a replayed webhook or a double tap changes nothing.
  external_id  TEXT,
  episode_id   UUID REFERENCES episodes(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reason, external_id)
);

CREATE TABLE unlocks (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id  UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('coins', 'ad', 'vip', 'grant')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, episode_id)
);

CREATE INDEX idx_coin_ledger_user ON coin_ledger (user_id, created_at DESC);
