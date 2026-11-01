import { db } from './db.ts';

export interface AniKotoAnimeItem {
  id: number;
  title: string;
  alternative?: string;
  titles?: string;
  native?: string;
  slug?: string;
  rating?: string;
  poster: string;
  is_sub?: number;
  is_dub?: number;
  description?: string;
  aired?: string;
  season?: string;
  year?: number | string;
  duration?: string;
  status?: string;
  episodes?: number | string;
  terms_by_type?: {
    genre?: string[];
    producers?: string[];
    studios?: string[];
    type?: string[];
  };
}

export interface AniKotoEpisodeItem {
  id: number;
  title: string;
  jp_title?: string;
  number: number;
  episode_embed_id?: string;
  embed_url: {
    sub?: string;
    dub?: string;
  };
  updated_at?: string;
}

export interface AniKotoSeriesResponse {
  anime: AniKotoAnimeItem;
  episodes: AniKotoEpisodeItem[];
}

export interface ProviderHealth {
  provider: 'anikoto';
  status: 'online' | 'degraded' | 'offline';
  apiUrl: string;
  lastSuccessfulRequest: string | null;
  lastFailedRequest: string | null;
  lastError: string | null;
  cachedEntries: number;
  totalCatalogCount: number;
}

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

export class AniKotoProvider {
  private static instance: AniKotoProvider;
  private readonly baseUrl = 'https://anikotoapi.site';
  private memoryCache = new Map<string, CacheEntry<any>>();
  private catalogIndex = new Map<number, AniKotoAnimeItem>();
  private lastSuccessfulRequest: string | null = null;
  private lastFailedRequest: string | null = null;
  private lastError: string | null = null;
  private isOnline = true;
  private rateLimitedUntil = 0;

  private constructor() {
    this.seedCatalogBackground();
  }

  public static getInstance(): AniKotoProvider {
    if (!AniKotoProvider.instance) {
      AniKotoProvider.instance = new AniKotoProvider();
    }
    return AniKotoProvider.instance;
  }

  private async seedCatalogBackground() {
    try {
      console.log('[ANIKOTO PROVIDER] Initializing anime catalog from AniKoto API...');
      for (let page = 1; page <= 4; page++) {
        await this.getRecentAnime(page, 50, false);
      }
      console.log(`[ANIKOTO PROVIDER] Catalog indexed with ${this.catalogIndex.size} real anime.`);
    } catch (err: any) {
      console.warn('[ANIKOTO PROVIDER] Background seeding notice:', err.message);
    }
  }

  public async getRecentAnime(
    page = 1,
    perPage = 20,
    forceRefresh = false
  ): Promise<{ data: AniKotoAnimeItem[]; total: number; page: number; perPage: number }> {
    const cacheKey = `recent_${page}_${perPage}`;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.memoryCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    if (this.rateLimitedUntil > now) {
      const cached = this.memoryCache.get(cacheKey);
      if (cached) return cached.data;
      const allItems = Array.from(this.catalogIndex.values());
      const start = (page - 1) * perPage;
      return {
        data: allItems.slice(start, start + perPage),
        total: allItems.length,
        page,
        perPage,
      };
    }

    try {
      const url = `${this.baseUrl}/recent-anime?page=${page}&per_page=${perPage}`;
      console.log(`[ANIKOTO PROVIDER] Requesting: ${url}`);

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KURO-NAMI-AnimeStreaming/2.0 (+https://kuronami.com)',
        },
      });

      if (res.status === 429) {
        console.warn('[ANIKOTO PROVIDER] Rate limit (HTTP 429). Using cache and backing off.');
        this.rateLimitedUntil = now + 45000;
        this.lastFailedRequest = new Date().toISOString();
        this.lastError = 'Rate limited (HTTP 429)';
        const cached = this.memoryCache.get(cacheKey);
        if (cached) return cached.data;
        const allItems = Array.from(this.catalogIndex.values());
        const start = (page - 1) * perPage;
        return {
          data: allItems.slice(start, start + perPage),
          total: allItems.length,
          page,
          perPage,
        };
      }

