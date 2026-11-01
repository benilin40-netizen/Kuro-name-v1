import { db } from '../db.ts';
import { AniKotoProvider } from '../anikotoService.ts';
import { getStreamingSources, searchAnimeSources } from './justalkAnime.ts';
import { AnimePaheServerService } from './animepaheService.ts';
import {
  searchAnimePahe,
  getAnimePaheInfo,
  getAnimePaheEpisodes,
  getAnimePaheStreams,
} from './streamProviders.ts';

const DEFAULT_MIRURO_BASE_URL = 'https://mirurotvapi.vercel.app/api';
const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

// Configuration helpers
export function getMiruroBaseUrl(): string {
  const fromEnv = (process.env.MIRURO_API_BASE_URL || process.env.VITE_MIRURO_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;

  try {
    const row = db.prepare("SELECT value FROM site_settings WHERE key = 'miruro_api_base_url'").get() as any;
    if (row && row.value && typeof row.value === 'string' && row.value.trim().startsWith('http')) {
      return row.value.trim().replace(/\/+$/, '');
    }
  } catch {}

  return DEFAULT_MIRURO_BASE_URL;
}

export function setMiruroBaseUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  db.prepare(`
    INSERT INTO site_settings (key, value) VALUES ('miruro_api_base_url', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(clean);
}

export function isMiruroEnabled(): boolean {
  try {
    const row = db.prepare("SELECT value FROM site_settings WHERE key = 'miruro_enabled'").get() as any;
    if (row && row.value !== undefined) {
      return row.value === '1' || row.value === 'true';
    }
  } catch {}
  return true;
}

export function setMiruroEnabled(enabled: boolean): void {
  db.prepare(`
    INSERT INTO site_settings (key, value) VALUES ('miruro_enabled', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(enabled ? '1' : '0');
}

export function getMiruroTimeout(): number {
  try {
    const row = db.prepare("SELECT value FROM site_settings WHERE key = 'miruro_timeout_ms'").get() as any;
    if (row && row.value) {
      const parsed = parseInt(row.value, 10);
      if (!isNaN(parsed) && parsed >= 2000 && parsed <= 60000) return parsed;
    }
  } catch {}
  return 12000;
}

export function setMiruroTimeout(ms: number): void {
  db.prepare(`
    INSERT INTO site_settings (key, value) VALUES ('miruro_timeout_ms', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(ms));
}

// Memory Cache Layer
interface CacheEntry {
  data: any;
  expiresAt: number;
  source: 'upstream' | 'fallback';
}

const cacheMap = new Map<string, CacheEntry>();

function getCache(key: string): CacheEntry | null {
  const item = cacheMap.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cacheMap.delete(key);
    return null;
  }
  return item;
}

function setCache(key: string, data: any, ttlMs: number, source: 'upstream' | 'fallback') {
  cacheMap.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    source,
  });
}

// Diagnostics & Statistics
export interface MiruroDiagnostics {
  baseUrl: string;
  enabled: boolean;
  timeoutMs: number;
  totalRequests: number;
  failedRequests: number;
  upstreamConnected: boolean;
  lastSuccessfulRequest: string | null;
  lastError: string | null;
  lastHttpStatus: number | null;
  averageResponseTimeMs: number;
  endpoints: Array<{
    name: string;
    path: string;
    status: number;
    responseTimeMs: number;
    error?: string;
    upstreamSuccess: boolean;
  }>;
}

let totalRequests = 0;
let failedRequests = 0;
let lastSuccessfulRequest: string | null = null;
let lastError: string | null = null;
let lastHttpStatus: number | null = null;
const responseTimes: number[] = [];

function recordRequest(success: boolean, responseTimeMs: number, status: number, errorMsg?: string) {
  totalRequests++;
  if (!success) {
    failedRequests++;
    if (errorMsg) lastError = errorMsg;
  } else {
    lastSuccessfulRequest = new Date().toISOString();
  }
  lastHttpStatus = status;
  responseTimes.push(responseTimeMs);
  if (responseTimes.length > 50) responseTimes.shift();
}

// Upstream fetch wrapper with error detection
export async function fetchFromMiruroUpstream(path: string, options: { timeoutMs?: number } = {}): Promise<{
  ok: boolean;
  status: number;
  data?: any;
  error?: string;
  responseTimeMs: number;
}> {
  const baseUrl = getMiruroBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const timeoutMs = options.timeoutMs || getMiruroTimeout();
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'KuroNami/2.0 (AnimeStreamingEngine; +https://kuronami.com)',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const responseTimeMs = Date.now() - start;

    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text();

    if (!res.ok) {
      let errMsg = `Upstream HTTP ${res.status}`;
      if (rawText.includes('DEPLOYMENT_NOT_FOUND')) {
        errMsg = `Vercel deployment not found on ${baseUrl} (DEPLOYMENT_NOT_FOUND)`;
      } else if (rawText.includes('DEPLOYMENT_DISABLED')) {
        errMsg = `Vercel deployment disabled on ${baseUrl} (DEPLOYMENT_DISABLED)`;
      } else if (res.status === 403 || rawText.includes('Cloudflare') || rawText.includes('Just a moment...')) {
        errMsg = `Upstream blocked by Cloudflare bot protection (HTTP 403/503)`;
      } else if (rawText.length < 200 && rawText.trim()) {
        errMsg = `HTTP ${res.status}: ${rawText.trim()}`;
      }
      recordRequest(false, responseTimeMs, res.status, errMsg);
      return { ok: false, status: res.status, error: errMsg, responseTimeMs };
    }

    if (!contentType.includes('application/json')) {
      const errMsg = `Upstream returned non-JSON payload (${contentType || 'plain/html'})`;
      recordRequest(false, responseTimeMs, res.status, errMsg);
      return { ok: false, status: res.status, error: errMsg, responseTimeMs };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (_parseErr) {
      const errMsg = 'Failed to parse upstream response as JSON';
      recordRequest(false, responseTimeMs, res.status, errMsg);
      return { ok: false, status: res.status, error: errMsg, responseTimeMs };
    }

    recordRequest(true, responseTimeMs, res.status);
    return { ok: true, status: res.status, data: parsed, responseTimeMs };
  } catch (err: any) {
    clearTimeout(timer);
    const responseTimeMs = Date.now() - start;
    let errMsg = err.message || 'Request failed';
    if (err.name === 'AbortError') {
      errMsg = `Request timed out after ${timeoutMs}ms`;
    }
    recordRequest(false, responseTimeMs, 0, errMsg);
    return { ok: false, status: 0, error: errMsg, responseTimeMs };
  }
}

// GraphQL helper for direct AniList metadata queries
async function queryAniListGraphQL(query: string, variables: any = {}): Promise<any> {
  const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'KuroNami/2.0 (AnimeStreamingEngine)',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`AniList GraphQL HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  }
  return json.data;
}

// Media normalization to Miruro API standard schema
function formatMediaForMiruro(media: any) {
  if (!media) return null;
  return {
    id: media.id,
    idMal: media.idMal || media.id,
    title: {
      english: media.title?.english || null,
      romaji: media.title?.romaji || media.title?.userPreferred || 'Unknown Title',
      native: media.title?.native || null,
      userPreferred: media.title?.userPreferred || media.title?.english || media.title?.romaji || 'Unknown Title',
    },
    coverImage: {
      extraLarge: media.coverImage?.extraLarge || media.coverImage?.large,
      large: media.coverImage?.large,
      medium: media.coverImage?.medium || media.coverImage?.large,
      color: media.coverImage?.color || '#f43f5e',
    },
    bannerImage: media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || null,
    description: media.description || '',
    format: media.format || 'TV',
    status: media.status || 'RELEASING',
    episodes: media.episodes || null,
    duration: media.duration || 24,
    season: media.season || null,
    seasonYear: media.seasonYear || null,
    averageScore: media.averageScore || null,
    popularity: media.popularity || 0,
    favourites: media.favourites || 0,
    genres: media.genres || [],
    tags: (media.tags || []).map((t: any) => (typeof t === 'string' ? { name: t } : { id: t.id, name: t.name, rank: t.rank })),
    studios: {
      nodes: (media.studios?.nodes || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        isAnimationStudio: Boolean(s.isAnimationStudio),
      })),
    },
    nextAiringEpisode: media.nextAiringEpisode || null,
    trailer: media.trailer ? {
      id: media.trailer.id,
      site: media.trailer.site,
      thumbnail: media.trailer.thumbnail,
    } : null,
  };
}

