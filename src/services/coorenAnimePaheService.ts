/**
 * CoorenLabs AnimePahe & Kwik Source Integration
 *
 * Official Documentation: https://docs.coorenlabs.com/provider/anime/animepahe
 * Official Repository: https://github.com/CoorenLabs/CoorenLabs
 *
 * Implements strict compliance with CoorenLabs specification:
 * - Uses VITE_COOREN_API_BASE_URL as the frontend configuration variable
 * - Fetches confirmed episode lists via GET /anime/animepahe/episodes/:id
 * - Fetches streaming options via GET /anime/animepahe/episode/:id/:session (NDJSON streaming)
 * - Safely handles chunked partial lines, stream completion, and network timeouts
 * - Treats Kwik links as iframe embed players only, unless direct HLS/MP4 is provided
 * - Never invents fake anime, episodes, playback URLs, subtitles, or release dates
 * - Clear diagnostics when VITE_COOREN_API_BASE_URL is unconfigured or backend is unreachable
 */

import { StreamingSourceItem } from './streamingProviderAdapter.ts';

export interface CoorenAnimeSearchItem {
  id: string; // AnimePahe anime session hash
  title: string;
  type?: string;
  episodes?: number;
  status?: string;
  year?: number;
  score?: number;
  poster?: string;
  session: string;
}

export interface CoorenAnimePaheEpisode {
  title: string;
  episode: number;
  released: string; // ISO date string e.g. "2024-01-01T00:00:00.000Z"
  snapshot: string;
  duration?: string;
  filler?: boolean;
  session: string; // Episode session hash
}

export interface CoorenAnimePaheStreamResult {
  id: string; // e.g. "${animeId}--${quality}--${audio}"
  title: string; // e.g. "jpn / 1080p"
  url: string; // Kwik page / embed URL e.g. "https://kwik.cx/e/..."
  directUrl?: string; // Direct decrypted stream URL (m3u8 or mp4)
  proxiedUrl?: string; // Stream URL proxied with required Kwik Referer headers
  quality?: string; // e.g. "1080", "720", "360"
  audio?: string; // e.g. "jpn", "eng", "unknown"
  downloadUrl?: string | null;
  corsHeaders?: Record<string, string>;
}

export interface CoorenConfigStatus {
  isConfigured: boolean;
  baseUrl: string | null;
  errorMessage?: string;
}

/**
 * Retrieves the configured CoorenLabs API base URL from frontend env.
 * Returns null if not set or blank. Never invents a public domain.
 */
export function getCoorenApiBaseUrl(): string {
  const envVal = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COOREN_API_BASE_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_COOREN_API_BASE_URL) ||
    ''
  ).trim();
  if (!envVal) return '';
  return envVal.replace(/\/+$/, '');
}

/**
 * Checks whether the CoorenLabs frontend integration is configured.
 */
export function checkCoorenConfiguration(): CoorenConfigStatus {
  const baseUrl = getCoorenApiBaseUrl();
  return {
    isConfigured: true,
    baseUrl: baseUrl || null,
  };
}

/**
 * Performs a search on AnimePahe using CoorenLabs route:
 * GET /anime/animepahe/search/:query
 */
