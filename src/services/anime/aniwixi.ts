export const ANIWIXI_BASE_URL = 'https://aniwixi.xyz/wp-json/aniwixi/v1';

export interface AniwixiAnimeItem {
  id?: number | string;
  anilist_id?: number | string;
  title?: string | { romaji?: string; english?: string; native?: string };
  name?: string;
  poster?: string;
  cover?: string;
  image?: string;
  synopsis?: string;
  description?: string;
  total_episodes?: number;
  episodes_count?: number;
  episodes?: any[];
  status?: string;
  type?: string;
  genres?: string[];
  [key: string]: any;
}

export interface AniwixiEpisodeSource {
  name?: string;
  server?: string;
  provider?: string;
  url?: string;
  link?: string;
  embedUrl?: string;
  file?: string;
  type?: string;
  quality?: string;
  language?: string;
  is_m3u8?: boolean;
  [key: string]: any;
}

export interface AniwixiEpisodeDetails {
  episodeNumber?: number;
  episode?: number;
  title?: string;
  sources?: AniwixiEpisodeSource[];
  servers?: AniwixiEpisodeSource[];
  links?: AniwixiEpisodeSource[];
  streamUrl?: string;
  embedUrl?: string;
  [key: string]: any;
}

export interface AniwixiListResponse {
  page?: number;
  per_page?: number;
  total?: number;
  total_pages?: number;
  data?: AniwixiAnimeItem[];
  results?: AniwixiAnimeItem[];
  [key: string]: any;
}

// In-memory cache for client side
const cache = new Map<string, { data: any; expiry: number }>();

function getFromCache<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setToCache<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

/**
  Helper fetch function for Aniwixi API
 */
async function fetchAniwixi<T>(url: string, fallbackServerPath?: string, timeoutMs = 8000): Promise<T> {
  const cacheKey = `aniwixi_${url}`;
  const cached = getFromCache<T>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Aniwixi HTTP error ${res.status}`);
    }

    const json = await res.json();
    setToCache(cacheKey, json, 5 * 60 * 1000);
    return json as T;
  } catch (err: any) {
    clearTimeout(timeoutId);

    // Try server proxy fallback if available
    if (fallbackServerPath) {
      try {
        const proxyRes = await fetch(`/api/aniwixi${fallbackServerPath}`);
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          setToCache(cacheKey, json, 5 * 60 * 1000);
          return json as T;
        }
      } catch (_proxyErr) {
        // Silent fallback
      }
    }

    throw err;
  }
}

/**
 * SEARCH:
 * GET https://aniwixi.xyz/wp-json/aniwixi/v1/search?q={query}
 */
export async function searchAniwixiAnime(query: string): Promise<AniwixiAnimeItem[]> {
  if (!query || !query.trim()) return [];
  const q = encodeURIComponent(query.trim());
  const url = `${ANIWIXI_BASE_URL}/search?q=${q}`;
  
  try {
    const data = await fetchAniwixi<any>(url, `/search?q=${q}`);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.data)) return data.data;
    return [];
  } catch (_err) {
    return [];
  }
}

/**
 * ANIME:
 * GET https://aniwixi.xyz/wp-json/aniwixi/v1/anilist/id?id={id}
 */
export async function getAniwixiAnime(id: string | number): Promise<AniwixiAnimeItem | null> {
  if (!id) return null;
  const cleanId = String(id).trim();
  const url = `${ANIWIXI_BASE_URL}/anilist/id?id=${encodeURIComponent(cleanId)}`;

  try {
    const data = await fetchAniwixi<any>(url, `/anilist/id?id=${encodeURIComponent(cleanId)}`);
    if (data && typeof data === 'object') {
      return (data.data || data.anime || data) as AniwixiAnimeItem;
    }
    return null;
  } catch (_err) {
    // Try secondary endpoint path format
    try {
      const altUrl = `${ANIWIXI_BASE_URL}/anilist/${encodeURIComponent(cleanId)}`;
      const altData = await fetchAniwixi<any>(altUrl, `/anilist/${encodeURIComponent(cleanId)}`);
      return (altData?.data || altData?.anime || altData) as AniwixiAnimeItem;
    } catch {
      return null;
    }
  }
}

/**
 * EPISODE:
 * GET https://aniwixi.xyz/wp-json/aniwixi/v1/anilist/id/ep/num
 */
export async function getAniwixiEpisode(id: string | number, episodeNumber: number | string): Promise<AniwixiEpisodeDetails | null> {
  if (!id) return null;
  const cleanId = String(id).trim();
  const epNum = Number(episodeNumber) || 1;
  const url = `${ANIWIXI_BASE_URL}/anilist/id/ep/num?id=${encodeURIComponent(cleanId)}&ep=${epNum}&num=${epNum}`;

  try {
    const data = await fetchAniwixi<any>(url, `/anilist/id/ep/num?id=${encodeURIComponent(cleanId)}&ep=${epNum}&num=${epNum}`);
    if (data && typeof data === 'object') {
      return data as AniwixiEpisodeDetails;
    }
    return null;
  } catch (_err) {
    // Try alternate path structure: /anilist/{id}/ep/{num}
    try {
      const altUrl = `${ANIWIXI_BASE_URL}/anilist/${encodeURIComponent(cleanId)}/ep/${epNum}`;
      const altData = await fetchAniwixi<any>(altUrl, `/anilist/${encodeURIComponent(cleanId)}/ep/${epNum}`);
      return altData as AniwixiEpisodeDetails;
    } catch {
      return null;
    }
  }
}

/**
 * ANIME LIST:
 * GET https://aniwixi.xyz/wp-json/aniwixi/v1/anime?page={page}&per_page={perPage}
 */
export async function getAniwixiAnimeList(page = 1, perPage = 20): Promise<AniwixiListResponse> {
  const p = Math.max(1, page);
  const limit = Math.max(1, Math.min(100, perPage));
  const url = `${ANIWIXI_BASE_URL}/anime?page=${p}&per_page=${limit}`;

  try {
    const data = await fetchAniwixi<any>(url, `/anime?page=${p}&per_page=${limit}`);
    if (Array.isArray(data)) {
      return {
        page: p,
        per_page: limit,
        data,
      };
    }
    return {
      page: data.page || p,
      per_page: data.per_page || limit,
      total: data.total || 0,
      data: data.data || data.results || data.anime || [],
    };
  } catch (_err) {
    return {
      page: p,
      per_page: limit,
      data: [],
    };
  }
}

export const AniwixiAPI = {
  searchAniwixiAnime,
  getAniwixiAnime,
  getAniwixiEpisode,
  getAniwixiAnimeList,
};

export default AniwixiAPI;
