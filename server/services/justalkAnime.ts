import animeapi from '@justalk/anime-api';

export interface NormalizedSource {
  id: string;
  provider: 'justalk';
  source: string;
  url: string;
  type: 'mp4' | 'hls' | 'embed' | 'external';
  episode: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function determineSourceType(url: string): 'mp4' | 'hls' | 'embed' | 'external' {
  if (!url || typeof url !== 'string') return 'external';
  const lower = url.toLowerCase();
  if (lower.includes('.mp4') || lower.includes('.webm')) return 'mp4';
  if (lower.includes('.m3u8')) return 'hls';
  if (lower.includes('embed') || lower.includes('/e/') || lower.includes('player')) return 'embed';
  return 'external';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[ANIME SOURCE] Operation timed out after ${timeoutMs}ms`);
      resolve(fallbackValue);
    }, timeoutMs);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

export async function searchAnimeSources(animeName: string): Promise<any[]> {
  if (!animeName || typeof animeName !== 'string') return [];
  const normalizedTitle = animeName.trim().toLowerCase();
  const cacheKey = `anime:${normalizedTitle}:links`;

  const cached = getCached<any[]>(cacheKey);
  if (cached) return cached;

  try {
    const results = await withTimeout(
      animeapi.links(animeName, {}),
      8000,
      []
    );
    const safeResults = Array.isArray(results) ? results : [];
    setCached(cacheKey, safeResults);
    return safeResults;
  } catch (err) {
    console.error('[ANIME SOURCE] searchAnimeSources error:', err);
    return [];
  }
}

export async function getStreamingSources(
  animeName: string,
  episodeNumber: number
): Promise<{ sources: NormalizedSource[]; error?: string }> {
  if (!animeName || typeof animeName !== 'string') {
    return { sources: [], error: 'Invalid anime title' };
  }

  const ep = !episodeNumber || isNaN(episodeNumber) || episodeNumber <= 0 ? 1 : episodeNumber;
  const normalizedTitle = animeName.trim().toLowerCase();
  const cacheKey = `anime:${normalizedTitle}:episode:${ep}:sources`;

  const cached = getCached<NormalizedSource[]>(cacheKey);
  if (cached) {
    return { sources: cached };
  }

  try {
    const rawSources = await withTimeout<any[]>(
      animeapi.stream(animeName, ep, {}),
      10000,
      []
    );

    const safeRaw: any[] = Array.isArray(rawSources) ? rawSources : [];
    const normalized: NormalizedSource[] = [];

    for (let i = 0; i < safeRaw.length; i++) {
      const item = safeRaw[i];
      if (!item) continue;

      const sourceName = item.source || item.provider || `source-${i + 1}`;
      const linkUrl = item.link || item.url || item.stream;

      if (linkUrl && typeof linkUrl === 'string' && linkUrl.startsWith('http')) {
        const type = determineSourceType(linkUrl);
        const sourceObj: NormalizedSource = {
          id: `justalk-${sourceName}-${ep}-${i}`,
          provider: 'justalk',
          source: sourceName,
          url: linkUrl,
          type,
          episode: ep,
        };
        normalized.push(sourceObj);

        console.log('[ANIME SOURCE]');
        console.log('Title:', animeName);
        console.log('Episode:', ep);
        console.log('Provider: justalk');
        console.log('Source:', sourceName);
        console.log('URL:', linkUrl);
        console.log('Type:', type);
        console.log('Status: AVAILABLE');
      }
    }

    setCached(cacheKey, normalized);
    return { sources: normalized };
  } catch (err: any) {
    console.error('[ANIME SOURCE] Error fetching streaming sources:', err?.message || err);
    return {
      sources: [],
      error: 'Streaming sources temporarily unavailable',
    };
  }
}

export async function getDownloadSources(
  animeName: string,
  episodeNumber: number
): Promise<any[]> {
  if (!animeName) return [];
  const ep = !episodeNumber || isNaN(episodeNumber) || episodeNumber <= 0 ? 1 : episodeNumber;
  const normalizedTitle = animeName.trim().toLowerCase();
  const cacheKey = `anime:${normalizedTitle}:episode:${ep}:download`;

  const cached = getCached<any[]>(cacheKey);
  if (cached) return cached;

  try {
    const results = await withTimeout(
      animeapi.download(animeName, ep, {}),
      8000,
      []
    );
    const safeResults = Array.isArray(results) ? results : [];
    setCached(cacheKey, safeResults);
    return safeResults;
  } catch (err) {
    console.error('[ANIME SOURCE] getDownloadSources error:', err);
    return [];
  }
}
