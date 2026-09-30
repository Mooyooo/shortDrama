-- Each viewer's library, synced from the app: where they are in each series, the series they saved,
-- and the episodes they liked. The app sends changes stamped with the time they happened; the
-- newest change per item wins, so edits made offline or on two phones settle the same way.
-- Rows for unsaved series and unliked episodes stay (saved/liked = false) so an older change
-- arriving late can't bring them back.

CREATE TABLE watch_progress (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id       UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  episode_number  INT NOT NULL CHECK (episode_number > 0),
  seconds         NUMERIC NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  duration        NUMERIC NOT NULL DEFAULT 0 CHECK (duration >= 0),
  updated_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, series_id)
);

CREATE TABLE saved_series (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id   UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  saved       BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, series_id)
);

CREATE TABLE episode_likes (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id  UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  liked       BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, episode_id)
);

-- For like counts per episode later.
CREATE INDEX idx_episode_likes_episode ON episode_likes (episode_id) WHERE liked;
