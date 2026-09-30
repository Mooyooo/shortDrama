-- Content catalog: series, episodes, their videos, subtitles, tags and Discover collections.
-- See the Content Pipeline Design doc for the model and the publishing workflow.

CREATE TABLE video_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_uid        TEXT UNIQUE NOT NULL,           -- Cloudflare Stream video uid
  status            TEXT NOT NULL DEFAULT 'uploading'
                    CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  duration_seconds  NUMERIC,
  width             INT,
  height            INT,
  thumbnail_url     TEXT,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE series (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  title             TEXT NOT NULL,
  synopsis          TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'ready', 'scheduled', 'published', 'unpublished')),
  free_episodes     INT NOT NULL DEFAULT 5 CHECK (free_episodes >= 0),
  coin_price        INT NOT NULL DEFAULT 30 CHECK (coin_price >= 0),   -- per locked episode
  age_rating        TEXT,
  content_owner     TEXT NOT NULL DEFAULT 'shortDrama',
  license_ends_on   DATE,                           -- NULL for our own productions
  cover_url         TEXT,                           -- vertical 3:4
  banner_url        TEXT,                           -- wide, for the Discover carousel
  trailer_video_id  UUID REFERENCES video_assets(id),
  release_at        TIMESTAMPTZ,                    -- set when status = 'scheduled'
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE episodes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id    UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  number       INT NOT NULL CHECK (number > 0),
  title        TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'ready', 'scheduled', 'published', 'unpublished')),
  coin_price   INT CHECK (coin_price >= 0),         -- NULL = the series price
  video_id     UUID REFERENCES video_assets(id),   -- what viewers get: always a ready video
  -- A new upload waits here until Stream reports it ready, then replaces video_id,
  -- so replacing a video never shows viewers a broken episode.
  pending_video_id UUID REFERENCES video_assets(id),
  release_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (series_id, number)
);

CREATE TABLE subtitle_tracks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id  UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  language    TEXT NOT NULL,                        -- BCP 47, e.g. 'en'
  url         TEXT NOT NULL,                        -- WebVTT file
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (episode_id, language)
);

CREATE TABLE tags (
  id    SERIAL PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  kind  TEXT NOT NULL DEFAULT 'genre' CHECK (kind IN ('genre', 'trope', 'mood'))
);

CREATE TABLE series_tags (
  series_id  UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  tag_id     INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (series_id, tag_id)
);

-- Hand-ordered rows on Discover: Trending, New, Top, the banner carousel.
CREATE TABLE collections (
  id        SERIAL PRIMARY KEY,
  slug      TEXT UNIQUE NOT NULL,
  name      TEXT NOT NULL,
  position  INT NOT NULL DEFAULT 0
);

CREATE TABLE collection_items (
  collection_id  INT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  series_id      UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  position       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, series_id)
);

CREATE INDEX idx_episodes_series ON episodes (series_id, number);
CREATE INDEX idx_series_published ON series (published_at DESC) WHERE status = 'published';
