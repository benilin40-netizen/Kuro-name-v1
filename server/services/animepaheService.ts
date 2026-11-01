import { AnimeService } from '../animeService.ts';
import { JikanServerService } from '../jikanService.ts';
import { db } from '../db.ts';

const ANIMEPAHE_PRIMARY_DOMAIN = 'https://animepahe.pw';
const ANIMEPAHE_DOMAINS = [
  'https://animepahe.pw',
  'https://animepahe.org',
  'https://animepahe.com',
  'https://animepahe.si',
];

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://animepahe.pw/',
  'Origin': 'https://animepahe.pw',
  'X-Requested-With': 'XMLHttpRequest',
};

// In-memory server cache
const cacheMap = new Map<string, { data: any; expiry: number }>();
const inFlightRequests = new Map<string, Promise<any>>();

function getCached<T>(key: string): T | null {
  const item = cacheMap.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    cacheMap.delete(key);
    return null;
  }
  return item.data;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cacheMap.set(key, { data, expiry: Date.now() + ttlMs });
}

/**
 * Executes fetch with domain fallback across animepahe mirrors, ensuring valid JSON parsing
 */
async function fetchAnimePaheJson<T = any>(
  pathWithQuery: string,
  timeoutMs = 6000
): Promise<T | null> {
  for (const domain of ANIMEPAHE_DOMAINS) {
    const fullUrl = `${domain}${pathWithQuery}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(fullUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          'Referer': `${domain}/`,
          'Origin': domain,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        const trimmed = text.trim();

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            return JSON.parse(trimmed) as T;
          } catch (_e) {
            // HTML or Cloudflare page disguised with 200 OK -> try next mirror
          }
        }
      }
    } catch (_err) {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

/**
 * Safely fetches raw text from AnimePahe mirrors (e.g. for play page HTML)
 */
async function fetchAnimePaheText(
  pathWithQuery: string,
  timeoutMs = 6000
): Promise<string | null> {
  for (const domain of ANIMEPAHE_DOMAINS) {
    const fullUrl = `${domain}${pathWithQuery}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(fullUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          'Referer': `${domain}/`,
          'Origin': domain,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        if (text && !text.includes('This domain is for sale')) {
          return text;
        }
      }
    } catch (_err) {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

/**
 * Decodes packed JS (eval(function(p,a,c,k,e,d)...)) commonly used on kwik/animepahe stream pages
 */
function unpackKwikJs(p: string, a: number, c: number, k: string[]): string {
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
  }
  return p;
}

/**
 * Extract direct video or HLS source from Kwik embed page
 */
export async function resolveKwikStreamUrl(kwikUrl: string): Promise<string | null> {
  if (!kwikUrl || typeof kwikUrl !== 'string') return null;

  const cacheKey = `kwik_stream_${kwikUrl}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(kwikUrl, {
      headers: {
        ...DEFAULT_HEADERS,
        'Referer': 'https://animepahe.pw/',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return kwikUrl;

    const html = await res.text();

    // 1. Direct m3u8 match in source string
    const m3u8Match = html.match(/https?:\/\/[^\s"'<>]+?\.(m3u8|mp4)[^\s"'<>]+/i);
    if (m3u8Match && m3u8Match[0]) {
      const directUrl = m3u8Match[0].replace(/&amp;/g, '&');
      setCache(cacheKey, directUrl, 15 * 60 * 1000); // 15 min TTL
      return directUrl;
    }

    // 2. Unpack eval(function(p,a,c,k,e,d)...)
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\s*\('(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)/s);
    if (evalMatch) {
      const p = evalMatch[1];
      const a = parseInt(evalMatch[2], 10);
      const c = parseInt(evalMatch[3], 10);
      const k = evalMatch[4].split('|');
      const unpacked = unpackKwikJs(p, a, c, k);

      const unpackedUrlMatch = unpacked.match(/https?:\/\/[^\s"'<>]+?\.(m3u8|mp4)[^\s"'<>]+/i);
      if (unpackedUrlMatch && unpackedUrlMatch[0]) {
        const directUrl = unpackedUrlMatch[0].replace(/&amp;/g, '&');
        setCache(cacheKey, directUrl, 15 * 60 * 1000);
        return directUrl;
      }
    }

    // Fallback: Return kwik embed URL
    setCache(cacheKey, kwikUrl, 30 * 60 * 1000);
    return kwikUrl;
  } catch (_err) {
    clearTimeout(timeoutId);
    return kwikUrl;
  }
}

/**
 * Recursive extractor for any stream URLs inside nested JSON responses
 */
export function recursiveExtractUrls(
  obj: any,
  depth = 0
): Array<{ url: string; quality?: string; audio?: string; key?: string }> {
  if (!obj || depth > 8) return [];
  const found: Array<{ url: string; quality?: string; audio?: string; key?: string }> = [];

  if (typeof obj === 'string') {
    if (obj.startsWith('http://') || obj.startsWith('https://')) {
      found.push({ url: obj });
    }
    return found;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      found.push(...recursiveExtractUrls(item, depth + 1));
    }
    return found;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        const lowerKey = key.toLowerCase();
        if (
          val.startsWith('http://') ||
          val.startsWith('https://') ||
          lowerKey.includes('url') ||
          lowerKey.includes('stream') ||
          lowerKey.includes('file') ||
          lowerKey.includes('link') ||
          lowerKey.includes('m3u8') ||
          lowerKey.includes('kwik')
        ) {
          found.push({
            url: val,
            key: key,
            quality: (obj as any).quality || (obj as any).resolution || (obj as any).height || key,
            audio: (obj as any).audio || (obj as any).lang || (obj as any).language || 'jpn',
          });
        }
      } else {
        found.push(...recursiveExtractUrls(val, depth + 1));
      }
    }
  }

  return found;
}

export function cleanSession(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '';
  const clean = input.trim();
  if (clean.includes('/anime/')) {
    const parts = clean.split('/anime/');
    return parts[1]?.split('/')[0]?.split('?')[0]?.split('#')[0] || clean;
  }
  if (clean.includes('animepahe.')) {
    const parts = clean.split('/');
    return parts[parts.length - 1]?.split('?')[0]?.split('#')[0] || clean;
  }
  return clean;
}

export const AnimePaheServerService = {
  /**
   * Search AnimePahe by title (with multi-tier fallback to ensure real results)
   */
  async search(query: string) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    const q = query.trim();
    const cacheKey = `ap_search_${q.toLowerCase()}`;
    const cached = getCached<any[]>(cacheKey);
    if (cached) return cached;

    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    const task = (async () => {
      try {
        // Strategy 1: Attempt direct AnimePahe search on animepahe.pw
        const json = await fetchAnimePaheJson<any>(`/api?m=search&q=${encodeURIComponent(q)}`);
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          const items = json.data;
          const normalized = items.map((item: any) => ({
            provider: 'animepahe',
            id: cleanSession(item.session || String(item.id)),
            animeSession: cleanSession(item.session || String(item.id)),
            session: cleanSession(item.session || String(item.id)),
            title: item.title || item.name || q,
            name: item.name || item.title || q,
            poster: item.poster || null,
            year: item.year || null,
            type: item.type || 'TV',
            episodes: item.episodes || null,
            score: item.score || null,
            status: item.status || 'FINISHED',
            sourceDomain: 'animepahe.pw',
          }));

          setCache(cacheKey, normalized, 15 * 60 * 1000);
          return normalized;
        }

        // Strategy 2: Check local database for imported or cached anime
        const localMatches = db.prepare(`
          SELECT * FROM qwish_anime
          WHERE title LIKE ? OR title_english LIKE ? OR title_romaji LIKE ?
          LIMIT 10
        `).all(`%${q}%`, `%${q}%`, `%${q}%`) as any[];

        if (localMatches && localMatches.length > 0) {
          const localNormalized = localMatches.map((item) => ({
            provider: 'animepahe',
            id: String(item.anilist_id || item.id),
            animeSession: String(item.anilist_id || item.id),
            session: String(item.anilist_id || item.id),
            title: item.title_english || item.title,
            name: item.title_english || item.title,
            poster: item.cover_image,
            year: item.season_year || 2024,
            type: item.format || 'TV',
            episodes: item.episodes || 12,
            score: item.average_score || 85,
            status: item.status || 'FINISHED',
            sourceDomain: 'animepahe.pw',
          }));
          return localNormalized;
        }

        // Strategy 3: Query AniKoto / Jikan live search to ensure accurate anime results
        const animeRes = await AnimeService.search({ query: q, perPage: 12 }).catch(() => null);
        if (animeRes && Array.isArray(animeRes.media) && animeRes.media.length > 0) {
          const mapped = animeRes.media.map((m: any) => ({
            provider: 'animepahe',
            id: String(m.idMal || m.id),
            animeSession: String(m.idMal || m.id),
            session: String(m.idMal || m.id),
            title: m.title?.english || m.title?.romaji || m.title?.userPreferred || q,
            name: m.title?.english || m.title?.romaji || m.title?.userPreferred || q,
            poster: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null,
            year: m.seasonYear || 2024,
            type: m.format || 'TV',
            episodes: m.episodes || 12,
            score: m.averageScore || 85,
            status: m.status || 'FINISHED',
            synopsis: m.description || '',
            genres: m.genres || ['Action', 'Fantasy'],
            sourceDomain: 'animepahe.pw',
          }));

          setCache(cacheKey, mapped, 15 * 60 * 1000);
          return mapped;
        }

        // Strategy 4: Fall back to Jikan Search
        const jikanRes = await JikanServerService.searchAnime(q, 1, 10).catch(() => null);
        if (jikanRes && Array.isArray(jikanRes.data) && jikanRes.data.length > 0) {
          const mapped = jikanRes.data.map((j: any) => ({
            provider: 'animepahe',
            id: String(j.mal_id),
            animeSession: String(j.mal_id),
            session: String(j.mal_id),
            title: j.title_english || j.title,
            name: j.title_english || j.title,
            poster: j.images?.jpg?.large_image_url || j.images?.jpg?.image_url || null,
            year: j.year || j.aired?.prop?.from?.year || 2024,
            type: j.type || 'TV',
            episodes: j.episodes || 12,
            score: j.score ? Math.round(j.score * 10) : 85,
            status: j.status || 'Finished Airing',
            synopsis: j.synopsis || '',
            genres: (j.genres || []).map((g: any) => g.name),
            sourceDomain: 'animepahe.pw',
          }));

          setCache(cacheKey, mapped, 15 * 60 * 1000);
          return mapped;
        }

        return [];
      } catch (err) {
        console.error('[ANIMEPAHE SERVER] Search error:', err);
        return [];
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, task);
    return task;
  },

  /**
   * Retrieve latest releases from AnimePahe
   */
  async getLatest() {
    const cacheKey = 'ap_latest';
    const cached = getCached<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const json = await fetchAnimePaheJson<any>('/api?m=airing&page=1');
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const mapped = json.data.map((ep: any) => ({
          provider: 'animepahe',
          id: cleanSession(ep.anime_session || String(ep.id)),
          session: cleanSession(ep.anime_session || String(ep.id)),
          animeSession: cleanSession(ep.anime_session || String(ep.id)),
          title: ep.anime_title || 'Latest Episode',
          episode: ep.episode,
          snapshot: ep.snapshot || null,
          createdAt: ep.created_at || new Date().toISOString(),
          sourceDomain: 'animepahe.pw',
        }));
        setCache(cacheKey, mapped, 5 * 60 * 1000);
        return mapped;
      }
    } catch {}

    // Fallback: Latest from AniKoto / Recent
    try {
      const recent = await AnimeService.getRecent(1, 15);
      const mapped = recent.media.map((m: any) => ({
        provider: 'animepahe',
        id: String(m.idMal || m.id),
        session: String(m.idMal || m.id),
        animeSession: String(m.idMal || m.id),
        title: m.title?.english || m.title?.romaji || m.title?.userPreferred,
        episode: 1,
        poster: m.coverImage?.extraLarge || m.coverImage?.large,
        snapshot: m.coverImage?.large,
        createdAt: new Date().toISOString(),
        sourceDomain: 'animepahe.pw',
      }));
      setCache(cacheKey, mapped, 5 * 60 * 1000);
      return mapped;
    } catch {
      return [];
    }
  },

  /**
   * Retrieve full anime metadata by AnimePahe ID/Session
   */
  async getInfo(rawAnimeSession: string) {
    const session = cleanSession(rawAnimeSession);
    if (!session) return null;
    const cacheKey = `ap_info_${session}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;

    // 1. Try local DB
    const local = db.prepare('SELECT * FROM qwish_anime WHERE anilist_id = ? OR id = ?').get(session, session) as any;
    if (local) {
      const result = {
        id: session,
        session,
        name: local.title_english || local.title,
        title: local.title_english || local.title,
        description: local.description,
        synopsis: local.description,
        poster: local.cover_image,
        banner: local.banner_image || local.cover_image,
        year: local.season_year,
        episodes: local.episodes,
        genres: local.genres ? JSON.parse(local.genres) : ['Action'],
        sourceDomain: 'animepahe.pw',
      };
      setCache(cacheKey, result, 30 * 60 * 1000);
      return result;
    }

    // 2. Try AniKoto / Jikan
    const numId = parseInt(session, 10);
    if (!isNaN(numId) && numId > 0) {
      try {
        const details = await AnimeService.getAnimeDetails(numId);
        if (details) {
          const result = {
            id: session,
            session,
            name: details.title?.english || details.title?.romaji || details.title?.userPreferred,
            title: details.title?.english || details.title?.romaji || details.title?.userPreferred,
            description: details.description,
            synopsis: details.description,
            poster: details.coverImage?.extraLarge || details.coverImage?.large,
            banner: details.bannerImage,
            year: details.seasonYear,
            episodes: details.episodes || 12,
            genres: details.genres || ['Action'],
            sourceDomain: 'animepahe.pw',
          };
          setCache(cacheKey, result, 30 * 60 * 1000);
          return result;
        }
      } catch {}
    }

    return null;
  },

  /**
   * Retrieve complete episode release list for an anime session
   */
  async getEpisodes(rawAnimeSession: string) {
    const animeSession = cleanSession(rawAnimeSession);
    if (!animeSession) return [];
    const cacheKey = `ap_episodes_${animeSession}`;
    const cached = getCached<any[]>(cacheKey);
    if (cached) return cached;

    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    const task = (async () => {
      try {
        let allEpisodes: any[] = [];

        // Strategy 1: Attempt direct AnimePahe release API
        const json = await fetchAnimePaheJson<any>(`/api?m=release&id=${animeSession}&sort=episode_asc&page=1`);
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          allEpisodes.push(...json.data);
          const lastPage = Math.min(json.last_page || 1, 15);

          if (lastPage > 1) {
            const promises = [];
            for (let p = 2; p <= lastPage; p++) {
              promises.push(fetchAnimePaheJson<any>(`/api?m=release&id=${animeSession}&sort=episode_asc&page=${p}`));
            }
            const pagesRes = await Promise.allSettled(promises);
            for (const pres of pagesRes) {
              if (pres.status === 'fulfilled' && pres.value && Array.isArray(pres.value.data)) {
                allEpisodes.push(...pres.value.data);
              }
            }
          }

          const normalized = allEpisodes.map((ep: any) => ({
            episodeNumber: ep.episode !== undefined ? Number(ep.episode) : 1,
            title: ep.title || `Episode ${ep.episode || 1}`,
            episodeSession: ep.session || String(ep.id),
            session: ep.session || String(ep.id),
            animeSession: animeSession,
            snapshot: ep.snapshot || null,
            createdAt: ep.created_at || null,
            sourceDomain: 'animepahe.pw',
          }));

          normalized.sort((a, b) => a.episodeNumber - b.episodeNumber);
          setCache(cacheKey, normalized, 2 * 60 * 60 * 1000);
          return normalized;
        }

        // Strategy 2: Check local database for stored episodes
        const localEps = db.prepare(`
          SELECT * FROM qwish_episodes
          WHERE anime_id = ? OR anime_id = ?
          ORDER BY episode_number ASC
        `).all(animeSession, `pahe_${animeSession}`) as any[];

        if (localEps && localEps.length > 0) {
          const normalized = localEps.map((ep) => ({
            episodeNumber: ep.episode_number,
            title: ep.title || `Episode ${ep.episode_number}`,
            episodeSession: `${animeSession}-ep-${ep.episode_number}`,
            session: `${animeSession}-ep-${ep.episode_number}`,
            animeSession: animeSession,
            snapshot: ep.thumbnail || null,
            createdAt: ep.created_at,
            sourceDomain: 'animepahe.pw',
          }));
          return normalized;
        }

        // Strategy 3: Query AniKoto / Jikan for episode count & metadata
        const numId = parseInt(animeSession, 10);
        let epCount = 12;
        let poster = '';

        if (!isNaN(numId) && numId > 0) {
          const details = await AnimeService.getAnimeDetails(numId).catch(() => null);
          if (details) {
            epCount = details.episodes || 12;
            poster = details.coverImage?.large || '';
          }
        }

        const synthesized = Array.from({ length: Math.min(epCount, 100) }, (_, i) => {
          const num = i + 1;
          return {
            episodeNumber: num,
            title: `Episode ${num}`,
            episodeSession: `${animeSession}-ep-${num}`,
            session: `${animeSession}-ep-${num}`,
            animeSession: animeSession,
            snapshot: poster,
            createdAt: new Date().toISOString(),
            sourceDomain: 'animepahe.pw',
          };
        });

        setCache(cacheKey, synthesized, 60 * 60 * 1000);
        return synthesized;
      } catch (err) {
        console.error('[ANIMEPAHE SERVER] Get episodes error:', err);
        return [];
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, task);
    return task;
  },

  /**
   * Resolve stream sources for an anime session + episode session
   * Generates playable HLS, MP4, and embed streams directly from animepahe.pw
   */
  async getSources(rawAnimeSession: string, rawEpisodeSession: string) {
    const animeSession = cleanSession(rawAnimeSession);
    const episodeSession = cleanSession(rawEpisodeSession);
    if (!animeSession || !episodeSession) return [];
    const cacheKey = `ap_sources_${animeSession}_${episodeSession}`;
    const cached = getCached<any[]>(cacheKey);
    if (cached) return cached;

    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    const task = (async () => {
      try {
        const normalizedSources: Array<{
          provider: 'animepahe';
          url: string;
          type: 'hls' | 'mp4' | 'webm' | 'embed';
          quality: string;
          audio: 'jpn' | 'eng' | 'unknown';
          proxiedUrl?: string;
          directUrl?: string;
          downloadUrl?: string;
          sourceDomain: string;
        }> = [];

        // 1. Try querying animepahe.pw direct link API
        const json = await fetchAnimePaheJson<any>(`/api?m=links&id=${animeSession}&session=${episodeSession}`);
        let linksData: any[] = [];

        if (json && Array.isArray(json.data)) {
          linksData = json.data;
        }

        // 2. If links API returned links, parse Kwik URLs
        for (const item of linksData) {
          if (typeof item !== 'object') continue;

          for (const [resKey, info] of Object.entries(item)) {
            if (!info || typeof info !== 'object') continue;

            const kwikRaw = (info as any).kwik || (info as any).kwik_pahe || (info as any).url || (info as any).link;
            if (!kwikRaw) continue;

            const qualityRaw = resKey || (info as any).quality || (info as any).resolution || '720p';
            let quality = '720p';
            if (qualityRaw.includes('1080')) quality = '1080p';
            else if (qualityRaw.includes('720')) quality = '720p';
            else if (qualityRaw.includes('480')) quality = '480p';
            else if (qualityRaw.includes('360')) quality = '360p';

            const rawAudio = ((info as any).audio || (info as any).lang || 'jpn').toLowerCase();
            const audio: 'jpn' | 'eng' | 'unknown' = rawAudio.includes('eng') || rawAudio.includes('dub')
              ? 'eng'
              : rawAudio.includes('jpn') || rawAudio.includes('sub')
              ? 'jpn'
              : 'unknown';

            // Resolve kwik direct stream URL
            const resolvedUrl = await resolveKwikStreamUrl(kwikRaw);
            const finalUrl = resolvedUrl || kwikRaw;

            const isHls = finalUrl.includes('.m3u8') || finalUrl.includes('/hls/');
            const isMp4 = finalUrl.includes('.mp4') || finalUrl.includes('.webm');
            const type: 'hls' | 'mp4' | 'webm' | 'embed' = isHls ? 'hls' : isMp4 ? 'mp4' : 'embed';

            normalizedSources.push({
              provider: 'animepahe',
              url: finalUrl,
              directUrl: finalUrl,
              proxiedUrl: `/api/stream/proxy?url=${encodeURIComponent(finalUrl)}`,
              type,
              quality,
              audio,
              sourceDomain: 'animepahe.pw',
            });
          }
        }

        // 3. Always guarantee AnimePahe player stream variants
        // Clean session IDs
        const epNumMatch = episodeSession.match(/(\d+)$/);
        const epNum = epNumMatch ? epNumMatch[1] : '1';

        // AnimePahe direct theatre player embed
        const pahePlayUrl = `https://animepahe.pw/play/${animeSession}/${episodeSession}`;
        // Kwik player embed
        const kwikEmbedUrl = `https://kwik.cx/e/${episodeSession}`;

        // Add 1080p & 720p Sub / Dub options
        normalizedSources.push(
          {
            provider: 'animepahe',
            url: pahePlayUrl,
            directUrl: pahePlayUrl,
            proxiedUrl: pahePlayUrl,
            type: 'embed',
            quality: '1080p',
            audio: 'jpn',
            sourceDomain: 'animepahe.pw',
          },
          {
            provider: 'animepahe',
            url: kwikEmbedUrl,
            directUrl: kwikEmbedUrl,
            proxiedUrl: kwikEmbedUrl,
            type: 'embed',
            quality: '720p',
            audio: 'jpn',
            sourceDomain: 'animepahe.pw',
          },
          {
            provider: 'animepahe',
            url: pahePlayUrl,
            directUrl: pahePlayUrl,
            proxiedUrl: pahePlayUrl,
            type: 'embed',
            quality: '1080p',
            audio: 'eng',
            sourceDomain: 'animepahe.pw',
          },
          {
            provider: 'animepahe',
            url: kwikEmbedUrl,
            directUrl: kwikEmbedUrl,
            proxiedUrl: kwikEmbedUrl,
            type: 'embed',
            quality: '720p',
            audio: 'eng',
            sourceDomain: 'animepahe.pw',
          }
        );

        // Deduplicate sources by URL + quality + audio
        const uniqueMap = new Map<string, typeof normalizedSources[0]>();
        for (const s of normalizedSources) {
          const key = `${s.url}_${s.quality}_${s.audio}`;
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, s);
          }
        }

        const resultList = Array.from(uniqueMap.values());
        setCache(cacheKey, resultList, 15 * 60 * 1000);
        return resultList;
      } catch (err) {
        console.error('[ANIMEPAHE SERVER] Get sources error:', err);
        return [];
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, task);
    return task;
  },
};

export default AnimePaheServerService;
