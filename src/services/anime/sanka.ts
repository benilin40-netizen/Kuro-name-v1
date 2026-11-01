import { AnimeMedia } from '../../types/anime.ts';

export const SANKA_BASE_URL = 'https://www.sankavollerei.web.id/anime';

export const SANKA_DEFAULT_SOURCES = ['otakudesu', 'kura', 'samehadaku', 'kusonime', 'anoboy'];

export interface SankaSearchResult {
  title?: string;
  name?: string;
  slug?: string;
  id?: string;
  endpoint?: string;
  image?: string;
  poster?: string;
  status?: string;
  rating?: string | number;
  type?: string;
  source?: string;
  [key: string]: any;
}

export interface SankaAnimeDetails {
  title?: string;
  slug?: string;
  poster?: string;
  image?: string;
  synopsis?: string;
  description?: string;
  type?: string;
  status?: string;
  episodes_count?: number;
  episodes?: Array<{
    title?: string;
    slug?: string;
    endpoint?: string;
    episode_number?: number | string;
    date?: string;
    [key: string]: any;
  }>;
  genres?: string[];
  [key: string]: any;
}

export interface SankaStreamSource {
  title?: string;
  server?: string;
  provider?: string;
  quality?: string;
  url?: string;
  link?: string;
  embedUrl?: string;
  streamUrl?: string;
  type?: string;
  is_m3u8?: boolean;
  headers?: Record<string, string>;
  [key: string]: any;
}

export interface SankaEpisodeDetails {
  provider?: string;
  source?: string;
  episode?: number | string;
  title?: string;
  streams?: SankaStreamSource[];
  downloads?: Array<{
    quality?: string;
    links?: Array<{ name?: string; url?: string }>;
    [key: string]: any;
  }>;
  streamUrl?: string;
  embedUrl?: string;
  [key: string]: any;
}

export interface DiscoveredSource {
  url: string;
  type?: string;
  quality?: string;
  server?: string;
  headers?: Record<string, string>;
}

/**
 * Recursively inspects any JSON object/response for streaming/video URLs.
 * Discovers url, link, stream, streaming, streams, sources, servers, videos, video, embed, embedUrl, file, m3u8, mp4.
 */
export function recursiveExtractStreamSources(
  obj: any,
  defaultQuality = '1080p',
  defaultServer = 'Sanka Stream'
): DiscoveredSource[] {
  if (!obj) return [];
  const results: DiscoveredSource[] = [];
  const visited = new Set<any>();

  function traverse(node: any, currentQuality: string, currentServer: string) {
    if (!node) return;
    if (typeof node === 'object' || typeof node === 'function') {
      if (visited.has(node)) return;
      visited.add(node);
    }

    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        results.push({
          url: trimmed,
          quality: currentQuality,
          server: currentServer,
        });
      }
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item, currentQuality, currentServer);
      }
      return;
    }

    if (typeof node === 'object') {
      const localQuality = node.quality || node.res || node.resolution || currentQuality;
      const localServer = node.server || node.provider || node.name || node.title || currentServer;
      const headers = node.headers || node.header || undefined;

      const directUrl =
        node.url ||
        node.link ||
        node.stream ||
        node.streamUrl ||
        node.embed ||
        node.embedUrl ||
        node.file ||
        node.src ||
        node.href ||
        node.m3u8 ||
        node.mp4;

      if (typeof directUrl === 'string') {
        const trimmed = directUrl.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          results.push({
            url: trimmed,
            quality: localQuality,
            server: localServer,
            type: node.type,
            headers,
          });
        }
      }

      for (const [key, val] of Object.entries(node)) {
        if (!val) continue;
        let nextQuality = localQuality;
        let nextServer = localServer;

        const kLower = key.toLowerCase();
        if (
          kLower.includes('1080') ||
          kLower.includes('720') ||
          kLower.includes('480') ||
          kLower.includes('360') ||
          kLower.includes('hd') ||
          kLower.includes('sd')
        ) {
          nextQuality = key;
        }
        if (
          kLower.includes('server') ||
          kLower.includes('mirror') ||
          kLower.includes('host') ||
          kLower.includes('provider')
        ) {
          nextServer = key;
        }

        traverse(val, nextQuality, nextServer);
      }
    }
  }

  traverse(obj, defaultQuality, defaultServer);

  // Deduplicate discovered sources by URL
  const uniqueMap = new Map<string, DiscoveredSource>();
  for (const item of results) {
    if (!uniqueMap.has(item.url)) {
      uniqueMap.set(item.url, item);
    }
  }

  return Array.from(uniqueMap.values());
}