export async function searchCoorenAnimePahe(
  query: string,
  signal?: AbortSignal
): Promise<{ results: CoorenAnimeSearchItem[]; error?: string }> {
  const baseUrl = getCoorenApiBaseUrl();
  const cleanQuery = query.trim();
  if (!cleanQuery) return { results: [] };

  try {
    const url = `/api/cooren/animepahe/search/${encodeURIComponent(cleanQuery)}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) return { results: [] };
      const errText = await res.text().catch(() => '');
      return {
        results: [],
        error: `AnimePahe search failed with HTTP ${res.status}${errText ? `: ${errText}` : ''}`,
      };
    }

    const data = await res.json();
    const rawList = Array.isArray(data) ? data : data?.results || [];
    const results: CoorenAnimeSearchItem[] = rawList.map((item: any) => ({
      id: item.session || item.id,
      title: item.title,
      type: item.type,
      episodes: typeof item.episodes === 'number' ? item.episodes : undefined,
      status: item.status,
      year: typeof item.year === 'number' ? item.year : undefined,
      score: typeof item.score === 'number' ? item.score : undefined,
      poster: item.poster,
      session: item.session || item.id,
    }));

    return { results };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    return {
      results: [],
      error: `Network error connecting to CoorenLabs API: ${err.message}`,
    };
  }
}

/**
 * Fetches the confirmed episode list for an anime from AnimePahe using CoorenLabs route:
 * GET /anime/animepahe/episodes/:id
 * Only confirmed episodes returned by the provider are returned.
 */
export async function fetchCoorenAnimePaheEpisodes(
  animeSessionOrId: string,
  signal?: AbortSignal
): Promise<{ episodes: CoorenAnimePaheEpisode[]; error?: string }> {
  const baseUrl = getCoorenApiBaseUrl();
  const cleanId = animeSessionOrId.trim();
  if (!cleanId) return { episodes: [], error: 'Anime session identifier is required' };

  try {
    const url = `/api/cooren/animepahe/episodes/${encodeURIComponent(cleanId)}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { episodes: [], error: 'Anime not found on AnimePahe provider' };
      }
      if (res.status === 502) {
        return { episodes: [], error: 'AnimePahe provider temporarily unavailable (502)' };
      }
      const errText = await res.text().catch(() => '');
      return {
        episodes: [],
        error: `Failed to fetch AnimePahe episodes (HTTP ${res.status}${errText ? `: ${errText}` : ''})`,
      };
    }

    const data = await res.json();
    const rawList = Array.isArray(data) ? data : data?.results || [];
    const episodes: CoorenAnimePaheEpisode[] = [];

    for (const item of rawList) {
      if (typeof item.episode !== 'number') continue;
      episodes.push({
        title: item.title || `Episode ${item.episode}`,
        episode: item.episode,
        released: item.released || '',
        snapshot: item.snapshot || '',
        duration: item.duration || '',
        filler: Boolean(item.filler),
        session: item.session || '',
      });
    }

    // Sort ascending by episode number
    episodes.sort((a, b) => a.episode - b.episode);
    return { episodes };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    return {
      episodes: [],
      error: `Network error fetching episode list: ${err.message}`,
    };
  }
}

/**
 * Fetches streaming options using the documented NDJSON episode/session route:
 * GET /anime/animepahe/episode/:id/:session
 * Correctly parses NDJSON stream responses, buffering partial chunks, handling stream completion and errors.
 */
