-- ==============================================================================
-- KURO NAMI — PLAYBACK SOURCES SCHEMA (VCDN & MEDIA.CM INTEGRATION)
-- Project: xkwoblrgneiihzywfuep
-- Domain: Episode Multi-Provider Video Storage, Publication Status & RLS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.playback_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anime_id INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  season_number INTEGER DEFAULT 1,
  language TEXT NOT NULL DEFAULT 'sub' CHECK (language IN ('sub', 'dub')),
  provider TEXT NOT NULL CHECK (provider IN ('vcdn', 'media_cm', 'cloudflare_stream', 'authorized_partner')),
  provider_video_id TEXT,
  embed_url TEXT,
  playback_url TEXT,
  quality TEXT DEFAULT '1080p',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  processing_status TEXT NOT NULL DEFAULT 'ready' CHECK (processing_status IN ('processing', 'ready', 'failed')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  title TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensures multiple sources can coexist per episode without collision
  UNIQUE(anime_id, season_number, episode_number, provider, language)
);

-- Indices for rapid episode lookup
CREATE INDEX IF NOT EXISTS idx_playback_sources_lookup 
  ON public.playback_sources(anime_id, episode_number, season_number, is_published);

-- Row Level Security (RLS) Policies
ALTER TABLE public.playback_sources ENABLE ROW LEVEL SECURITY;

-- 1. Public can only read published ready playback sources
DROP POLICY IF EXISTS "Public can view published playback sources" ON public.playback_sources;
CREATE POLICY "Public can view published playback sources"
  ON public.playback_sources FOR SELECT
  USING (is_published = TRUE AND processing_status = 'ready');

-- 2. Service role / authenticated admins can manage all playback sources
DROP POLICY IF EXISTS "Admins can manage playback sources" ON public.playback_sources;
CREATE POLICY "Admins can manage playback sources"
  ON public.playback_sources FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'service_role' OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );
