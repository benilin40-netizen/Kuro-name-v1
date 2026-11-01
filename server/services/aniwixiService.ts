const ANIWIXI_BASE_URL = 'https://aniwixi.xyz/wp-json/aniwixi/v1';

const aniwixiCache = new Map<string, { data: any; expiry: number }>();

function getCached<T>(key: string): T | null {
  const entry = aniwixiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    aniwixiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs = 10 * 60 * 1000): void {
  aniwixiCache.set(key, { data, expiry: Date.now() + ttlMs });
}

async function fetchAniwixiServer<T = any>(endpoint: string, timeoutMs = 8000): Promise<T | null> {
  const cacheKey = `srv_aniwixi_${endpoint}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${ANIWIXI_BASE_URL}${endpoint}`;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeoutId);

    if (res.status === 404) {
      // 404 Not Found is expected when item/episode is not present in Aniwixi
      setCache(cacheKey, null, 15 * 60 * 1000);
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    setCache(cacheKey, json, 10 * 60 * 1000);
    return json;
  } catch (_err: any) {
    clearTimeout(timeoutId);
    return null;
  }
}

export const AniwixiServerService = {
  async searchAnime(query: string) {
    const res = await fetchAniwixiServer(`/search?q=${encodeURIComponent(query)}`);
    return res || [];
  },

  async getAnimeById(id: string | number) {
    const primary = await fetchAniwixiServer(`/anilist/id?id=${encodeURIComponent(String(id))}`);
    if (primary) return primary;
    const fallback = await fetchAniwixiServer(`/anilist/${encodeURIComponent(String(id))}`);
    return fallback || null;
  },

  async getEpisode(id: string | number, episodeNumber: number | string) {
    const ep = Number(episodeNumber) || 1;
    const primary = await fetchAniwixiServer(`/anilist/id/ep/num?id=${encodeURIComponent(String(id))}&ep=${ep}&num=${ep}`);
    if (primary) return primary;
    const fallback = await fetchAniwixiServer(`/anilist/${encodeURIComponent(String(id))}/ep/${ep}`);
    return fallback || null;
  },

  async getAnimeList(page = 1, perPage = 20) {
    const res = await fetchAniwixiServer(`/anime?page=${page}&per_page=${perPage}`);
    return res || { page, per_page: perPage, data: [] };
  },
};

export default AniwixiServerService;
