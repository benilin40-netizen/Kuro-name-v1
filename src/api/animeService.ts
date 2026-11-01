import {
  AnimeMedia,
  AnimeTitle,
  CoverImage,
  NextAiringEpisode,
  AiringScheduleItem,
  NewsArticle,
  VideoSource,
  WatchlistItem,
  WatchHistoryItem,
  UserProfileData,
  User,
  SearchFilterState,
  AniListMediaResponse,
  SeasonalAnimeResponse,
  PageInfo,
} from '../types/anime.ts';

import * as AniListAPI from './anilist.ts';
import { JikanAPI } from './jikan.ts';
import { collectEpisodeSources, AggregatedStreamSource } from '../services/streamingAggregator.ts';

// Re-export core types for components that import them directly from animeService
export type {
  AnimeMedia,
  AnimeTitle,
  CoverImage,
  NextAiringEpisode,
  AiringScheduleItem,
  NewsArticle,
  VideoSource,
  WatchlistItem,
  WatchHistoryItem,
  UserProfileData,
  User,
  SearchFilterState,
  AniListMediaResponse,
  SeasonalAnimeResponse,
  PageInfo,
};

export interface TrendingAnimeResponse extends AniListMediaResponse {}
export interface AiringAnimeResponse extends AniListMediaResponse {}

// In-memory client cache with TTL
const serviceCache = new Map<string, { data: any; expiry: number }>();

function getCached<T>(key: string): T | null {
  const entry = serviceCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    serviceCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  serviceCache.set(key, { data, expiry: Date.now() + ttlMs });
}

const TOKEN_KEY = 'kuronami_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('anivera_auth_token');
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('anivera_auth_token');
  }
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// -----------------------------------------------------------------------------
// CENTRAL ANIME SERVICE LOGIC (AniList GraphQL -> Jikan REST Fallback -> Backend Proxy)
// -----------------------------------------------------------------------------

/**
 * 1. Fetch currently trending anime
 */