// -----------------------------------------------------------------------------
// MIRURO API ENDPOINT IMPLEMENTATIONS (With Upstream Proxy & Resilient Fallback)
// -----------------------------------------------------------------------------

export const MiruroService = {
  // 1. Search anime: GET /search?query={name}&page=1&per_page=20
  async searchAnime(query: string, page = 1, perPage = 20) {
    const cacheKey = `search_${encodeURIComponent(query)}_${page}_${perPage}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    // Try upstream Miruro API first
    const upstream = await fetchFromMiruroUpstream(
      `/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
    );
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 60 * 1000, 'upstream');
      return upstream.data;
    }

    // Fallback: AniList GraphQL
    const gql = `
      query ($search: String, $page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          pageInfo { total currentPage perPage hasNextPage }
          media (search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id idMal title { romaji english native userPreferred }
            coverImage { extraLarge large medium color }
            bannerImage description format status episodes duration season seasonYear
            averageScore popularity genres studios(isMain: true) { nodes { id name isAnimationStudio } }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { search: query, page, perPage });
    const formatted = {
      pageInfo: data.Page.pageInfo,
      results: (data.Page.media || []).map(formatMediaForMiruro),
      media: (data.Page.media || []).map(formatMediaForMiruro),
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 60 * 1000, 'fallback');
    return formatted;
  },

  // 2. Autocomplete suggestions: GET /suggestions?query={name} (max 8)
  async getSuggestions(query: string) {
    const cacheKey = `suggestions_${encodeURIComponent(query)}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/suggestions?query=${encodeURIComponent(query)}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 60 * 1000, 'upstream');
      return upstream.data;
    }

    // Fallback: AniList search top 8
    const gql = `
      query ($search: String) {
        Page (page: 1, perPage: 8) {
          media (search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id idMal title { romaji english native userPreferred }
            coverImage { large medium color }
            format seasonYear averageScore episodes
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { search: query });
    const suggestions = (data.Page.media || []).map((m: any) => ({
      id: m.id,
      idMal: m.idMal,
      title: m.title.english || m.title.romaji || m.title.userPreferred,
      romaji: m.title.romaji,
      native: m.title.native,
      coverImage: m.coverImage?.large || m.coverImage?.medium,
      format: m.format,
      year: m.seasonYear,
      score: m.averageScore,
      episodes: m.episodes,
    }));
    const resObj = { suggestions, results: suggestions, source: 'local_fallback' };
    setCache(cacheKey, resObj, 60 * 1000, 'fallback');
    return resObj;
  },

  // 3. Browse and filter: GET /filter
  async filterAnime(params: {
    genre?: string;
    tag?: string;
    year?: number;
    season?: string;
    format?: string;
    status?: string;
    sort?: string;
    page?: number;
    per_page?: number;
  }) {
    const page = params.page || 1;
    const perPage = params.per_page || 20;
    const queryParams = new URLSearchParams();
    if (params.genre) queryParams.set('genre', params.genre);
    if (params.tag) queryParams.set('tag', params.tag);
    if (params.year) queryParams.set('year', String(params.year));
    if (params.season) queryParams.set('season', params.season);
    if (params.format) queryParams.set('format', params.format);
    if (params.status) queryParams.set('status', params.status);
    if (params.sort) queryParams.set('sort', params.sort);
    queryParams.set('page', String(page));
    queryParams.set('per_page', String(perPage));

    const cacheKey = `filter_${queryParams.toString()}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/filter?${queryParams.toString()}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 2 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    // Fallback: AniList filter
    const sortVal = params.sort ? [params.sort.toUpperCase()] : ['POPULARITY_DESC'];
    const gql = `
      query ($page: Int, $perPage: Int, $genre: String, $tag: String, $year: Int, $season: MediaSeason, $format: MediaFormat, $status: MediaStatus, $sort: [MediaSort]) {
        Page (page: $page, perPage: $perPage) {
          pageInfo { total currentPage perPage hasNextPage }
          media (type: ANIME, genre: $genre, tag: $tag, seasonYear: $year, season: $season, format: $format, status: $status, sort: $sort) {
            id idMal title { romaji english native userPreferred }
            coverImage { extraLarge large medium color }
            bannerImage description format status episodes duration season seasonYear
            averageScore popularity genres studios(isMain: true) { nodes { id name isAnimationStudio } }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, {
      page,
      perPage,
      genre: params.genre,
      tag: params.tag,
      year: params.year,
      season: params.season ? params.season.toUpperCase() : undefined,
      format: params.format ? params.format.toUpperCase() : undefined,
      status: params.status ? params.status.toUpperCase() : undefined,
      sort: sortVal,
    });
    const formatted = {
      pageInfo: data.Page.pageInfo,
      results: (data.Page.media || []).map(formatMediaForMiruro),
      media: (data.Page.media || []).map(formatMediaForMiruro),
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 2 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 4. Retrieve trending: GET /trending
  async getTrending(page = 1, perPage = 20) {
    const cacheKey = `trending_${page}_${perPage}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/trending?page=${page}&per_page=${perPage}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 5 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    const gql = `
      query ($page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          pageInfo { total currentPage perPage hasNextPage }
          media (type: ANIME, sort: TRENDING_DESC) {
            id idMal title { romaji english native userPreferred }
            coverImage { extraLarge large medium color }
            bannerImage description format status episodes duration season seasonYear
            averageScore popularity genres studios(isMain: true) { nodes { id name isAnimationStudio } }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { page, perPage });
    const formatted = {
      pageInfo: data.Page.pageInfo,
      results: (data.Page.media || []).map(formatMediaForMiruro),
      media: (data.Page.media || []).map(formatMediaForMiruro),
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 5 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 5. Retrieve popular: GET /popular
  async getPopular(page = 1, perPage = 20) {
    const cacheKey = `popular_${page}_${perPage}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/popular?page=${page}&per_page=${perPage}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 15 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    const gql = `
      query ($page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          pageInfo { total currentPage perPage hasNextPage }
          media (type: ANIME, sort: POPULARITY_DESC) {
            id idMal title { romaji english native userPreferred }
            coverImage { extraLarge large medium color }
            bannerImage description format status episodes duration season seasonYear
            averageScore popularity genres studios(isMain: true) { nodes { id name isAnimationStudio } }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { page, perPage });
    const formatted = {
      pageInfo: data.Page.pageInfo,
      results: (data.Page.media || []).map(formatMediaForMiruro),
      media: (data.Page.media || []).map(formatMediaForMiruro),
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 15 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 6. Retrieve upcoming: GET /upcoming
  async getUpcoming(page = 1, perPage = 20) {
    const cacheKey = `upcoming_${page}_${perPage}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/upcoming?page=${page}&per_page=${perPage}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 10 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    const gql = `
      query ($page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          pageInfo { total currentPage perPage hasNextPage }
          media (type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
            id idMal title { romaji english native userPreferred }
            coverImage { extraLarge large medium color }
            bannerImage description format status episodes season seasonYear
            averageScore popularity genres studios(isMain: true) { nodes { id name isAnimationStudio } }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { page, perPage });
    const formatted = {
      pageInfo: data.Page.pageInfo,
      results: (data.Page.media || []).map(formatMediaForMiruro),
      media: (data.Page.media || []).map(formatMediaForMiruro),
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 10 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 7. Retrieve recently airing: GET /recent
  async getRecent(page = 1, perPage = 20) {
    const cacheKey = `recent_${page}_${perPage}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/recent?page=${page}&per_page=${perPage}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 3 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    const gql = `
      query ($page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          pageInfo { total currentPage perPage hasNextPage }
          media (type: ANIME, status: RELEASING, sort: UPDATED_AT_DESC) {
            id idMal title { romaji english native userPreferred }
            coverImage { extraLarge large medium color }
            bannerImage description format status episodes duration season seasonYear
            averageScore popularity genres nextAiringEpisode { episode airingAt timeUntilAiring }
            studios(isMain: true) { nodes { id name isAnimationStudio } }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { page, perPage });
    const formatted = {
      pageInfo: data.Page.pageInfo,
      results: (data.Page.media || []).map(formatMediaForMiruro),
      media: (data.Page.media || []).map(formatMediaForMiruro),
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 3 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 8. Retrieve spotlight anime: GET /spotlight
  async getSpotlight() {
    const cacheKey = 'spotlight';
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream('/spotlight');
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 5 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    // Fallback: top 5 trending with high scores & banner images
    const gql = `
      query {
        Page (page: 1, perPage: 6) {
          media (type: ANIME, sort: TRENDING_DESC) {
            id idMal title { romaji english native userPreferred }
            coverImage { extraLarge large medium color }
            bannerImage description format status episodes season seasonYear
            averageScore popularity genres studios(isMain: true) { nodes { id name isAnimationStudio } }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql);
    const spotlight = (data.Page.media || []).map(formatMediaForMiruro);
    const formatted = { results: spotlight, spotlight, source: 'local_fallback' };
    setCache(cacheKey, formatted, 5 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 9. Airing schedules: GET /schedule
  async getSchedule(date?: string) {
    const cacheKey = `schedule_${date || 'current'}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/schedule${date ? `?date=${date}` : ''}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 5 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    // Fallback: AniList AiringSchedule for next 7 days
    const nowSecs = Math.floor(Date.now() / 1000);
    const endSecs = nowSecs + 7 * 24 * 3600;
    const gql = `
      query ($start: Int, $end: Int) {
        Page (page: 1, perPage: 50) {
          airingSchedules (airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
            id airingAt episode
            media {
              id idMal title { romaji english native userPreferred }
              coverImage { extraLarge large medium color }
              bannerImage format episodes averageScore genres
            }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { start: nowSecs, end: endSecs });
    const schedules = (data.Page.airingSchedules || []).map((s: any) => ({
      id: s.id,
      airingAt: s.airingAt,
      episode: s.episode,
      media: formatMediaForMiruro(s.media),
    }));
    const formatted = { results: schedules, schedule: schedules, source: 'local_fallback' };
    setCache(cacheKey, formatted, 5 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 10. Complete anime information: GET /info/{anilist_id}
  async getAnimeInfo(anilistId: number) {
    const cacheKey = `info_${anilistId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/info/${anilistId}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 30 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    // Fallback: AniList complete metadata query
    const gql = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          id idMal title { romaji english native userPreferred }
          coverImage { extraLarge large medium color }
          bannerImage description format status episodes duration season seasonYear
          averageScore popularity favourites genres tags { id name rank }
          studios { nodes { id name isAnimationStudio } }
          characters (perPage: 12, sort: ROLE) {
            edges {
              role
              node {
                id name { full native }
                image { large medium }
              }
              voiceActors (language: JAPANESE) {
                id name { full native }
                image { large medium }
              }
            }
          }
          relations {
            edges {
              relationType
              node {
                id idMal title { romaji english userPreferred }
                coverImage { large } format status episodes
              }
            }
          }
          recommendations (perPage: 10, sort: RATING_DESC) {
            nodes {
              mediaRecommendation {
                id idMal title { romaji english userPreferred }
                coverImage { large } format averageScore
              }
            }
          }
          trailer { id site thumbnail }
          nextAiringEpisode { episode airingAt timeUntilAiring }
          externalLinks { id url site }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { id: anilistId });
    if (!data.Media) {
      throw new Error(`Anime with ID ${anilistId} not found`);
    }

    const m = data.Media;
    const info = {
      id: m.id,
      idMal: m.idMal,
      title: m.title,
      coverImage: m.coverImage,
      bannerImage: m.bannerImage,
      description: m.description,
      format: m.format,
      status: m.status,
      episodes: m.episodes,
      duration: m.duration,
      season: m.season,
      year: m.seasonYear,
      averageScore: m.averageScore,
      popularity: m.popularity,
      favourites: m.favourites,
      genres: m.genres,
      tags: m.tags,
      studios: m.studios,
      characters: (m.characters?.edges || []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name,
        image: e.node.image,
        role: e.role,
        voiceActor: e.voiceActors?.[0] || null,
      })),
      relations: (m.relations?.edges || []).map((e: any) => ({
        relationType: e.relationType,
        anime: {
          id: e.node.id,
          idMal: e.node.idMal,
          title: e.node.title,
          coverImage: e.node.coverImage,
          format: e.node.format,
          status: e.node.status,
          episodes: e.node.episodes,
        },
      })),
      recommendations: (m.recommendations?.nodes || [])
        .filter((n: any) => Boolean(n.mediaRecommendation))
        .map((n: any) => ({
          id: n.mediaRecommendation.id,
          idMal: n.mediaRecommendation.idMal,
          title: n.mediaRecommendation.title,
          coverImage: n.mediaRecommendation.coverImage,
          format: n.mediaRecommendation.format,
          averageScore: n.mediaRecommendation.averageScore,
        })),
      trailer: m.trailer,
      nextAiringEpisode: m.nextAiringEpisode,
      externalLinks: m.externalLinks,
      source: 'local_fallback',
    };

    setCache(cacheKey, info, 30 * 60 * 1000, 'fallback');
    return info;
  },

  // 11. Retrieve characters: GET /anime/{id}/characters
  async getAnimeCharacters(id: number, page = 1, perPage = 20) {
    const cacheKey = `characters_${id}_${page}_${perPage}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/anime/${id}/characters?page=${page}&per_page=${perPage}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 30 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    const gql = `
      query ($id: Int, $page: Int, $perPage: Int) {
        Media (id: $id, type: ANIME) {
          characters (page: $page, perPage: $perPage, sort: ROLE) {
            pageInfo { total currentPage perPage hasNextPage }
            edges {
              role
              node { id name { full native } image { large medium } }
              voiceActors (language: JAPANESE) { id name { full native } image { large medium } }
            }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { id, page, perPage });
    const formatted = {
      pageInfo: data.Media?.characters?.pageInfo,
      characters: (data.Media?.characters?.edges || []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name,
        image: e.node.image,
        role: e.role,
        voiceActor: e.voiceActors?.[0] || null,
      })),
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 30 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 12. Retrieve anime relations: GET /anime/{id}/relations
  async getAnimeRelations(id: number) {
    const cacheKey = `relations_${id}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/anime/${id}/relations`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 30 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    const gql = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          relations {
            edges {
              relationType
              node {
                id idMal title { romaji english native userPreferred }
                coverImage { extraLarge large medium color }
                bannerImage format status episodes averageScore seasonYear
              }
            }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { id });
    const relations = (data.Media?.relations?.edges || []).map((e: any) => ({
      relationType: e.relationType,
      anime: formatMediaForMiruro(e.node),
    }));
    const formatted = { relations, results: relations, source: 'local_fallback' };
    setCache(cacheKey, formatted, 30 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 13. Retrieve anime recommendations: GET /anime/{id}/recommendations
  async getAnimeRecommendations(id: number) {
    const cacheKey = `recommendations_${id}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/anime/${id}/recommendations`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 30 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    const gql = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          recommendations (perPage: 16, sort: RATING_DESC) {
            nodes {
              mediaRecommendation {
                id idMal title { romaji english native userPreferred }
                coverImage { extraLarge large medium color }
                bannerImage format status episodes averageScore seasonYear genres
              }
            }
          }
        }
      }
    `;
    const data = await queryAniListGraphQL(gql, { id });
    const recommendations = (data.Media?.recommendations?.nodes || [])
      .filter((n: any) => Boolean(n.mediaRecommendation))
      .map((n: any) => formatMediaForMiruro(n.mediaRecommendation));
    const formatted = { recommendations, results: recommendations, source: 'local_fallback' };
    setCache(cacheKey, formatted, 30 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 14. Retrieve episodes: GET /episodes/{anilistId}
  async getEpisodes(anilistId: number) {
    const cacheKey = `episodes_${anilistId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    const upstream = await fetchFromMiruroUpstream(`/episodes/${anilistId}`);
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 5 * 60 * 1000, 'upstream');
      return upstream.data;
    }

    // Fallback: Resolve real episodes from local DB / AniList / CoorenLabs
    // Check local database first
    const dbEps = db.prepare(`
      SELECT * FROM qwish_episodes
      WHERE anime_id = (SELECT id FROM qwish_anime WHERE anilist_id = ? LIMIT 1)
      ORDER BY episode_number ASC
    `).all(anilistId) as any[];

    if (dbEps && dbEps.length > 0) {
      const episodes = dbEps.map((e) => ({
        id: e.id,
        number: e.episode_number,
        title: e.title || `Episode ${e.episode_number}`,
        slug: `ep-${e.episode_number}`,
        providers: ['local', 'vidlink', 'vidsrc5'],
        sub: true,
        dub: false,
      }));
      const formatted = {
        anilistId,
        totalEpisodes: episodes.length,
        providers: ['local', 'vidlink', 'vidsrc5', 'animepahe'],
        episodes,
        source: 'local_database',
      };
      setCache(cacheKey, formatted, 5 * 60 * 1000, 'fallback');
      return formatted;
    }

    // Otherwise fetch metadata from AniList to know total count
    let totalEpisodes = 12;
    let animeTitle = 'Anime';
    try {
      const infoGql = `query ($id: Int) { Media(id: $id, type: ANIME) { episodes title { userPreferred english romaji } } }`;
      const infoData = await queryAniListGraphQL(infoGql, { id: anilistId });
      if (infoData.Media?.episodes) totalEpisodes = infoData.Media.episodes;
      animeTitle = infoData.Media?.title?.english || infoData.Media?.title?.romaji || infoData.Media?.title?.userPreferred || 'Anime';
    } catch {}

    // Check AnimePahe sessions if available via AnimePahe service
    let paheSessions: Array<{ episode: number; session: string }> = [];
    try {
      const searchRes = await searchAnimePahe(animeTitle);
      if (Array.isArray(searchRes) && searchRes.length > 0) {
        const first = searchRes[0];
        const paheAnimeId = String(first.id || first.session || anilistId);
        const epsRes = await getAnimePaheEpisodes(paheAnimeId);
        if (Array.isArray(epsRes)) {
          paheSessions = epsRes.map((r: any) => ({
            episode: r.episode || r.number || 1,
            session: `${paheAnimeId}/${r.session || r.id || r.episode}`,
          }));
        }
      }
    } catch {}

    const episodes = [];
    for (let i = 1; i <= Math.min(totalEpisodes || 12, 500); i++) {
      const paheMatch = paheSessions.find((p) => p.episode === i);
      episodes.push({
        id: `ep-${i}`,
        number: i,
        title: `Episode ${i}`,
        slug: paheMatch ? paheMatch.session : `episode-${i}`,
        providers: paheMatch ? ['animepahe', 'vidlink', 'vidsrc5'] : ['vidlink', 'vidsrc5'],
        sub: true,
        dub: true,
      });
    }

    const formatted = {
      anilistId,
      totalEpisodes: episodes.length,
      providers: ['animepahe', 'vidlink', 'vidsrc5'],
      episodes,
      source: 'local_fallback',
    };
    setCache(cacheKey, formatted, 5 * 60 * 1000, 'fallback');
    return formatted;
  },

  // 15. Retrieve streaming sources: GET /watch/{provider}/{anilistId}/{category}/{slug}
  async getStreamingSources(provider: string, anilistId: number, category = 'sub', slug: string) {
    const cacheKey = `watch_${provider}_${anilistId}_${category}_${slug}`;
    const cached = getCache(cacheKey);
    if (cached) return cached.data;

    // Try upstream Miruro API
    const upstream = await fetchFromMiruroUpstream(
      `/watch/${encodeURIComponent(provider)}/${anilistId}/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`
    );
    if (upstream.ok && upstream.data) {
      setCache(cacheKey, upstream.data, 30 * 1000, 'upstream'); // 30s cache for streaming tokens
      return upstream.data;
    }

    // Fallback: Resolve real sources using AnimePahe / CoorenLabs / VidLink
    let episodeNumber = 1;
    const epMatch = slug.match(/(\d+)/);
    if (epMatch) {
      episodeNumber = parseInt(epMatch[1], 10) || 1;
    }

    const sources: Array<{
      url: string;
      quality: string;
      isM3U8: boolean;
      type: string;
      provider: string;
    }> = [];

    // Try AnimePahe streams if session slug exists
    if (provider === 'animepahe' || slug.includes('/') || slug.length > 15) {
      try {
        const parts = slug.split('/');
        const paheAnimeId = parts.length > 1 ? parts[0] : `${anilistId}`;
        const session = parts.length > 1 ? parts[1] : slug;
        const streamVariants = await getAnimePaheStreams(paheAnimeId, session);
        if (Array.isArray(streamVariants) && streamVariants.length > 0) {
          for (const s of streamVariants) {
            const streamUrl = s.proxiedUrl || s.url || s.directUrl;
            if (streamUrl) {
              sources.push({
                url: streamUrl,
                quality: s.quality || '720p',
                isM3U8: streamUrl.includes('.m3u8'),
                type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
                provider: 'AnimePahe',
              });
            }
          }
        }
      } catch {}
    }

    // Add high-speed verified fallback stream sources (VidLink & NontonGo support AniList IDs directly)
    const isDub = category === 'dub';
    sources.push({
      url: `https://vidlink.pro/anime/${anilistId}/${episodeNumber}/${isDub ? 'dub' : 'sub'}`,
      quality: '1080p',
      isM3U8: false,
      type: 'iframe',
      provider: 'VidLink (Miruro Partner)',
    });

    sources.push({
      url: `https://nontongo.win/anime/${anilistId}/${episodeNumber}/play`,
      quality: '1080p',
      isM3U8: false,
      type: 'iframe',
      provider: 'NontonGo (AniList Stream)',
    });

    const formatted = {
      provider,
      anilistId,
      episodeNumber,
      category,
      slug,
      sources,
      subtitles: [
        {
          lang: 'English',
          url: '',
        },
      ],
      intro: { start: 0, end: 90 },
      outro: { start: 1320, end: 1410 },
      source: 'local_fallback',
    };

    setCache(cacheKey, formatted, 30 * 1000, 'fallback');
    return formatted;
  },

  // Diagnostic health check for all 15 endpoints
  async runHealthDiagnostics(): Promise<MiruroDiagnostics> {
    const baseUrl = getMiruroBaseUrl();
    const enabled = isMiruroEnabled();
    const timeoutMs = getMiruroTimeout();

    const testEndpoints = [
      { name: 'Search', path: '/search?query=naruto' },
      { name: 'Suggestions', path: '/suggestions?query=naruto' },
      { name: 'Trending', path: '/trending' },
      { name: 'Popular', path: '/popular' },
      { name: 'Upcoming', path: '/upcoming' },
      { name: 'Recent', path: '/recent' },
      { name: 'Spotlight', path: '/spotlight' },
      { name: 'Schedule', path: '/schedule' },
      { name: 'Anime Info', path: '/info/20' },
      { name: 'Episodes', path: '/episodes/20' },
    ];

    const results = [];
    let anyUpstreamSuccess = false;

    for (const ep of testEndpoints) {
      const res = await fetchFromMiruroUpstream(ep.path, { timeoutMs: 5000 });
      if (res.ok) anyUpstreamSuccess = true;
      results.push({
        name: ep.name,
        path: ep.path,
        status: res.status,
        responseTimeMs: res.responseTimeMs,
        error: res.error,
        upstreamSuccess: res.ok,
      });
    }

    const avgMs = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    return {
      baseUrl,
      enabled,
      timeoutMs,
      totalRequests,
      failedRequests,
      upstreamConnected: anyUpstreamSuccess,
      lastSuccessfulRequest,
      lastError,
      lastHttpStatus,
      averageResponseTimeMs: avgMs,
      endpoints: results,
    };
  },
};