      if (!res.ok) {
        throw new Error(`AniKoto API returned HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawData = Array.isArray(json.data) ? json.data : [];

      for (const item of rawData) {
        if (item.id) {
          this.catalogIndex.set(item.id, item);
        }
      }

      const result = {
        data: rawData,
        total: rawData.length >= perPage ? page * perPage + 20 : rawData.length,
        page,
        perPage,
      };

      this.memoryCache.set(cacheKey, {
        data: result,
        cachedAt: now,
        expiresAt: now + 10 * 60 * 1000, // 10 minutes TTL
      });

      this.lastSuccessfulRequest = new Date().toISOString();
      this.lastError = null;
      this.isOnline = true;

      return result;
    } catch (err: any) {
      this.lastFailedRequest = new Date().toISOString();
      this.lastError = err.message;
      this.isOnline = false;
      console.error('[ANIKOTO PROVIDER ERROR] Failed to fetch recent anime:', err.message);

      const cached = this.memoryCache.get(cacheKey);
      if (cached) return cached.data;

      const allItems = Array.from(this.catalogIndex.values());
      const start = (page - 1) * perPage;
      return {
        data: allItems.slice(start, start + perPage),
        total: allItems.length,
        page,
        perPage,
      };
    }
  }

  public async getAnime(id: number, forceRefresh = false): Promise<AniKotoAnimeItem | null> {
    const series = await this.getSeries(id, forceRefresh);
    return series ? series.anime : this.catalogIndex.get(id) || null;
  }

  public async getEpisodes(id: number, forceRefresh = false): Promise<AniKotoEpisodeItem[]> {
    const series = await this.getSeries(id, forceRefresh);
    return series ? series.episodes : [];
  }

  public async getEpisode(
    id: number,
    episodeNumber: number
  ): Promise<{
    anime: AniKotoAnimeItem;
    episode: AniKotoEpisodeItem | null;
    totalEpisodes: number;
    prevEpisode: number | null;
    nextEpisode: number | null;
    availableLanguages: { sub: boolean; dub: boolean };
    embedUrl: { sub?: string; dub?: string };
  } | null> {
    const series = await this.getSeries(id);
    if (!series || !series.anime) return null;

    const episodes = series.episodes || [];
    const episode = episodes.find((e) => e.number === episodeNumber) || episodes[0] || null;

    const currentNumber = episode ? episode.number : episodeNumber;
    const subUrl = episode?.embed_url?.sub?.trim();
    const dubUrl = episode?.embed_url?.dub?.trim();
    const hasSub = !!(subUrl && subUrl.startsWith('http'));
    const hasDub = !!(dubUrl && dubUrl.startsWith('http'));

    const prevEpisode = episodes.some((e) => e.number === currentNumber - 1) ? currentNumber - 1 : null;
    const nextEpisode = episodes.some((e) => e.number === currentNumber + 1) ? currentNumber + 1 : null;

    return {
      anime: series.anime,
      episode,
      totalEpisodes: episodes.length,
      prevEpisode,
      nextEpisode,
      availableLanguages: {
        sub: hasSub,
        dub: hasDub,
      },
      embedUrl: {
        sub: hasSub ? subUrl : undefined,
        dub: hasDub ? dubUrl : undefined,
      },
    };
  }

  public async getSeries(id: number, forceRefresh = false): Promise<AniKotoSeriesResponse | null> {
    if (!id || isNaN(id) || id <= 0) {
      return null;
    }

    const cacheKey = `series_${id}`;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.memoryCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    if (this.rateLimitedUntil > now) {
      const cached = this.memoryCache.get(cacheKey);
      if (cached) return cached.data;
    }

    try {
      const url = `${this.baseUrl}/series/${id}`;
      console.log(`[ANIKOTO PROVIDER] Requesting series: ${url}`);

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KURO-NAMI-AnimeStreaming/2.0 (+https://kuronami.com)',
        },
      });

      if (res.status === 429) {
        console.warn(`[ANIKOTO PROVIDER] Rate limit (HTTP 429) on series ${id}`);
        this.rateLimitedUntil = now + 45000;
        this.lastFailedRequest = new Date().toISOString();
        this.lastError = 'Rate limited (HTTP 429)';
        const cached = this.memoryCache.get(cacheKey);
        return cached ? cached.data : null;
      }

      if (res.status === 404) {
        // Series does not exist in AniKoto catalog (e.g. AniList ID queried)
        // Store negative cache for 15 minutes to avoid repeated lookups
        this.memoryCache.set(cacheKey, {
          data: null,
          cachedAt: now,
          expiresAt: now + 15 * 60 * 1000,
        });
        return null;
      }

      if (!res.ok) {
        throw new Error(`AniKoto API returned HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.ok || !json.data || !json.data.anime) {
        return null;
      }

      const seriesData: AniKotoSeriesResponse = {
        anime: json.data.anime,
        episodes: Array.isArray(json.data.episodes) ? json.data.episodes : [],
      };

      if (seriesData.anime && seriesData.anime.id) {
        this.catalogIndex.set(seriesData.anime.id, seriesData.anime);
      }

      this.memoryCache.set(cacheKey, {
        data: seriesData,
        cachedAt: now,
        expiresAt: now + 30 * 60 * 1000, // 30 minutes TTL
      });

      this.lastSuccessfulRequest = new Date().toISOString();
      this.lastError = null;
      this.isOnline = true;

      return seriesData;
    } catch (err: any) {
      this.lastFailedRequest = new Date().toISOString();
      this.lastError = err.message;
      if (!err.message?.includes('404')) {
        console.error(`[ANIKOTO PROVIDER ERROR] Failed to fetch series #${id}:`, err.message);
      }

      const cached = this.memoryCache.get(cacheKey);
      return cached ? cached.data : null;
    }
  }

  public async search(query: string, page = 1, perPage = 24): Promise<{ data: AniKotoAnimeItem[]; total: number }> {
    const cleanQ = (query || '').trim().toLowerCase();
    if (!cleanQ) {
      const recent = await this.getRecentAnime(page, perPage);
      return { data: recent.data, total: recent.total };
    }

    if (this.catalogIndex.size < 60) {
      await this.getRecentAnime(1, 50);
      await this.getRecentAnime(2, 50);
    }

    const all = Array.from(this.catalogIndex.values());
    const matched = all.filter((item) => {
      const titleMatch = item.title?.toLowerCase().includes(cleanQ);
      const altMatch = item.alternative?.toLowerCase().includes(cleanQ);
      const titlesMatch = item.titles?.toLowerCase().includes(cleanQ);
      const nativeMatch = item.native?.toLowerCase().includes(cleanQ);
      const genreMatch = item.terms_by_type?.genre?.some((g) => g.toLowerCase().includes(cleanQ));
      const studioMatch = item.terms_by_type?.studios?.some((s) => s.toLowerCase().includes(cleanQ));
      return titleMatch || altMatch || titlesMatch || nativeMatch || genreMatch || studioMatch;
    });

    const start = (page - 1) * perPage;
    return {
      data: matched.slice(start, start + perPage),
      total: matched.length,
    };
  }

  public async getGenres(): Promise<{ genre: string; count: number }[]> {
    if (this.catalogIndex.size < 50) {
      await this.getRecentAnime(1, 50);
    }

    const genreMap = new Map<string, number>();
    for (const item of this.catalogIndex.values()) {
      const genres = item.terms_by_type?.genre || [];
      for (const g of genres) {
        genreMap.set(g, (genreMap.get(g) || 0) + 1);
      }
    }

    const list = Array.from(genreMap.entries()).map(([genre, count]) => ({ genre, count }));
    list.sort((a, b) => b.count - a.count);
    return list;
  }

  public getHealth(): ProviderHealth {
    return {
      provider: 'anikoto',
      status: this.isOnline ? (this.rateLimitedUntil > Date.now() ? 'degraded' : 'online') : 'offline',
      apiUrl: this.baseUrl,
      lastSuccessfulRequest: this.lastSuccessfulRequest,
      lastFailedRequest: this.lastFailedRequest,
      lastError: this.lastError,
      cachedEntries: this.memoryCache.size,
      totalCatalogCount: this.catalogIndex.size,
    };
  }
}

export const AniKotoService = AniKotoProvider;