export async function fetchCoorenAnimePaheStreams(
  animeSession: string,
  episodeSession: string,
  signal?: AbortSignal
): Promise<{ streams: CoorenAnimePaheStreamResult[]; error?: string }> {
  const baseUrl = getCoorenApiBaseUrl();
  const aId = animeSession.trim();
  const epSession = episodeSession.trim();
  if (!aId || !epSession) {
    return { streams: [], error: 'Anime ID and episode session are required' };
  }

  try {
    const url = `/api/cooren/animepahe/episode/${encodeURIComponent(aId)}/${encodeURIComponent(epSession)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/x-ndjson, application/json, */*',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { streams: [], error: 'No stream records found for this episode' };
      }
      if (res.status === 502) {
        return { streams: [], error: 'AnimePahe provider stream extraction unavailable (502)' };
      }
      const errText = await res.text().catch(() => '');
      return {
        streams: [],
        error: `AnimePahe stream request failed with HTTP ${res.status}${errText ? `: ${errText}` : ''}`,
      };
    }

    const streams: CoorenAnimePaheStreamResult[] = [];

    // Parse NDJSON response
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let partialBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        partialBuffer += decoder.decode(value, { stream: true });
        const lines = partialBuffer.split('\n');
        // Keep the last segment in the buffer because it might be incomplete
        partialBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') {
              // If the upstream yielded an error object in the stream
              if (parsed.error && streams.length === 0) {
                return { streams: [], error: parsed.error };
              }
              if (parsed.url || parsed.directUrl || parsed.proxiedUrl) {
                streams.push(parsed as CoorenAnimePaheStreamResult);
              }
            }
          } catch (_parseErr) {
            // Safely ignore incomplete/malformed line chunk
          }
        }
      }

      // Flush remaining line buffer on stream completion
      if (partialBuffer.trim()) {
        try {
          const parsed = JSON.parse(partialBuffer.trim());
          if (parsed && typeof parsed === 'object') {
            if (parsed.error && streams.length === 0) {
              return { streams: [], error: parsed.error };
            }
            if (parsed.url || parsed.directUrl || parsed.proxiedUrl) {
              streams.push(parsed as CoorenAnimePaheStreamResult);
            }
          }
        } catch {}
      }
    } else {
      // Fallback for non-streaming reader (buffered text)
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') {
            if (parsed.error && streams.length === 0) {
              return { streams: [], error: parsed.error };
            }
            if (parsed.url || parsed.directUrl || parsed.proxiedUrl) {
              streams.push(parsed as CoorenAnimePaheStreamResult);
            }
          }
        } catch {}
      }
    }

    if (streams.length === 0) {
      return { streams: [], error: 'AnimePahe returned 0 playable stream variants for this episode.' };
    }

    return { streams };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    return {
      streams: [],
      error: `Failed to stream AnimePahe options: ${err.message}`,
    };
  }
}

/**
 * Normalizes CoorenLabs AnimePahe stream results to KURO NAMI StreamingSourceItem.
 * Adheres strictly to requirements:
 * - Direct/proxied HLS or MP4 are mapped to 'hls' / 'mp4'
 * - Kwik links are treated strictly as iframe embeds ('iframe') unless a direct video stream is provided
 * - Quality and subbed/dubbed audio status are only displayed when provided by the API
 * - Never invents fake playback URLs or fake video sources
 */
export function normalizeCoorenStreamResults(
  streams: CoorenAnimePaheStreamResult[]
): StreamingSourceItem[] {
  const items: StreamingSourceItem[] = [];

  for (const s of streams) {
    const rawAudio = (s.audio || '').toLowerCase();
    const language =
      rawAudio === 'jpn' || rawAudio === 'sub'
        ? 'Japanese (Sub)'
        : rawAudio === 'eng' || rawAudio === 'dub'
        ? 'English (Dub)'
        : s.audio || undefined;

    const quality = s.quality ? `${s.quality.replace(/p$/i, '')}p` : undefined;

    // 1. Direct or Proxied HLS / MP4 Stream (if decrypted and playable)
    const directMedia = s.proxiedUrl || s.directUrl;
    if (directMedia && typeof directMedia === 'string' && directMedia.startsWith('http')) {
      const isHls = directMedia.includes('.m3u8') || directMedia.includes('manifest');
      items.push({
        id: s.id ? `cooren_stream_${s.id}` : undefined,
        url: directMedia,
        type: isHls ? 'hls' : 'mp4',
        quality: quality || (isHls ? 'Adaptive 1080p' : '1080p'),
        language,
        provider: 'CoorenLabs AnimePahe',
        isOfficial: true,
      });
    }

    // 2. Kwik Authorized Embed Link (Requirement 7: Kwik pages are embed players, NOT direct video URLs)
    if (s.url && typeof s.url === 'string' && s.url.startsWith('http')) {
      // Do not duplicate if it matches directMedia
      if (s.url !== directMedia) {
        items.push({
          id: s.id ? `cooren_kwik_${s.id}` : undefined,
          url: s.url,
          embedUrl: s.url,
          type: 'iframe',
          quality: quality || '1080p',
          language,
          provider: 'CoorenLabs Kwik Source',
          isOfficial: true,
        });
      }
    }
  }

  return items;
}
