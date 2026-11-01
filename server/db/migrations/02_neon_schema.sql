-- ==============================================================================
-- KURO NAMI / QWISH — NEON POSTGRESQL SCHEMA MIGRATION
-- Endpoint: ep-gentle-feather-b4xzu1k9.us-east-2.aws.neon.tech
-- Domain: High-Throughput Catalog Caching, Episode Metadata & Stream Analytics
-- ==============================================================================

-- 1. Anime Catalog Index
CREATE TABLE IF NOT EXISTS public.anime_catalog (
  id TEXT PRIMARY KEY,
  anilist_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  title_english TEXT,
  title_romaji TEXT,
  description TEXT,
  cover_image TEXT,
  banner_image TEXT,
  format TEXT DEFAULT 'TV',
  status TEXT DEFAULT 'RELEASING',
  season TEXT,
  season_year INTEGER,
  episodes_count INTEGER DEFAULT 0,
  duration_minutes INTEGER DEFAULT 24,
  average_score INTEGER DEFAULT 80,
  popularity INTEGER DEFAULT 0,
  genres TEXT[] DEFAULT '{}',
  studios TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Episodes Index & Cloudflare Stream mapping
CREATE TABLE IF NOT EXISTS public.episodes (
  id TEXT PRIMARY KEY,
  anime_id TEXT NOT NULL REFERENCES public.anime_catalog(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT,
  cloudflare_video_id TEXT,
  is_published BOOLEAN DEFAULT TRUE,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anime_id, episode_number)
);

-- 3. Streaming Sources
CREATE TABLE IF NOT EXISTS public.streaming_sources (
  id TEXT PRIMARY KEY,
  anime_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL, -- 'mp4', 'hls', 'embed'
  quality TEXT DEFAULT '1080p',
  language TEXT DEFAULT 'Japanese (Sub)',
  is_active BOOLEAN DEFAULT TRUE,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. High-Frequency Watch Progress Telemetry
CREATE TABLE IF NOT EXISTS public.watch_progress (
  id TEXT PRIMARY KEY,
  user_identifier TEXT NOT NULL,
  anime_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  current_time_seconds NUMERIC(10, 2) NOT NULL DEFAULT 0,
  duration_seconds NUMERIC(10, 2) NOT NULL DEFAULT 0,
  completion_percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE WHEN duration_seconds > 0 THEN (current_time_seconds / duration_seconds) * 100 ELSE 0 END
  ) STORED,
  last_watched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create fast query indices
CREATE INDEX IF NOT EXISTS idx_anime_catalog_anilist ON public.anime_catalog(anilist_id);
CREATE INDEX IF NOT EXISTS idx_episodes_anime_number ON public.episodes(anime_id, episode_number);
CREATE INDEX IF NOT EXISTS idx_watch_progress_user ON public.watch_progress(user_identifier);
