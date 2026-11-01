import { SankaAPI, SANKA_DEFAULT_SOURCES } from './anime/sanka.ts';
import { AniwixiAPI } from './anime/aniwixi.ts';
import { AnimePaheAPI, AnimePaheSearchResult, AnimePaheEpisodeItem, AnimePaheStreamSource } from './anime/animepahe.ts';
import { AnimeMedia } from '../types/anime.ts';

export type PlaybackMode = 'direct-video' | 'hls' | 'embed' | 'top-level' | 'unknown';

export interface AggregatedStreamSource {
  id: string;
  provider: 'animepahe' | 'sanka' | 'aniwixi' | 'justalk' | 'anikoto' | 'server' | 'custom' | string;
  sourceName: string;
  url: string;
  type: string;
  quality: string;
  language: string;
  playbackMode: PlaybackMode;
  animeSession?: string;
  episodeSession?: string;
  audio?: 'jpn' | 'eng' | 'unknown';
  isOfficial?: boolean;
}

/**
 * Classifies a URL into a strict PlaybackMode
 */
export function classifyPlaybackUrl(url: string | null | undefined, providerName?: string): {
  cleanUrl: string | null;
  mode: PlaybackMode;
} {
  if (!url || typeof url !== 'string') {
    return { cleanUrl: null, mode: 'unknown' };
  }

  const clean = url.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return { cleanUrl: null, mode: 'unknown' };
  }

  const lower = clean.toLowerCase();
  const providerLower = (providerName || '').toLowerCase();

  // AniKoto and top-level requiring domains MUST be classified as top-level
  if (
    providerLower.includes('anikoto') ||
    lower.includes('anikoto') ||
    lower.includes('myanimelist.net') ||
    lower.includes('anilist.co') ||
    lower.includes('crunchyroll.com') ||
    lower.includes('netflix.com')
  ) {
    return { cleanUrl: clean, mode: 'top-level' };
  }

  // 1. Direct Video files (mp4, webm, mkv, avi)
  if (
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('.mkv') ||
    lower.endsWith('/mp4')
  ) {
    return { cleanUrl: clean, mode: 'direct-video' };
  }

  // 2. HLS Streams (.m3u8)
  if (lower.includes('.m3u8') || lower.includes('/hls/')) {
    return { cleanUrl: clean, mode: 'hls' };
  }

  // 3. Embedded Player URLs
  if (
    lower.includes('embed') ||
    lower.includes('/e/') ||
    lower.includes('player') ||
    lower.includes('streamtape') ||
    lower.includes('dood') ||
    lower.includes('vidhide') ||
    lower.includes('filemoon') ||
    lower.includes('mixdrop') ||
    lower.includes('vk.com') ||
    lower.includes('ok.ru')
  ) {
    return { cleanUrl: clean, mode: 'embed' };
  }

  // Generic web page link (top-level)
  return { cleanUrl: clean, mode: 'top-level' };
}

/**
 * Normalizes any raw source into an AggregatedStreamSource
 */
export function normalizeSource(
  rawUrl: string,
  provider: string,
  sourceName: string,
  quality = '1080p',
  language = 'Japanese (Sub)',
  idPrefix = 'src'
): AggregatedStreamSource | null {
  const { cleanUrl, mode } = classifyPlaybackUrl(rawUrl, provider);
  if (!cleanUrl || mode === 'unknown') return null;

  return {
    id: `${idPrefix}_${Math.random().toString(36).substring(2, 8)}`,
    provider,
    sourceName,
    url: cleanUrl,
    type: mode === 'hls' ? 'application/x-mpegURL' : mode === 'direct-video' ? 'video/mp4' : 'embed',
    quality,
    language,
    playbackMode: mode,
  };
}

/**
 * Calculates priority score for automatic playback selection.
 * Higher score = higher priority
 * Order of Preference:
 * AnimePahe 1080p -> AnimePahe 720p -> AnimePahe 480p -> AnimePahe 360p -> Sanka -> Aniwixi -> Justalk -> Others
 */
export function getPlaybackPriorityScore(source: AggregatedStreamSource): number {
  const p = source.provider.toLowerCase();
  const mode = source.playbackMode;

  // Top-level sources CANNOT be auto-played inside iframe/video element
  if (mode === 'top-level' || mode === 'unknown') {
    return -1000;
  }

  // 1. ANIMEPAHE PRIMARY PROVIDER
  if (p === 'animepahe') {
    let qScore = 2000;
    if (source.quality.includes('1080')) qScore = 2400;
    else if (source.quality.includes('720')) qScore = 2300;
    else if (source.quality.includes('480')) qScore = 2200;
    else if (source.quality.includes('360')) qScore = 2100;

    // Prefer HLS/Direct video over embed
    if (mode === 'hls' || mode === 'direct-video') return qScore + 100;
    return qScore;
  }

  // 2. SANKA API PROVIDER
  if (p === 'sanka') {
    if (mode === 'direct-video' || mode === 'hls') return 1500;
    return 1400;
  }

  // 3. ANIWIXI API PROVIDER
  if (p === 'aniwixi') {
    if (mode === 'direct-video' || mode === 'hls') return 1200;
    return 1100;
  }

  // 4. JUSTALK API PROVIDER
  if (p === 'justalk') {
    return 900;
  }

  // 5. SERVER / DB CUSTOM PROVIDERS
  if (mode === 'direct-video') return 800;
  if (mode === 'hls') return 750;
  if (mode === 'embed') return 600;

  return 0;
}

