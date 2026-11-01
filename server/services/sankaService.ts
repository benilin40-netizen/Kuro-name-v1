const SANKA_BASE_URL = 'https://www.sankavollerei.web.id/anime';

// Server-side cache
const sankaServerCache = new Map<string, { data: any; expiry: number }>();

function getCached<T>(key: string): T | null {
  const item = sankaServerCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    sankaServerCache.delete(key);
    return null;
  }
  return item.data;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  sankaServerCache.set(key, { data, expiry: Date.now() + ttlMs });
}

/**
 * Server-side fetch wrapper for Sanka API with timeout, exponential backoff, and rate limit resilience
 */
async function fetchSankaServer<T = any>(endpoint: string, ttlMs = 5 * 60 * 1000, maxRetries = 1, timeoutMs = 6000): Promise<T | null> {
  const cacheKey = `srv_sanka_${endpoint}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const fullUrl = `${SANKA_BASE_URL}${endpoint}`;

  let attempt = 0;
  let delay = 300;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(fullUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'QWISH-Anime-Aggregator/1.0',
        },
      });
      clearTimeout(timeoutId);

      if (res.status === 404) {
        // Expected when title/slug is not present on Sanka source
        setCache(cacheKey, null, 15 * 60 * 1000);
        return null;
      }

      if (res.status === 429) {
        if (attempt <= maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        return null;
      }

      if (!res.ok) {
        return null;
      }

      const json = await res.json();
      setCache(cacheKey, json, ttlMs);
      return json;
    } catch (_err: any) {
      clearTimeout(timeoutId);
      if (attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      return null;
    }
  }

  return null;
}

export const SankaServerService = {
  async search(source = 'otakudesu', query: string) {
    const s = encodeURIComponent(source.trim());
    const q = encodeURIComponent(query.trim());
    const res = await fetchSankaServer(`/${s}/search/${q}`, 5 * 60 * 1000);
    return res || [];
  },

  async getHome(source = 'otakudesu') {
    const s = encodeURIComponent(source.trim());
    const res = await fetchSankaServer(`/${s}/home`, 30 * 60 * 1000);
    return res || {};
  },

  async getDetails(source: string, slug: string) {
    const s = encodeURIComponent(source.trim());
    const sl = encodeURIComponent(slug.trim());
    const res = await fetchSankaServer(`/${s}/detail/${sl}`, 30 * 60 * 1000);
    return res || null;
  },

  async getEpisode(source: string, slug: string) {
    const s = encodeURIComponent(source.trim());
    const sl = encodeURIComponent(slug.trim());
    const res = await fetchSankaServer(`/${s}/episode/${sl}`, 5 * 60 * 1000);
    return res || null;
  },

  async getGenres(source = 'otakudesu') {
    const s = encodeURIComponent(source.trim());
    const res = await fetchSankaServer(`/${s}/genres`, 60 * 60 * 1000);
    return res || [];
  },

  async getGenre(source: string, slug: string) {
    const s = encodeURIComponent(source.trim());
    const sl = encodeURIComponent(slug.trim());
    const res = await fetchSankaServer(`/${s}/genre/${sl}`, 30 * 60 * 1000);
    return res || [];
  },
};

export default SankaServerService;
