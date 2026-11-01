const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

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

async function fetchJikan<T = any>(endpoint: string, timeoutMs = 8000): Promise<T> {
  const cacheKey = `srv_jikan_${endpoint}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${JIKAN_BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Jikan API HTTP ${res.status}`);
    }

    const json = await res.json();
    setCache(cacheKey, json.data, 10 * 60 * 1000);
    return json.data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[JIKAN SERVICE] Failed fetch for ${endpoint}:`, err.message);
    throw err;
  }
}

export const JikanServerService = {
  async getTopAnime(page = 1, filter?: string) {
    const ep = filter ? `/top/anime?page=${page}&filter=${filter}` : `/top/anime?page=${page}`;
    return fetchJikan(ep);
  },

  async searchAnime(query: string, page = 1, limit = 20) {
    return fetchJikan(`/anime?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
  },

  async getAnimeById(id: number) {
    return fetchJikan(`/anime/${id}`);
  },

  async getAnimeFull(id: number) {
    return fetchJikan(`/anime/${id}/full`);
  },

  async getAnimeEpisodes(id: number, page = 1) {
    return fetchJikan(`/anime/${id}/episodes?page=${page}`);
  },

  async getAnimeCharacters(id: number) {
    return fetchJikan(`/anime/${id}/characters`);
  },

  async getAnimeStaff(id: number) {
    return fetchJikan(`/anime/${id}/staff`);
  },

  async getAnimeRecommendations(id: number) {
    return fetchJikan(`/anime/${id}/recommendations`);
  },

  async getAnimeRelations(id: number) {
    return fetchJikan(`/anime/${id}/relations`);
  },

  async getAnimePictures(id: number) {
    return fetchJikan(`/anime/${id}/pictures`);
  },

  async getAnimeReviews(id: number, page = 1) {
    return fetchJikan(`/anime/${id}/reviews?page=${page}`);
  },

  async getSeasonsNow(page = 1) {
    return fetchJikan(`/seasons/now?page=${page}`);
  },

  async getUpcoming(page = 1) {
    return fetchJikan(`/seasons/upcoming?page=${page}`);
  },

  async getSeasonalAnime(year: number, season: string, page = 1) {
    return fetchJikan(`/seasons/${year}/${season.toLowerCase()}?page=${page}`);
  },

  async getGenres() {
    return fetchJikan('/genres/anime');
  },
};
