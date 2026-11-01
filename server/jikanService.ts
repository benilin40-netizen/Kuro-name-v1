const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

const jikanCache = new Map<string, { data: any; expiry: number }>();

// Diagnostics and metrics tracking
let requestCount = 0;
let failedCount = 0;
let lastSuccessTime: string | null = null;
let lastErrorMsg: string | null = null;
let lastLatencyMs = 0;

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

// Rate-limit throttle queue: Jikan limit is 3 requests/sec
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 350;

async function throttle(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLast));
  }
  lastRequestTime = Date.now();
}

async function fetchJikan<T = any>(endpoint: string, retries = 2, timeoutMs = 8000): Promise<T> {
  const cacheKey = `srv_jikan_${endpoint}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  await throttle();
  requestCount++;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
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

      if (res.status === 429) {
        // Rate limited - back off exponentially
        const backoffMs = (attempt + 1) * 1000;
        console.warn(`[JIKAN SERVICE] 429 Rate limited. Backing off ${backoffMs}ms... (attempt ${attempt + 1}/${retries + 1})`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!res.ok) {
        throw new Error(`Jikan API HTTP ${res.status}`);
      }

      const json = await res.json();
      lastLatencyMs = Date.now() - startTime;
      lastSuccessTime = new Date().toISOString();
      setCache(cacheKey, json.data, 10 * 60 * 1000);
      return json.data;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt === retries) {
        failedCount++;
        lastErrorMsg = err.message || 'Unknown fetch error';
        lastLatencyMs = Date.now() - startTime;
        console.warn(`[JIKAN SERVICE] Failed fetch for ${endpoint}:`, err.message);
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw new Error(`Jikan fetch failed after ${retries} retries`);
}

export const JikanServerService = {
  getStats() {
    return {
      name: 'Jikan REST API v4',
      endpoint: JIKAN_BASE_URL,
      status: failedCount > 5 && requestCount > 0 && (failedCount / requestCount > 0.5) ? 'degraded' : 'healthy',
      latencyMs: lastLatencyMs,
      lastSuccess: lastSuccessTime,
      lastError: lastErrorMsg,
      requestCount,
      failedCount,
      cacheSize: jikanCache.size,
    };
  },

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

  async getSchedules(day?: string) {
    return fetchJikan(day ? `/schedules?filter=${day.toLowerCase()}` : '/schedules');
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
