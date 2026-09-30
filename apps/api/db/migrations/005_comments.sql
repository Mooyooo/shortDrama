-- Episode comments with the moderation Apple requires for user posts (App Review guideline 1.2):
-- filtering (in code, before insert), reporting, blocking users, and timely action by staff.

ALTER TABLE users
  ADD COLUMN display_name TEXT,
  -- Set by staff: the viewer can still watch but can no longer comment.
  ADD COLUMN banned_at TIMESTAMPTZ;

CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id    UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  -- hidden = pulled automatically after reports, awaiting a staff decision;
  -- removed = deleted by its author or by staff.
  status        TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'removed')),
  report_count  INT NOT NULL DEFAULT 0,
  reviewed_at   TIMESTAMPTZ,                    -- staff kept it after reports
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_episode ON comments (episode_id, created_at DESC) WHERE status = 'visible';
CREATE INDEX idx_comments_user_recent ON comments (user_id, created_at DESC);
CREATE INDEX idx_comments_review ON comments (created_at) WHERE report_count > 0 AND reviewed_at IS NULL;

CREATE TABLE comment_reports (
  comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'sexual', 'spoiler', 'other')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)               -- one report per viewer per comment
);

-- A viewer never sees comments from people they blocked.
CREATE TABLE user_blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
