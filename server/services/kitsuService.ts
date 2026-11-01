const KITSU_BASE_URL = 'https://kitsu.io/api/edge';

const kitsuCache = new Map<string, { data: any; expiry: number }>();

let requestCount = 0;
let failedCount = 0;
let lastSuccessTime: string | null = null;
let lastErrorMsg: string | null = null;
let lastLatencyMs = 0;

function getCached<T>(key: string): T | null {
  const entry = kitsuCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    kitsuCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs = 15 * 60 * 1000): void {
  kitsuCache.set(key, { data, expiry: Date.now() + ttlMs });
}

async function fetchKitsu<T = any>(endpoint: string, timeoutMs = 8000): Promise<T> {
  const cacheKey = `srv_kitsu_${endpoint}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  requestCount++;
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${KITSU_BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Kitsu API HTTP ${res.status}`);
    }

    const json = await res.json();
    lastLatencyMs = Date.now() - startTime;
    lastSuccessTime = new Date().toISOString();
    setCache(cacheKey, json, 15 * 60 * 1000);
    return json;
  } catch (err: any) {
    clearTimeout(timeoutId);
    failedCount++;
    lastErrorMsg = err.message || 'Kitsu fetch error';
    lastLatencyMs = Date.now() - startTime;
    console.warn(`[KITSU SERVICE] Failed fetch for ${endpoint}:`, err.message);
    throw err;
  }
}

export function parseKitsuAnimeItem(item: any) {
  if (!item || !item.attributes) return null;
  const attr = item.attributes;
  const titles = attr.titles || {};

  return {
    id: item.id,
    kitsuId: item.id,
    title: {
      english: titles.en || attr.canonicalTitle || '',
      romaji: titles.en_jp || attr.canonicalTitle || '',
      native: titles.ja_jp || null,
      userPreferred: attr.canonicalTitle || titles.en || titles.en_jp || '',
    },
    coverImage: {
      extraLarge: attr.posterImage?.original || attr.posterImage?.large || '',
      large: attr.posterImage?.large || attr.posterImage?.medium || '',
      medium: attr.posterImage?.medium || attr.posterImage?.small || '',
      color: '#f43f5e',
    },
    bannerImage: attr.coverImage?.large || attr.coverImage?.original || attr.posterImage?.large || null,
    description: attr.synopsis || attr.description || '',
    format: (attr.showType || 'TV').toUpperCase(),
    status: (attr.status || 'finished').toUpperCase(),
    episodes: attr.episodeCount || null,
    averageScore: attr.averageRating ? Math.round(parseFloat(attr.averageRating)) : null,
    popularity: attr.userCount || 0,
    startDate: attr.startDate || null,
    endDate: attr.endDate || null,
    youtubeTrailerVideoId: attr.youtubeVideoId || null,
    slug: attr.slug || '',
  };
}

export const KitsuServerService = {
  getStats() {
    return {
      name: 'Kitsu Anime API',
      endpoint: KITSU_BASE_URL,
      status: failedCount > 5 && requestCount > 0 && (failedCount / requestCount > 0.5) ? 'degraded' : 'healthy',
      latencyMs: lastLatencyMs,
      lastSuccess: lastSuccessTime,
      lastError: lastErrorMsg,
      requestCount,
      failedCount,
      cacheSize: kitsuCache.size,
    };
  },

  async searchAnime(query: string, limit = 20, offset = 0) {
    const raw = await fetchKitsu(`/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}&page[offset]=${offset}`);
    const items = (raw.data || []).map(parseKitsuAnimeItem).filter(Boolean);
    return {
      media: items,
      total: raw.meta?.count || items.length,
    };
  },

  async getAnimeById(id: string) {
    const raw = await fetchKitsu(`/anime/${id}`);
    return parseKitsuAnimeItem(raw.data);
  },

  async getTrending(limit = 20) {
    const raw = await fetchKitsu(`/trending/anime?limit=${limit}`);
    const items = (raw.data || []).map(parseKitsuAnimeItem).filter(Boolean);
    return { media: items, total: items.length };
  },

  async getCategories(limit = 50) {
    const raw = await fetchKitsu(`/categories?page[limit]=${limit}&sort=-totalMediaCount`);
    return (raw.data || []).map((cat: any) => ({
      id: cat.id,
      title: cat.attributes?.title,
      slug: cat.attributes?.slug,
      description: cat.attributes?.description,
      totalMediaCount: cat.attributes?.totalMediaCount,
    }));
  },
};
