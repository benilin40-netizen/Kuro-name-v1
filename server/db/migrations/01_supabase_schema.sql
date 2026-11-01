-- ==============================================================================
-- KURO NAMI / QWISH — SUPABASE SCHEMA MIGRATION
-- Project: xkwoblrgneiihzywfuep
-- Domain: User Management, Watchlists, Favorites, and Row Level Security
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table linked to Supabase auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT DEFAULT '',
  favourite_genres TEXT[] DEFAULT '{}',
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User Watchlist Table
CREATE TABLE IF NOT EXISTS public.user_watchlists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  anime_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('WATCHING', 'PLAN_TO_WATCH', 'COMPLETED', 'DROPPED', 'ON_HOLD')),
  score NUMERIC(3, 1) DEFAULT NULL,
  episodes_watched INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, anime_id)
);

-- 3. User Favorites Table
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  anime_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, anime_id)
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can view profiles, users can only update their own
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT 
  USING (true);

CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Watchlists: Users can view and manage their own watchlist
CREATE POLICY "Users can view own watchlist" 
  ON public.user_watchlists FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into own watchlist" 
  ON public.user_watchlists FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist" 
  ON public.user_watchlists FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete from own watchlist" 
  ON public.user_watchlists FOR DELETE 
  USING (auth.uid() = user_id);

-- Favorites: Users can view and manage their own favorites
CREATE POLICY "Users can view own favorites" 
  ON public.user_favorites FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into own favorites" 
  ON public.user_favorites FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete from own favorites" 
  ON public.user_favorites FOR DELETE 
  USING (auth.uid() = user_id);
