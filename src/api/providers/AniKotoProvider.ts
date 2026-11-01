import { AnimeMedia, AniListMediaResponse } from '../../types/anime.ts';

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

/**
 * AniKoto Provider
 * Interfaces with https://anikotoapi.site via secure backend proxy endpoints.
 * Provides caching and robust error handling for recent anime and series metadata.
 */
export class AniKotoProvider {
  private static instance: AniKotoProvider;
  private cache = new Map<string, CacheItem<any>>();

  public static getInstance(): AniKotoProvider {
    if (!AniKotoProvider.instance) {
      AniKotoProvider.instance = new AniKotoProvider();
    }
    return AniKotoProvider.instance;
  }

  private getCached<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetches recent anime releases from AniKoto via secure backend proxy
   */
  async getRecentAnime(page = 1, perPage = 20): Promise<AniListMediaResponse> {
    const cacheKey = `recent_${page}_${perPage}`;
    const cached = this.getCached<AniListMediaResponse>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`/api/anime/recent?page=${page}&perPage=${perPage}`);
      if (!res.ok) {
        throw new Error(`AniKoto proxy HTTP ${res.status}: ${res.statusText}`);
      }
      const data: AniListMediaResponse = await res.json();
      this.setCache(cacheKey, data);
      return data;
    } catch (err) {
      console.error('[ANIKOTO PROVIDER] Failed to fetch recent anime:', err);
      return {
        media: [],
        pageInfo: { total: 0, currentPage: page, perPage, hasNextPage: false },
      };
    }
  }

  /**
   * Fetches anime series details from AniKoto via secure backend proxy
   */
  async getSeries(animeId: number): Promise<AnimeMedia | null> {
    if (!animeId) return null;
    const cacheKey = `series_${animeId}`;
    const cached = this.getCached<AnimeMedia>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`/api/anime/${animeId}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`AniKoto proxy HTTP ${res.status}: ${res.statusText}`);
      }
      const data: AnimeMedia = await res.json();
      if (data) {
        this.setCache(cacheKey, data);
      }
      return data;
    } catch (err) {
      console.error(`[ANIKOTO PROVIDER] Failed to fetch series #${animeId}:`, err);
      return null;
    }
  }

  /**
   * Fetches episode list for an anime series
   */
  async getEpisodes(animeId: number): Promise<any[]> {
    if (!animeId) return [];
    const cacheKey = `episodes_${animeId}`;
    const cached = this.getCached<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`/api/anime/${animeId}/episodes`);
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      this.setCache(cacheKey, list);
      return list;
    } catch (err) {
      console.error(`[ANIKOTO PROVIDER] Failed to fetch episodes for anime #${animeId}:`, err);
      return [];
    }
  }

  /**
   * Fetches specific episode configuration
   */
  async getEpisode(animeId: number, episodeNumber: number): Promise<any | null> {
    if (!animeId || !episodeNumber) return null;
    const cacheKey = `episode_${animeId}_${episodeNumber}`;
    const cached = this.getCached<any>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`/api/anime/${animeId}/episode/${episodeNumber}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data) {
        this.setCache(cacheKey, data);
      }
      return data;
    } catch (err) {
      console.error(`[ANIKOTO PROVIDER] Failed to fetch episode #${episodeNumber} for anime #${animeId}:`, err);
      return null;
    }
  }
}

export const AniKotoClient = AniKotoProvider.getInstance();

export const getRecentAnime = (page?: number, perPage?: number) =>
  AniKotoClient.getRecentAnime(page, perPage);

export const getSeries = (animeId: number) => AniKotoClient.getSeries(animeId);