export async function getTrendingAnime(page = 1, perPage = 10): Promise<AniListMediaResponse> {
  const cacheKey = `srv_trending_${page}_${perPage}`;
  const cached = getCached<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  // 1. Try local server proxy with backend caching
  try {
    const res = await fetch(`/api/anime/trending?page=${page}&perPage=${perPage}`);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCache(cacheKey, json, 10 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall through
  }

  // 2. Primary: Direct AniList GraphQL Query
  try {
    const result = await AniListAPI.getTrendingAnime(page, perPage);
    setCache(cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch (aniErr) {
    console.warn('AniList trending failed, falling back to Jikan:', aniErr);
  }

  // 3. Fallback: Secondary Jikan API
  try {
    const jikanMedia = await JikanAPI.getTopAnime(page, 'bypopularity');
    const result: AniListMediaResponse = {
      media: jikanMedia.slice(0, perPage),
      pageInfo: { hasNextPage: jikanMedia.length >= perPage },
    };
    setCache(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch (jikanErr) {
    console.error('All trending sources failed:', jikanErr);
    return { media: [], pageInfo: { hasNextPage: false } };
  }
}

/**
 * 2. Fetch currently airing anime
 */
export async function getAiringAnime(page = 1, perPage = 15): Promise<AniListMediaResponse> {
  const cacheKey = `srv_airing_${page}_${perPage}`;
  const cached = getCached<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  // 1. Try local server proxy
  try {
    const res = await fetch(`/api/anime/airing?page=${page}&perPage=${perPage}`);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCache(cacheKey, json, 3 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall through
  }

  // 2. Primary: Direct AniList GraphQL Query
  try {
    const result = await AniListAPI.getAiringAnime(page, perPage);
    setCache(cacheKey, result, 3 * 60 * 1000);
    return result;
  } catch (aniErr) {
    console.warn('AniList airing failed, falling back to Jikan:', aniErr);
  }

  // 3. Fallback: Secondary Jikan API
  try {
    const jikanMedia = await JikanAPI.getTopAnime(page, 'airing');
    const result: AniListMediaResponse = {
      media: jikanMedia.slice(0, perPage),
      pageInfo: { hasNextPage: jikanMedia.length >= perPage },
    };
    setCache(cacheKey, result, 3 * 60 * 1000);
    return result;
  } catch (jikanErr) {
    console.error('All airing sources failed:', jikanErr);
    return { media: [], pageInfo: { hasNextPage: false } };
  }
}

/**
 * 3. Fetch seasonal anime dynamically
 */
export async function getSeasonalAnime(
  season?: string,
  seasonYear?: number,
  page = 1,
  perPage = 16
): Promise<SeasonalAnimeResponse> {
  const current = AniListAPI.getCurrentSeason();
  const targetSeason = season || current.season;
  const targetYear = seasonYear || current.year;

  const cacheKey = `srv_seasonal_${targetSeason}_${targetYear}_${page}_${perPage}`;
  const cached = getCached<SeasonalAnimeResponse>(cacheKey);
  if (cached) return cached;

  // 1. Try local server proxy
  try {
    const params = new URLSearchParams({
      season: targetSeason,
      year: targetYear.toString(),
      page: page.toString(),
      perPage: perPage.toString(),
    });
    const res = await fetch(`/api/anime/seasonal?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCache(cacheKey, json, 10 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall through
  }

  // 2. Primary: Direct AniList GraphQL Query
  try {
    const result = await AniListAPI.getSeasonalAnime(targetSeason, targetYear, page, perPage);
    setCache(cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch (aniErr) {
    console.warn('AniList seasonal query failed, falling back to Jikan:', aniErr);
  }

  // 3. Fallback: Jikan
  try {
    const jikanMedia = await JikanAPI.getSeasonalAnime(targetYear, targetSeason);
    const result: SeasonalAnimeResponse = {
      media: jikanMedia.slice(0, perPage),
      season: targetSeason,
      year: targetYear,
      pageInfo: { hasNextPage: jikanMedia.length >= perPage },
    };
    setCache(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch (jikanErr) {
    console.error('All seasonal sources failed:', jikanErr);
    return { media: [], season: targetSeason, year: targetYear, pageInfo: { hasNextPage: false } };
  }
}

export const getCurrentSeason = getSeasonalAnime;
export const getCurrentSeasonInfo = AniListAPI.getCurrentSeason;

/**
 * 4. Recent Anime Releases via Backend AniKoto Proxy
 */
export async function getRecentAnime(page = 1, perPage = 20): Promise<AniListMediaResponse> {
  const cacheKey = `srv_recent_${page}_${perPage}`;
  const cached = getCached<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/anime/recent?page=${page}&perPage=${perPage}`);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCache(cacheKey, json, 5 * 60 * 1000);
        return json;
      }
    }
  } catch (err) {
    console.warn('Recent anime backend fetch error:', err);
  }

  return { media: [], pageInfo: { total: 0, currentPage: page, perPage, hasNextPage: false } };
}

export const getRecent = getRecentAnime;

/**
 * Airing Schedule stub: AniKoto API does not document an airing-schedule endpoint.
 * Returns an empty array without making unsupported network requests.
 */
export async function getAiringSchedule(days = 7): Promise<AiringScheduleItem[]> {
  try {
    return await AniListAPI.getAiringSchedule(days);
  } catch (_e) {
    return [];
  }
}

/**
 * 5. Fetch all-time popular anime
 */
export async function getPopularAnime(page = 1, perPage = 12): Promise<AniListMediaResponse> {
  const cacheKey = `srv_popular_${page}_${perPage}`;
  const cached = getCached<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/anime/popular?page=${page}&perPage=${perPage}`);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCache(cacheKey, json, 20 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall through
  }

  try {
    const result = await AniListAPI.getPopularAnime(page, perPage);
    setCache(cacheKey, result, 20 * 60 * 1000);
    return result;
  } catch {
    const jikanMedia = await JikanAPI.getTopAnime(page);
    return { media: jikanMedia.slice(0, perPage), pageInfo: { hasNextPage: false } };
  }
}

/**
 * 6. Fetch upcoming anime
 */
export async function getUpcomingAnime(page = 1, perPage = 12): Promise<AniListMediaResponse> {
  const cacheKey = `srv_upcoming_${page}_${perPage}`;
  const cached = getCached<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/anime/upcoming?page=${page}&perPage=${perPage}`);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCache(cacheKey, json, 20 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall through
  }

  try {
    const result = await AniListAPI.getUpcomingAnime(page, perPage);
    setCache(cacheKey, result, 20 * 60 * 1000);
    return result;
  } catch {
    const jikanMedia = await JikanAPI.getTopAnime(page, 'upcoming');
    return { media: jikanMedia.slice(0, perPage), pageInfo: { hasNextPage: false } };
  }
}

/**
 * 7. Fetch full Anime details
 */
export async function getAnimeDetails(id: number): Promise<AnimeMedia> {
  const cacheKey = `srv_details_${id}`;
  const cached = getCached<AnimeMedia>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/anime/${id}`);
    if (res.ok) {
      const json = await res.json();
      setCache(cacheKey, json, 60 * 60 * 1000);
      return json;
    }
  } catch {
    // Fall through
  }

  try {
    const result = await AniListAPI.getAnimeDetails(id);
    setCache(cacheKey, result, 60 * 60 * 1000);
    return result;
  } catch {
    return JikanAPI.getAnimeById(id);
  }
}

/**
 * 8. Search anime
 */
export async function searchAnime(params: SearchFilterState = {}): Promise<AniListMediaResponse> {
  const safeParams = params || {};
  const cacheKey = `srv_search_${JSON.stringify(safeParams)}`;
  const cached = getCached<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const searchParams = new URLSearchParams();
    if (safeParams.query) searchParams.set('query', safeParams.query);
    if (safeParams.genre) searchParams.set('genre', safeParams.genre);
    if (safeParams.year) searchParams.set('year', safeParams.year.toString());
    if (safeParams.season) searchParams.set('season', safeParams.season);
    if (safeParams.status) searchParams.set('status', safeParams.status);
    if (safeParams.format) searchParams.set('format', safeParams.format);
    if (safeParams.sort) searchParams.set('sort', safeParams.sort);
    if (safeParams.page) searchParams.set('page', safeParams.page.toString());
    if (safeParams.perPage) searchParams.set('perPage', safeParams.perPage.toString());

    const res = await fetch(`/api/anime/search?${searchParams.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setCache(cacheKey, json, 5 * 60 * 1000);
      return json;
    }
  } catch {
    // Fall through
  }

  try {
    const result = await AniListAPI.searchAnime(safeParams);
    setCache(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch {
    if (safeParams.query) {
      const jikanMedia = await JikanAPI.searchAnime(safeParams.query, safeParams.page || 1);
      return { media: jikanMedia, pageInfo: { hasNextPage: false } };
    }
    return { media: [], pageInfo: { hasNextPage: false } };
  }
}

/**
 * 9. Fetch anime rankings
 */
export async function getRankings(
  category: 'AIRING' | 'RATED' | 'POPULAR' | 'UPCOMING' | 'MOVIES',
  page = 1,
  perPage = 20
): Promise<AniListMediaResponse> {
  const cacheKey = `srv_rankings_${category}_${page}_${perPage}`;
  const cached = getCached<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/anime/rankings?category=${category}&page=${page}&perPage=${perPage}`);
    if (res.ok) {
      const json = await res.json();
      setCache(cacheKey, json, 15 * 60 * 1000);
      return json;
    }
  } catch {
    // Fall through
  }

  const result = await AniListAPI.getRankings(category, page, perPage);
  setCache(cacheKey, result, 15 * 60 * 1000);
  return result;
}

/**
 * 10. Fetch real anime news
 */
export async function getNews(): Promise<NewsArticle[]> {
  const cacheKey = 'srv_news_feed';
  const cached = getCached<NewsArticle[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch('/api/news');
  if (!res.ok) throw new Error('Failed to fetch anime news');
  const data = await res.json();
  const articlesList = data.articles || (Array.isArray(data) ? data : []);
  setCache(cacheKey, articlesList, 5 * 60 * 1000);
  return articlesList;
}

/**
 * 11. Fetch authorised video stream sources
 */
export async function getVideoSources(animeId: number, episodeId: number, season = 1): Promise<VideoSource[]> {
  try {
    const res = await fetch(`/api/video-sources/${animeId}/${episodeId}?season=${season}`);
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error('Failed to fetch episode video sources:', err);
    return [];
  }
}

/**
 * 12. Fetch all active video sources for an anime (across all episodes)
 */
export async function getAllVideoSourcesForAnime(animeId: number): Promise<VideoSource[]> {
  try {
    const res = await fetch(`/api/video-sources/${animeId}`);
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error('Failed to fetch anime video sources:', err);
    return [];
  }
}

/**
 * 13. Fetch episodes list for an anime
 */
export async function getEpisodes(animeId: number): Promise<any[]> {
  try {
    const res = await fetch(`/api/anime/${animeId}/episodes`);
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error('Failed to fetch anime episodes:', err);
    return [];
  }
}

/**
 * 14. Fetch single episode config
 */
export async function getEpisodeConfig(animeId: number, episodeNumber: number, season = 1): Promise<any> {
  try {
    const res = await fetch(`/api/anime/${animeId}/episode/${episodeNumber}?season=${season}`);
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error('Failed to fetch episode config:', err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// CENTRAL ANIME SERVICE OBJECT EXPORT
// -----------------------------------------------------------------------------
export const AnimeService = {
  getRecent: getRecentAnime,
  getRecentAnime,
  getTrending: getTrendingAnime,
  getTrendingAnime,
  getAiring: getAiringAnime,
  getAiringAnime,
  getCurrentSeason: getSeasonalAnime,
  getSeasonal: getSeasonalAnime,
  getSeasonalAnime,
  getCurrentSeasonInfo,
  getAiringSchedule,
  getPopular: getPopularAnime,
  getPopularAnime,
  getUpcoming: getUpcomingAnime,
  getUpcomingAnime,
  getAnimeDetails,
  searchAnime,
  getRankings,
  getNews,
  getVideoSources,
  getAllVideoSourcesForAnime,
  getEpisodes,
  getEpisodeConfig,

  // Auth
  async register(username: string, email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }
    const data = await res.json();
    setStoredToken(data.token);
    return data;
  },

  async login(username: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    setStoredToken(data.token);
    return data;
  },

  async getMe(): Promise<{ user: User; profile: any } | null> {
    const token = getStoredToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      if (!res.ok) {
        setStoredToken(null);
        return null;
      }
      return res.json();
    } catch {
      return null;
    }
  },

  logout(): void {
    setStoredToken(null);
  },

  // Watchlist
  async getWatchlist(status?: string): Promise<WatchlistItem[]> {
    const url = status && status !== 'ALL' ? `/api/user/watchlist?status=${status}` : '/api/user/watchlist';
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async updateWatchlist(data: {
    anime_id: number;
    status: string;
    progress_episodes?: number;
    score?: number;
    notes?: string;
  }): Promise<WatchlistItem> {
    const res = await fetch('/api/user/watchlist', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update watchlist');
    return res.json();
  },

  async removeFromWatchlist(animeId: number): Promise<boolean> {
    const res = await fetch(`/api/user/watchlist/${animeId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  },

  // Favourites
  async getFavourites(): Promise<number[]> {
    const res = await fetch('/api/user/favourites', { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async toggleFavourite(anime_id: number): Promise<boolean> {
    const res = await fetch('/api/user/favourites/toggle', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ anime_id }),
    });
    if (!res.ok) throw new Error('Failed to toggle favourite');
    const data = await res.json();
    return data.isFavourite;
  },

  // History
  async getWatchHistory(): Promise<WatchHistoryItem[]> {
    const res = await fetch('/api/user/history', { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async recordHistory(anime_id: number, episode_number: number, progress_seconds = 0, duration_seconds = 0): Promise<void> {
    await fetch('/api/user/history', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ anime_id, episode_number, progress_seconds, duration_seconds }),
    });
  },

  // Profile
  async getUserProfile(userId: string): Promise<UserProfileData> {
    const res = await fetch(`/api/user/profile/${userId}`);
    if (!res.ok) throw new Error('User profile not found');
    return res.json();
  },

  // Admin
  async getAdminStats(): Promise<{
    totalUsers: number;
    totalWatchlistEntries: number;
    totalVideoSources: number;
    totalAdminNews: number;
  }> {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  },

  async getAdminVideoSources(): Promise<VideoSource[]> {
    const res = await fetch('/api/admin/video-sources', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  },

  async addAdminVideoSource(source: {
    anime_id: number;
    episode_id: number;
    provider: string;
    title?: string;
    url: string;
    type: string;
    quality?: string;
    language?: string;
    is_active: boolean;
    notes?: string;
    season_number?: number;
    is_default?: number;
    status?: string;
  }): Promise<VideoSource> {
    const res = await fetch('/api/admin/video-sources', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(source),
    });
    if (!res.ok) throw new Error('Failed to add video source');
    return res.json();
  },

  async updateAdminVideoSource(id: string, updates: Partial<VideoSource>): Promise<VideoSource> {
    const res = await fetch(`/api/admin/video-sources/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update source');
    return res.json();
  },

  async deleteAdminVideoSource(id: string): Promise<boolean> {
    const res = await fetch(`/api/admin/video-sources/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  },

  async createAdminNews(news: {
    title: string;
    summary?: string;
    content?: string;
    source?: string;
    url?: string;
    image_url?: string;
    category: string;
    anime_id?: number;
  }): Promise<NewsArticle> {
    const res = await fetch('/api/admin/news', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(news),
    });
    if (!res.ok) throw new Error('Failed to create news');
    return res.json();
  },

  async deleteAdminNews(id: string): Promise<boolean> {
    const res = await fetch(`/api/admin/news/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  },

  async getSiteSettings(): Promise<Record<string, string>> {
    const res = await fetch('/api/settings');
    if (!res.ok) return {};
    return res.json();
  },

  async updateSiteSetting(key: string, value: string): Promise<boolean> {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key, value }),
    });
    return res.ok;
  },

  async getAnimeEpisodesConfig(animeId: number): Promise<any[]> {
    const res = await fetch(`/api/episodes/${animeId}`, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getAdminEpisodes(): Promise<any[]> {
    const res = await fetch('/api/admin/episodes', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  },

  async saveAdminEpisode(config: {
    anime_id: number;
    season_number?: number;
    episode_number: number;
    title: string;
    status: string;
    air_date?: string;
    sub_video_url?: string;
    dub_video_url?: string;
    video_url?: string;
    preview_url?: string;
    thumbnail?: string;
    authorized: boolean;
  }): Promise<any> {
    const res = await fetch('/api/admin/episodes', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to save episode configuration');
    return res.json();
  },

  async deleteAdminEpisode(id: string): Promise<boolean> {
    const res = await fetch(`/api/admin/episodes/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  },

  async getJustalkSources(title: string, episode: number): Promise<{ sources: any[]; error?: string }> {
    if (!title) return { sources: [] };
    try {
      const res = await fetch(`/api/anime/sources?title=${encodeURIComponent(title)}&episode=${episode}`);
      if (!res.ok) return { sources: [], error: 'Failed to fetch sources' };
      return res.json();
    } catch (err: any) {
      console.error('[CLIENT] getJustalkSources error:', err);
      return { sources: [], error: 'Network error fetching sources' };
    }
  },

  async getAggregatedSources(
    anime: AnimeMedia | null,
    animeId: number,
    episodeNumber = 1
  ): Promise<{
    allSources: AggregatedStreamSource[];
    bestPermittedSource: AggregatedStreamSource | null;
    hasEmbeddedSource: boolean;
  }> {
    return collectEpisodeSources(anime, animeId, episodeNumber);
  },
};

export const ClientAnimeService = AnimeService;
export default AnimeService;