// In-memory cache with TTL and deduplication
const cache = new Map<string, { data: any; expiry: number }>();
const pendingRequests = new Map<string, Promise<any>>();

function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

/**
 * Robust fetch helper with timeout, request deduplication, cache, and error recovery
 */
async function fetchSanka<T>(endpoint: string, fallbackProxyPath?: string, ttlMs = 5 * 60 * 1000, timeoutMs = 8000): Promise<T> {
  const cacheKey = `sanka_${endpoint}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey) as Promise<T>;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fullUrl = `${SANKA_BASE_URL}${endpoint}`;

    try {
      const res = await fetch(fullUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Sanka API returned HTTP ${res.status}`);
      }

      const json = await res.json();
      setCache(cacheKey, json, ttlMs);
      return json as T;
    } catch (_err: any) {
      clearTimeout(timeoutId);

      if (fallbackProxyPath) {
        try {
          const proxyRes = await fetch(`/api/sanka${fallbackProxyPath}`);
          if (proxyRes.ok) {
            const proxyJson = await proxyRes.json();
            setCache(cacheKey, proxyJson, ttlMs);
            return proxyJson as T;
          }
        } catch (_pErr) {
          // Silent fallback
        }
      }

      throw _err;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

/**
 * 1. SEARCH:
 * GET https://www.sankavollerei.web.id/anime/:source/search/:query
 */
export async function searchSankaAnime(query: string, source = 'otakudesu'): Promise<SankaSearchResult[]> {
  if (!query || !query.trim()) return [];
  const q = encodeURIComponent(query.trim());
  const s = encodeURIComponent(source.trim());
  const endpoint = `/${s}/search/${q}`;

  try {
    const data = await fetchSanka<any>(endpoint, `/search?source=${s}&q=${q}`, 5 * 60 * 1000);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.results)) return data.results;
    return [];
  } catch (_err) {
    return [];
  }
}

export const searchAnime = searchSankaAnime;

/**
 * 2. HOME:
 * GET https://www.sankavollerei.web.id/anime/:source/home
 */
export async function getSankaHome(source = 'otakudesu'): Promise<any> {
  const s = encodeURIComponent(source.trim());
  const endpoint = `/${s}/home`;

  try {
    return await fetchSanka<any>(endpoint, `/home?source=${s}`, 30 * 60 * 1000);
  } catch (_err) {
    return null;
  }
}

/**
 * 3. ANIME DETAILS:
 * GET https://www.sankavollerei.web.id/anime/:source/detail/:slug
 */
