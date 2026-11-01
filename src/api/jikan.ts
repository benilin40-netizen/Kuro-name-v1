import { AnimeMedia } from '../types/anime.ts';

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

// In-memory cache for Jikan responses
const jikanCache = new Map<string, { data: any; expiry: number }>();

function getCached<T>(key: string): T | null {
  const entry = jikanCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    jikanCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs = 10 * 60 * 1000): void {
  jikanCache.set(key, { data, expiry: Date.now() + ttlMs });
}

/**
 * Executes a REST call to Jikan v4 API with timeout and rate limit handling
 */
export async function jikanFetch<T = any>(endpoint: string, timeoutMs = 5000): Promise<T> {
  const cacheKey = `jikan_${endpoint}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${JIKAN_BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Jikan API returned ${response.status}`);
    }

    const json = await response.json();
    setCache(cacheKey, json.data, 10 * 60 * 1000);
    return json.data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Transforms Jikan Anime item to standard AnimeMedia interface
 */
export function mapJikanToAnimeMedia(item: any): AnimeMedia {
  return {
    id: item.mal_id,
    idMal: item.mal_id,
    title: {
      romaji: item.title,
      english: item.title_english || item.title,
      native: item.title_japanese || null,
    },
    description: item.synopsis || null,
    bannerImage: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || null,
    coverImage: {
      extraLarge: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || '',
      large: item.images?.webp?.image_url || item.images?.jpg?.image_url || '',
      medium: item.images?.webp?.small_image_url || item.images?.jpg?.small_image_url || '',
      color: null,
    },
    format: item.type || 'TV',
    status: item.airing ? 'RELEASING' : item.status === 'Finished Airing' ? 'FINISHED' : 'NOT_YET_RELEASED',
    episodes: item.episodes || null,
    duration: item.duration ? parseInt(item.duration, 10) || null : null,
    season: item.season ? item.season.toUpperCase() : null,
    seasonYear: item.year || null,
    averageScore: item.score ? Math.round(item.score * 10) : null,
    meanScore: item.score ? Math.round(item.score * 10) : null,
    popularity: item.members || 0,
    genres: (item.genres || []).map((g: any) => g.name),
    studios: {
      nodes: (item.studios || []).map((s: any) => ({ id: s.mal_id, name: s.name })),
    },
    nextAiringEpisode: null,
    trailer: item.trailer?.youtube_id
      ? { id: item.trailer.youtube_id, site: 'youtube', thumbnail: item.trailer.images?.large_image_url }
      : null,
  };
}

export const JikanAPI = {
  async getTopAnime(page = 1, filter?: string): Promise<AnimeMedia[]> {
    const query = filter ? `/top/anime?page=${page}&filter=${filter}` : `/top/anime?page=${page}`;
    const data = await jikanFetch<any[]>(query);
    return (data || []).map(mapJikanToAnimeMedia);
  },

  async searchAnime(query: string, page = 1, limit = 20): Promise<AnimeMedia[]> {
    const data = await jikanFetch<any[]>(`/anime?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    return (data || []).map(mapJikanToAnimeMedia);
  },

  async getAnimeById(id: number): Promise<AnimeMedia> {
    const data = await jikanFetch<any>(`/anime/${id}`);
    return mapJikanToAnimeMedia(data);
  },

  async getAnimeFull(id: number): Promise<any> {
    return jikanFetch<any>(`/anime/${id}/full`);
  },

  async getAnimeEpisodes(id: number, page = 1): Promise<any[]> {
    return jikanFetch<any[]>(`/anime/${id}/episodes?page=${page}`);
  },

  async getAnimeCharacters(id: number): Promise<any[]> {
    return jikanFetch<any[]>(`/anime/${id}/characters`);
  },

  async getAnimeStaff(id: number): Promise<any[]> {
    return jikanFetch<any[]>(`/anime/${id}/staff`);
  },

  async getAnimeRecommendations(id: number): Promise<any[]> {
    return jikanFetch<any[]>(`/anime/${id}/recommendations`);
  },

  async getAnimeRelations(id: number): Promise<any[]> {
    return jikanFetch<any[]>(`/anime/${id}/relations`);
  },

  async getAnimePictures(id: number): Promise<any[]> {
    return jikanFetch<any[]>(`/anime/${id}/pictures`);
  },

  async getAnimeReviews(id: number, page = 1): Promise<any[]> {
    return jikanFetch<any[]>(`/anime/${id}/reviews?page=${page}`);
  },

  async getSeasonsNow(page = 1): Promise<AnimeMedia[]> {
    const data = await jikanFetch<any[]>(`/seasons/now?page=${page}`);
    return (data || []).map(mapJikanToAnimeMedia);
  },

  async getUpcomingAnime(page = 1): Promise<AnimeMedia[]> {
    const data = await jikanFetch<any[]>(`/seasons/upcoming?page=${page}`);
    return (data || []).map(mapJikanToAnimeMedia);
  },

  async getSeasonalAnime(year: number, season: string, page = 1): Promise<AnimeMedia[]> {
    const data = await jikanFetch<any[]>(`/seasons/${year}/${season.toLowerCase()}?page=${page}`);
    return (data || []).map(mapJikanToAnimeMedia);
  },

  async getGenres(): Promise<any[]> {
    return jikanFetch<any[]>(`/genres/anime`);
  },

  async getAnimeNews(animeId?: number): Promise<any[]> {
    const endpoint = animeId ? `/anime/${animeId}/news` : `/news`;
    return jikanFetch<any[]>(endpoint);
  },
};
