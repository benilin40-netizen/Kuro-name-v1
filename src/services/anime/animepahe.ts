/**
 * AnimePahe Provider Service
 *
 * Communicates with CoorenLabs AnimePahe API using VITE_COOREN_API_BASE_URL
 * and implements the two-ID (anime-session/episode-session) resolution pattern.
 */

export interface AnimePaheSearchResult {
  provider: 'animepahe';
  animeSession: string;
  title: string;
  poster?: string | null;
  year?: number | null;
  type?: string;
  episodes?: number | null;
  score?: number | null;
}

export interface AnimePaheEpisodeItem {
  episodeNumber: number;
  title: string;
  episodeSession: string;
  animeSession: string;
  snapshot?: string | null;
  createdAt?: string | null;
}

export interface AnimePaheStreamSource {
  provider: 'AnimePahe' | 'animepahe';
  url: string;
  type: 'hls' | 'mp4' | 'webm' | 'embed';
  quality: string; // '1080p' | '720p' | '480p' | '360p'
  audio: 'jpn' | 'eng' | 'unknown' | string;
  proxiedUrl?: string;
  directUrl?: string;
  downloadUrl?: string;
}

const getCoorenApiBase = () => {
  return '';
};

import {
  proxySearchAnimePahe,
  proxyGetAnimePaheEpisodes,
  proxyGetAnimePaheStreams,
  extractAnimePaheSession as extractSessionFromProxy,
  AnimePaheRequestOptions,
} from './proxy.ts';

export const extractAnimePaheSession = extractSessionFromProxy;

/**
 * Search: /api/anime/animepahe/search/{query} via client-side proxy wrapper
 */
export async function searchAnimePahe(
  query: string,
  options?: AnimePaheRequestOptions
): Promise<AnimePaheSearchResult[]> {
  if (!query || !query.trim()) return [];
  try {
    const results = await proxySearchAnimePahe(query.trim(), options);
    return results.map((item) => ({
      provider: 'animepahe',
      animeSession: item.session,
      title: item.title,
      poster: item.poster || null,
      year: item.year || null,
      type: item.type || 'TV',
      episodes: item.episodes || null,
      score: item.score || null,
    }));
  } catch (err) {
    console.error('[ANIMEPAHE SERVICE] searchAnimePahe error via proxy wrapper:', err);
    return [];
  }
}

/**
 * Episode list: /api/anime/animepahe/episodes/{id} via client-side proxy wrapper
 */
export async function getAnimePaheEpisodes(
  animeSessionInput: string,
  options?: AnimePaheRequestOptions
): Promise<AnimePaheEpisodeItem[]> {
  const animeSession = extractAnimePaheSession(animeSessionInput);
  if (!animeSession) return [];
  try {
    const list = await proxyGetAnimePaheEpisodes(animeSession, options);
    return list.map((item) => ({
      episodeNumber: item.episodeNumber,
      title: item.title,
      episodeSession: item.session,
      animeSession: animeSession,
      snapshot: item.snapshot || null,
      createdAt: item.createdAt || null,
    }));
  } catch (err) {
    console.error('[ANIMEPAHE SERVICE] getAnimePaheEpisodes error via proxy wrapper:', err);
    return [];
  }
}

/**
 * Episode sources: /api/anime/animepahe/episode/{id}/{session} via client-side proxy wrapper
 */
export async function getAnimePaheSources(
  animeSessionInput: string,
  episodeSessionInput: string,
  options?: AnimePaheRequestOptions
): Promise<AnimePaheStreamSource[]> {
  const animeSession = extractAnimePaheSession(animeSessionInput);
  const episodeSession = extractAnimePaheSession(episodeSessionInput);
  if (!animeSession || !episodeSession) return [];

  try {
    const streams = await proxyGetAnimePaheStreams(animeSession, episodeSession, options);
    return streams.map((item) => {
      const type = item.url.includes('.m3u8') ? 'hls' : item.url.includes('.mp4') ? 'mp4' : 'embed';
      return {
        provider: 'AnimePahe',
        url: item.proxiedUrl || item.directUrl || item.url,
        type,
        quality: item.quality,
        audio: item.audio,
        proxiedUrl: item.proxiedUrl,
        directUrl: item.directUrl,
        downloadUrl: item.downloadUrl,
      };
    });
  } catch (err) {
    console.error('[ANIMEPAHE SERVICE] getAnimePaheSources error via proxy wrapper:', err);
    return [];
  }
}

export function normalizeAnimePaheSources(rawResponse: any): AnimePaheStreamSource[] {
  if (!rawResponse) return [];
  const items = Array.isArray(rawResponse) ? rawResponse : [rawResponse];
  const result: AnimePaheStreamSource[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const url = item.proxiedUrl || item.directUrl || item.url || item.streamUrl || item.link || item.kwik;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) continue;

    const lower = url.toLowerCase();
    const type: 'hls' | 'mp4' | 'webm' | 'embed' = lower.includes('.m3u8') ? 'hls' : lower.includes('.mp4') ? 'mp4' : 'embed';
    const qualityRaw = String(item.quality || item.resolution || '720p');
    let quality = '720p';
    if (qualityRaw.includes('1080')) quality = '1080p';
    else if (qualityRaw.includes('720')) quality = '720p';
    else if (qualityRaw.includes('480')) quality = '480p';
    else if (qualityRaw.includes('360')) quality = '360p';

    const audioRaw = String(item.audio || item.lang || 'jpn').toLowerCase();
    const audio = audioRaw.includes('eng') || audioRaw.includes('dub') ? 'eng' : 'jpn';

    result.push({
      provider: 'AnimePahe',
      url,
      type,
      quality,
      audio,
    });
  }
  return result;
}

export const AnimePaheAPI = {
  extractAnimePaheSession,
  searchAnimePahe,
  getAnimePaheEpisodes,
  getAnimePaheSources,
  normalizeAnimePaheSources,
  search: searchAnimePahe,
  getEpisodes: getAnimePaheEpisodes,
  getSources: getAnimePaheSources,
  normalizeSources: normalizeAnimePaheSources,
};

export default AnimePaheAPI;
