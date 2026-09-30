-- Viewer sessions. The app holds a random token; we store only its SHA-256 hash, so a copy of
-- this table can't be used to sign in. Guests get one on first launch; Sign in with Apple later
-- attaches to the same user, so nobody loses coins or progress.

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    BYTEA UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