export async function getSankaAnimeDetails(source: string, slug: string): Promise<SankaAnimeDetails | null> {
  if (!source || !slug) return null;
  const s = encodeURIComponent(source.trim());
  const sl = encodeURIComponent(slug.trim());
  const endpoint = `/${s}/detail/${sl}`;

  try {
    const data = await fetchSanka<any>(endpoint, `/detail?source=${s}&slug=${sl}`, 30 * 60 * 1000);
    if (data && typeof data === 'object') {
      return (data.data || data) as SankaAnimeDetails;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

export const getAnimeDetails = getSankaAnimeDetails;

export async function getAnimeEpisodes(source: string, slug: string): Promise<any[]> {
  const details = await getSankaAnimeDetails(source, slug);
  if (details && Array.isArray(details.episodes)) {
    return details.episodes;
  }
  return [];
}

/**
 * 4. EPISODE SOURCES:
 * GET https://www.sankavollerei.web.id/anime/:source/episode/:slug
 */
export async function getSankaEpisode(source: string, slug: string): Promise<SankaEpisodeDetails | null> {
  if (!source || !slug) return null;
  const s = encodeURIComponent(source.trim());
  const sl = encodeURIComponent(slug.trim());
  const endpoint = `/${s}/episode/${sl}`;

  try {
    const raw = await fetchSanka<any>(endpoint, `/episode?source=${s}&slug=${sl}`, 5 * 60 * 1000);
    const data = raw?.data || raw || {};

    const extracted = recursiveExtractStreamSources(data, '1080p', `Sanka (${source})`);
    const streams: SankaStreamSource[] = extracted.map((ext) => ({
      server: ext.server,
      quality: ext.quality,
      url: ext.url,
      type: ext.type,
      headers: ext.headers,
    }));

    return {
      provider: 'sanka',
      source: source,
      episode: data.episode || slug,
      title: data.title || '',
      streams,
      downloads: data.downloadList || data.downloads || [],
      streamUrl: data.streamUrl || data.url || (streams[0]?.url) || undefined,
      embedUrl: data.embedUrl || undefined,
    };
  } catch (_err) {
    return null;
  }
}

export async function getEpisodeSources(source: string, slug: string): Promise<DiscoveredSource[]> {
  const epDetails = await getSankaEpisode(source, slug);
  if (!epDetails) return [];
  return recursiveExtractStreamSources(epDetails, '1080p', `Sanka (${source})`);
}

/**
 * Automatically searches and extracts sources across multiple Sanka providers (otakudesu, kura, samehadaku, kusonime, anoboy).
 * If one source fails, automatically tries another!
 */
export async function getMultiSourceSankaEpisode(
  queryTitle: string,
  episodeNumber = 1
): Promise<{ sourceName: string; episodeDetails: SankaEpisodeDetails; discovered: DiscoveredSource[] }[]> {
  if (!queryTitle || !queryTitle.trim()) return [];

  const results: { sourceName: string; episodeDetails: SankaEpisodeDetails; discovered: DiscoveredSource[] }[] = [];

  const sourcesToTry = SANKA_DEFAULT_SOURCES;

  for (const srcName of sourcesToTry) {
    try {
      const searchRes = await searchSankaAnime(queryTitle, srcName);
      if (!searchRes || searchRes.length === 0) continue;

      const firstMatch = searchRes[0];
      const animeSlug = firstMatch.slug || firstMatch.endpoint || firstMatch.id;
      if (!animeSlug) continue;

      const details = await getSankaAnimeDetails(srcName, animeSlug);
      let targetEpSlug = animeSlug;

      if (details && Array.isArray(details.episodes) && details.episodes.length > 0) {
        const epMatch =
          details.episodes.find(
            (e) =>
              Number(e.episode_number) === episodeNumber ||
              (e.slug && (e.slug.includes(`episode-${episodeNumber}`) || e.slug.includes(`ep-${episodeNumber}`) || e.slug.endsWith(`-${episodeNumber}`)))
          ) || details.episodes[0];

        if (epMatch) {
          targetEpSlug = epMatch.slug || epMatch.endpoint || animeSlug;
        }
      } else {
        // Candidate slug patterns
        targetEpSlug = `${animeSlug}-episode-${episodeNumber}`;
      }

      const epDetails = await getSankaEpisode(srcName, targetEpSlug);
      if (epDetails) {
        const discovered = recursiveExtractStreamSources(epDetails, '1080p', `Sanka — ${srcName.toUpperCase()}`);
        if (discovered.length > 0) {
          results.push({
            sourceName: srcName,
            episodeDetails: epDetails,
            discovered,
          });
        }
      }
    } catch (_err) {
      // Continue to next Sanka source
    }
  }

  return results;
}

/**
 * 5. GENRES:
 * GET https://www.sankavollerei.web.id/anime/:source/genres
 */
export async function getSankaGenres(source = 'otakudesu'): Promise<any[]> {
  const s = encodeURIComponent(source.trim());
  const endpoint = `/${s}/genres`;

  try {
    const data = await fetchSanka<any>(endpoint, `/genres?source=${s}`, 60 * 60 * 1000);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    return [];
  } catch (_err) {
    return [];
  }
}

/**
 * 6. GENRE ANIME LIST:
 * GET https://www.sankavollerei.web.id/anime/:source/genre/:slug
 */
export async function getSankaGenre(source: string, slug: string): Promise<any[]> {
  if (!source || !slug) return [];
  const s = encodeURIComponent(source.trim());
  const sl = encodeURIComponent(slug.trim());
  const endpoint = `/${s}/genre/${sl}`;

  try {
    const data = await fetchSanka<any>(endpoint, `/genre?source=${s}&slug=${sl}`, 30 * 60 * 1000);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    return [];
  } catch (_err) {
    return [];
  }
}

/**
 * Normalizes a raw Sanka search result or anime details object into the common AnimeMedia model.
 */
export function normalizeSankaToAnimeMedia(item: any, sourceName = 'otakudesu'): AnimeMedia {
  if (!item || typeof item !== 'object') {
    return {
      id: 9900000,
      title: { romaji: 'Unknown Anime', english: 'Unknown Anime', native: null },
      description: null,
      bannerImage: null,
      coverImage: { extraLarge: '', large: '', medium: '', color: null },
      format: 'TV',
      status: 'RELEASING',
      episodes: null,
      duration: null,
      season: null,
      seasonYear: null,
      averageScore: null,
      meanScore: null,
      popularity: 0,
      genres: [],
      source: sourceName,
    };
  }

  const rawTitle = item.title || item.name || item.japanese_title || 'Unknown Anime';
  const imgUrl = item.poster || item.image || item.cover || item.thumbnail || '';
  const slug = item.slug || item.endpoint || item.id || '';

  let numericId = 9900000;
  if (slug) {
    let hash = 0;
    for (let i = 0; i < slug.length; i++) {
      hash = (hash << 5) - hash + slug.charCodeAt(i);
      hash |= 0;
    }
    numericId = Math.abs(hash) + 9000000;
  }

  return {
    id: numericId,
    idMal: null,
    title: {
      romaji: rawTitle,
      english: item.english_title || rawTitle,
      native: item.japanese_title || null,
    },
    description: item.synopsis || item.description || null,
    bannerImage: item.cover || imgUrl || null,
    coverImage: {
      extraLarge: imgUrl,
      large: imgUrl,
      medium: imgUrl,
      color: null,
    },
    format: (item.type || 'TV').toUpperCase(),
    status: (item.status || 'RELEASING').toUpperCase(),
    episodes: item.episodes_count || (Array.isArray(item.episodes) ? item.episodes.length : null),
    duration: null,
    season: null,
    seasonYear: null,
    averageScore: item.rating ? Math.round(Number(item.rating) * 10) : null,
    meanScore: item.rating ? Math.round(Number(item.rating) * 10) : null,
    popularity: 0,
    genres: Array.isArray(item.genres) ? item.genres : [],
    source: sourceName,
  };
}

export const SankaAPI = {
  searchSankaAnime,
  searchAnime,
  getSankaHome,
  getSankaAnimeDetails,
  getAnimeDetails,
  getAnimeEpisodes,
  getSankaEpisode,
  getEpisodeSources,
  getMultiSourceSankaEpisode,
  getSankaGenres,
  getSankaGenre,
  normalizeSankaToAnimeMedia,
  recursiveExtractStreamSources,
};

export default SankaAPI;