/**
 * Main aggregator: Fetches sources with AnimePahe as PRIMARY, followed by Sanka, Aniwixi, Justalk, Server, and local DB
 */
export async function collectEpisodeSources(
  anime: AnimeMedia | null,
  animeId: number,
  episodeNumber = 1
): Promise<{
  allSources: AggregatedStreamSource[];
  bestPermittedSource: AggregatedStreamSource | null;
  hasEmbeddedSource: boolean;
}> {
  const sources: AggregatedStreamSource[] = [];
  const titleVariants = [
    anime?.title?.english,
    anime?.title?.romaji,
    (anime?.title as any)?.userPreferred,
  ].filter(Boolean) as string[];

  const primaryTitle = titleVariants[0] || '';

  // 1. Primary Provider: AnimePahe
  let paheAnimeSession = '';
  let paheEpisodeSession = '';
  let paheDiscoveredSources: AnimePaheStreamSource[] = [];

  const animePahePromise = (async () => {
    if (!primaryTitle) return;
    try {
      for (const queryTitle of titleVariants) {
        const searchResults = await AnimePaheAPI.searchAnimePahe(queryTitle);
        if (!searchResults || searchResults.length === 0) continue;

        const firstResult = searchResults[0];
        paheAnimeSession = firstResult.animeSession;
        if (!paheAnimeSession) continue;

        const episodesList = await AnimePaheAPI.getAnimePaheEpisodes(paheAnimeSession);
        if (!episodesList || episodesList.length === 0) continue;

        const matchedEp =
          episodesList.find((e) => e.episodeNumber === episodeNumber) ||
          episodesList[0];

        if (!matchedEp || !matchedEp.episodeSession) continue;
        paheEpisodeSession = matchedEp.episodeSession;

        paheDiscoveredSources = await AnimePaheAPI.getAnimePaheSources(
          paheAnimeSession,
          paheEpisodeSession
        );

        for (const ps of paheDiscoveredSources) {
          const norm = normalizeSource(
            ps.url,
            'animepahe',
            `AnimePahe — ${ps.quality} (${ps.audio === 'eng' ? 'DUB' : 'SUB'})`,
            ps.quality,
            ps.audio === 'eng' ? 'English (Dub)' : 'Japanese (Sub)',
            'aph'
          );

          if (norm) {
            norm.animeSession = paheAnimeSession;
            norm.episodeSession = paheEpisodeSession;
            norm.audio = ps.audio === 'eng' ? 'eng' : ps.audio === 'jpn' ? 'jpn' : 'unknown';
            sources.push(norm);
          }
        }

        break; // Successfully loaded AnimePahe
      }
    } catch (_err) {
      // Gracefully continue
    }
  })();

  // 1. Fetch Sanka API Sources across default sources
  const sankaPromises = SANKA_DEFAULT_SOURCES.map(async (sankaSource) => {
    if (!primaryTitle) return;
    try {
      for (const queryTitle of titleVariants) {
        const searchResults = await SankaAPI.searchSankaAnime(queryTitle, sankaSource);
        if (!searchResults || searchResults.length === 0) continue;

        const firstMatch = searchResults[0];
        const slug = firstMatch.slug || firstMatch.endpoint || firstMatch.id;
        if (!slug) continue;

        const detail = await SankaAPI.getSankaAnimeDetails(sankaSource, slug);
        let epSlug = slug;

        if (detail && Array.isArray(detail.episodes) && detail.episodes.length > 0) {
          const epObj = detail.episodes.find(
            (e) => Number(e.episode_number) === episodeNumber || (e.slug && e.slug.includes(`${episodeNumber}`))
          ) || detail.episodes[0];
          epSlug = epObj.slug || epObj.endpoint || slug;
        } else {
          epSlug = `${slug}-episode-${episodeNumber}`;
        }

        const epDetails = await SankaAPI.getSankaEpisode(sankaSource, epSlug);
        if (epDetails) {
          const discovered = SankaAPI.recursiveExtractStreamSources(epDetails, '1080p', `Sanka — ${sankaSource.toUpperCase()}`);
          for (const disc of discovered) {
            const norm = normalizeSource(
              disc.url,
              'sanka',
              `Sanka — ${sankaSource.toUpperCase()} (${disc.quality || disc.server || '1080p'})`,
              disc.quality || '1080p',
              'Japanese (Sub)',
              `snk_${sankaSource}`
            );
            if (norm) sources.push(norm);
          }
        }
        break; // Stop after first working title variant
      }
    } catch (_err) {
      // Gracefully continue
    }
  });

  // 2. Fetch Aniwixi Sources
  const aniwixiPromise = (async () => {
    try {
      const epDetails = await AniwixiAPI.getAniwixiEpisode(animeId, episodeNumber);
      if (epDetails) {
        const discovered = SankaAPI.recursiveExtractStreamSources(epDetails, '1080p', 'Aniwixi Stream');
        for (const disc of discovered) {
          const norm = normalizeSource(
            disc.url,
            'aniwixi',
            `Aniwixi — ${disc.server || 'HD Stream'}`,
            disc.quality || '1080p',
            'Japanese (Sub)',
            'awx'
          );
          if (norm) sources.push(norm);
        }
      }
    } catch (_err) {
      // Gracefully continue
    }
  })();

  // 3. Fetch Justalk Multi-Source API
  const justalkPromise = (async () => {
    if (!primaryTitle) return;
    try {
      const res = await fetch(`/api/anime/sources?title=${encodeURIComponent(primaryTitle)}&episode=${episodeNumber}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sources)) {
          for (const s of data.sources) {
            const norm = normalizeSource(
              s.url || s.streamUrl,
              'justalk',
              `Justalk — ${s.source || s.server || 'Server'}`,
              s.quality || '1080p',
              s.language || 'Japanese (Sub)',
              'jst'
            );
            if (norm) sources.push(norm);
          }
        }
      }
    } catch (_err) {
      // Gracefully continue
    }
  })();

  // 4. Fetch Server Stream Engine (/api/streaming/resolve)
  const serverResolvePromise = (async () => {
    try {
      const res = await fetch(`/api/streaming/resolve?animeId=${animeId}&episode=${episodeNumber}&season=1`);
      if (res.ok) {
        const streamData = await res.json();
        if (Array.isArray(streamData)) {
          for (const st of streamData) {
            if (st.url && st.is_active !== 0) {
              const norm = normalizeSource(
                st.url,
                'server',
                `${st.provider || 'Server Node'} (${st.quality || '1080p'})`,
                st.quality || '1080p',
                st.language || 'Japanese (Sub)',
                'srv_res'
              );
              if (norm) sources.push(norm);
            }
          }
        }
      }
    } catch (_err) {
      // Gracefully continue
    }
  })();

  // 5. Fetch Local Video Sources DB (/api/video-sources/:animeId/:episodeId)
  const localDbPromise = (async () => {
    try {
      const res = await fetch(`/api/video-sources/${animeId}/${episodeNumber}`);
      if (res.ok) {
        const dbSources = await res.json();
        if (Array.isArray(dbSources)) {
          for (const s of dbSources) {
            if (s.url && s.is_active !== 0) {
              const norm = normalizeSource(
                s.url,
                'custom',
                `${s.provider || 'Database Source'} (${s.quality || '1080p'})`,
                s.quality || '1080p',
                s.language || 'Japanese (Sub)',
                'db_vs'
              );
              if (norm) sources.push(norm);
            }
          }
        }
      }
    } catch (_err) {
      // Gracefully continue
    }
  })();

  // Wait for all provider requests to settle
  await Promise.allSettled([
    animePahePromise,
    ...sankaPromises,
    aniwixiPromise,
    justalkPromise,
    serverResolvePromise,
    localDbPromise,
  ]);

  // Deduplicate sources by URL
  const uniqueSources: AggregatedStreamSource[] = [];
  const seenUrls = new Set<string>();

  for (const s of sources) {
    if (!seenUrls.has(s.url)) {
      seenUrls.add(s.url);
      uniqueSources.push(s);
    }
  }

  // Sort sources by priority
  uniqueSources.sort((a, b) => getPlaybackPriorityScore(b) - getPlaybackPriorityScore(a));

  // Find best permitted source for embedded playback
  const bestPermittedSource = uniqueSources.find((s) => {
    return s.playbackMode === 'direct-video' || s.playbackMode === 'hls' || s.playbackMode === 'embed';
  }) || null;

  // Development Console Debug Log
  if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
    const paheSources = uniqueSources.filter((s) => s.provider === 'animepahe' || s.provider === 'AnimePahe');
    const hlsCount = uniqueSources.filter((s) => s.playbackMode === 'hls').length;
    const mp4Count = uniqueSources.filter((s) => s.playbackMode === 'direct-video').length;

    console.log(`[TRUTH MODE / ANIMEPAHE]

Anime session:
${paheAnimeSession || 'N/A'}

Selected episode:
${episodeNumber}

Episode session:
${paheEpisodeSession || 'N/A'}

Sources found:
${paheSources.length}

HLS:
${hlsCount}

MP4:
${mp4Count}

Selected quality:
${bestPermittedSource?.quality || 'N/A'}

Selected source:
${bestPermittedSource?.url || 'N/A'}`);
  }

  return {
    allSources: uniqueSources,
    bestPermittedSource,
    hasEmbeddedSource: !!bestPermittedSource,
  };
}

export const streamingAggregator = {
  classifyPlaybackUrl,
  normalizeSource,
  getPlaybackPriorityScore,
  collectEpisodeSources,
};

export default streamingAggregator;

