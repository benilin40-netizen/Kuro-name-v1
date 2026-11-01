import {
  NormalizedEpisodeSources,
  StreamingSource,
  StreamingProvider,
  SourceHealthStatus,
  BestSourceResult,
  AnimeMedia,
} from '../types/anime.ts';
import { getAnimeDetails } from './animeApi.ts';

// In-memory set of sources that failed during the current session
const sessionFailedSourceIds = new Set<string>();

/**
 * Record that a source failed during playback so fallback prefers other sources
 */
export function recordSourcePlaybackFailure(sourceId: string): void {
  if (sourceId) {
    sessionFailedSourceIds.add(sourceId);
  }
}

/**
 * Clear failure tracking for an episode/retry
 */
export function resetSourcePlaybackFailures(): void {
  sessionFailedSourceIds.clear();
}

/**
 * Check if a source has recently failed in this session
 */
export function isSourceMarkedFailed(sourceId: string): boolean {
  return sessionFailedSourceIds.has(sourceId);
}

// Available streaming providers catalog
export const STREAMING_PROVIDERS: StreamingProvider[] = [
  {
    id: 'primary',
    name: 'Official Studio Master',
    isOfficial: true,
  },
  {
    id: 'adaptive',
    name: 'Official Adaptive Stream',
    isOfficial: true,
  },
  {
    id: 'broadcast',
    name: 'Official Broadcast Stream',
    isOfficial: true,
  },
];

/**
 * Validates whether a streaming URL is syntactically sound and non-empty
 */
export function isValidStreamUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed === 'about:blank') return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalizes raw database or API row into a clean StreamingSource object
 */
export function normalizeStreamingSource(raw: any, animeId: number, episodeNumber: number, seasonNumber = 1): StreamingSource | null {
  const url = (raw.sourceUrl || raw.url || raw.sub_video_url || raw.video_url || '').trim();
  if (!isValidStreamUrl(url)) return null;

  const rawType = (raw.type || (url.includes('.m3u8') ? 'hls' : 'mp4')).toLowerCase();
  const type: StreamingSource['type'] =
    rawType === 'hls' || url.includes('.m3u8')
      ? 'application/x-mpegURL'
      : rawType === 'embed'
      ? 'embed'
      : 'video/mp4';

  const healthStatus: SourceHealthStatus =
    raw.health_status === 'offline'
      ? 'offline'
      : raw.health_status === 'degraded'
      ? 'degraded'
      : raw.health_status === 'unknown'
      ? 'unknown'
      : 'healthy';

  const sourceId = raw.id || `vs_${animeId}_s${seasonNumber}_e${episodeNumber}_${Math.random().toString(36).substring(2, 6)}`;
  const provider = raw.provider || 'Official Studio Master';

  return {
    id: sourceId,
    animeId,
    episodeNumber,
    seasonNumber,
    provider,
    server: provider,
    sourceUrl: url,
    url,
    type,
    quality: raw.quality || (url.includes('.m3u8') ? 'Adaptive HLS' : '1080p'),
    language: raw.language || 'Japanese (Sub)',
    isActive: raw.is_active !== undefined ? (raw.is_active === 1 || raw.is_active === true) : true,
    isDefault: !!raw.is_default,
    healthStatus,
    responseTimeMs: raw.response_time_ms || null,
    failureCount: raw.failure_count || 0,
    httpStatus: raw.http_status || 200,
    lastChecked: raw.last_checked || null,
    lastSuccessfulCheck: raw.last_successful_check || null,
    notes: raw.notes || '',
    createdAt: raw.created_at || new Date().toISOString(),
    updatedAt: raw.updated_at || new Date().toISOString(),
  };
}

/**
 * Fetches all authorized streaming sources for an episode
 */
export async function getEpisodeSources(
  animeId: number,
  episodeNumber = 1,
  seasonNumber = 1
): Promise<NormalizedEpisodeSources> {
  const result: NormalizedEpisodeSources = {
    animeId,
    seasonNumber,
    episodeNumber,
    title: `Episode ${episodeNumber}`,
    status: 'unavailable',
    sources: [],
    subtitles: [],
    officialLinks: [],
    provider: 'KURO NAMI Streaming Engine',
  };

  try {
    // 1. Fetch metadata in parallel for trailer and official streaming links
    const animeDetailsPromise = getAnimeDetails(animeId).catch(() => null);

    // 2. Fetch server authorized video sources from local database
    const serverSourcesPromise = fetch(
      `/api/video-sources/${animeId}/${episodeNumber}?season=${seasonNumber}`
    )
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);

    // 3. Fetch episode configuration (air date and publish status)
    const epConfigPromise = fetch(
      `/api/episodes/${animeId}/${episodeNumber}?season=${seasonNumber}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    const [animeMedia, dbSources, epConfig] = await Promise.all([
      animeDetailsPromise,
      serverSourcesPromise,
      epConfigPromise,
    ]);

    // Attach trailer if available
    if (animeMedia?.trailer && animeMedia.trailer.id) {
      result.trailer = animeMedia.trailer;
    }

    // Attach title if known
    if (epConfig?.title) {
      result.title = epConfig.title;
    } else if (animeMedia?.title) {
      result.title = `${animeMedia.title.english || animeMedia.title.romaji} - Episode ${episodeNumber}`;
    }

    // Attach official links (e.g. AniList, MyAnimeList)
    const officialLinks: Array<{ site: string; url: string }> = [];
    if (animeMedia?.idMal) {
      officialLinks.push({
        site: 'MyAnimeList',
        url: `https://myanimelist.net/anime/${animeMedia.idMal}`,
      });
    }
    officialLinks.push({
      site: 'AniList',
      url: `https://anilist.co/anime/${animeId}`,
    });
    result.officialLinks = officialLinks;

    // Check if episode has aired
    const nowUtc = new Date().toISOString();
    if (epConfig?.air_date && epConfig.air_date > nowUtc) {
      result.status = 'scheduled';
      result.airDate = epConfig.air_date;
      return result;
    }

    // Process database video sources
    const validSources: StreamingSource[] = [];

    if (Array.isArray(dbSources)) {
      for (const s of dbSources) {
        const normalized = normalizeStreamingSource(s, animeId, episodeNumber, seasonNumber);
        if (normalized && normalized.isActive) {
          validSources.push(normalized);
        }
      }
    }

    // Also check if episode config has direct sub/dub URLs configured
    if (epConfig) {
      if (isValidStreamUrl(epConfig.sub_video_url)) {
        const subNormalized = normalizeStreamingSource({
          id: `cfg_sub_${epConfig.id || episodeNumber}`,
          provider: 'Official Studio Sub',
          title: epConfig.title || `Episode ${episodeNumber} (Sub)`,
          url: epConfig.sub_video_url,
          quality: '1080p',
          language: 'Japanese (Sub)',
          is_default: validSources.length === 0 ? 1 : 0,
          health_status: 'healthy',
        }, animeId, episodeNumber, seasonNumber);

        if (subNormalized && !validSources.some((s) => s.sourceUrl === subNormalized.sourceUrl)) {
          validSources.push(subNormalized);
        }
      }

      if (isValidStreamUrl(epConfig.dub_video_url)) {
        const dubNormalized = normalizeStreamingSource({
          id: `cfg_dub_${epConfig.id || episodeNumber}`,
          provider: 'Official Studio Dub',
          title: epConfig.title || `Episode ${episodeNumber} (Dub)`,
          url: epConfig.dub_video_url,
          quality: '1080p',
          language: 'English (Dub)',
          is_default: 0,
          health_status: 'healthy',
        }, animeId, episodeNumber, seasonNumber);

        if (dubNormalized && !validSources.some((s) => s.sourceUrl === dubNormalized.sourceUrl)) {
          validSources.push(dubNormalized);
        }
      }
    }

    if (validSources.length > 0) {
      result.sources = validSources;
      result.status = 'available';
    } else {
      result.status = 'unavailable';
    }

    return result;
  } catch (err) {
    console.warn(`[STREAMING] Error resolving stream sources for anime #${animeId} Ep ${episodeNumber}:`, err);
    result.status = 'unavailable';
    return result;
  }
}

/**
 * Score a source for sorting priority
 * Higher score = higher preference
 */
function getSourceScore(source: StreamingSource, preferredQuality = '1080p'): number {
  let score = 0;

  // 1. Health Status Weight (Highest priority)
  if (source.healthStatus === 'healthy') score += 1000;
  else if (source.healthStatus === 'unknown') score += 600;
  else if (source.healthStatus === 'degraded') score += 300;
  else if (source.healthStatus === 'offline') score -= 500;

  // 2. Penalize if failed in current user session
  if (isSourceMarkedFailed(source.id)) {
    score -= 2000;
  }

  // 3. Default Source flag
  if (source.isDefault) score += 200;

  // 4. Quality Matching
  const quality = (source.quality || '').toLowerCase();
  const pref = preferredQuality.toLowerCase();
  if (quality.includes(pref)) score += 100;
  else if (quality.includes('1080p') || quality.includes('adaptive')) score += 80;
  else if (quality.includes('720p')) score += 50;
  else if (quality.includes('480p')) score += 20;

  // 5. Response Time Bonus (faster is better)
  if (source.responseTimeMs && source.responseTimeMs > 0) {
    const latencyBonus = Math.max(0, 50 - Math.floor(source.responseTimeMs / 50));
    score += latencyBonus;
  }

  return score;
}

/**
 * Select the best available episode source with full fallback prioritization
 */
export async function getBestEpisodeSource(
  animeId: number,
  episodeNumber = 1,
  seasonNumber = 1,
  preferredQuality = '1080p',
  preferredLanguage?: 'sub' | 'dub'
): Promise<BestSourceResult> {
  const normalized = await getEpisodeSources(animeId, episodeNumber, seasonNumber);

  if (normalized.status === 'scheduled') {
    return {
      status: 'unavailable',
      reason: 'EPISODE_NOT_YET_AIRED',
      allSources: [],
      trailer: normalized.trailer,
      officialLinks: normalized.officialLinks,
    };
  }

  if (!normalized.sources || normalized.sources.length === 0) {
    return {
      status: 'unavailable',
      reason: 'NO_VALID_SOURCE',
      allSources: [],
      trailer: normalized.trailer,
      officialLinks: normalized.officialLinks,
    };
  }

  // Filter inactive sources
  let available = normalized.sources.filter((s) => s.isActive);

  // Filter by language if specified
  if (preferredLanguage) {
    const langFiltered = available.filter((s) => {
      const l = (s.language || '').toLowerCase();
      if (preferredLanguage === 'sub') return !l || l.includes('sub') || l.includes('japanese');
      if (preferredLanguage === 'dub') return l.includes('dub') || l.includes('english');
      return true;
    });
    if (langFiltered.length > 0) {
      available = langFiltered;
    }
  }

  if (available.length === 0) {
    return {
      status: 'unavailable',
      reason: 'NO_VALID_SOURCE',
      allSources: normalized.sources,
      trailer: normalized.trailer,
      officialLinks: normalized.officialLinks,
    };
  }

  // Sort by priority score
  const sorted = [...available].sort((a, b) => {
    return getSourceScore(b, preferredQuality) - getSourceScore(a, preferredQuality);
  });

  // Pick top source
  const best = sorted[0];

  // If even the best source is completely offline or marked failed and has negative score
  if (best.healthStatus === 'offline' && isSourceMarkedFailed(best.id)) {
    return {
      status: 'unavailable',
      reason: 'ALL_SOURCES_OFFLINE',
      allSources: normalized.sources,
      trailer: normalized.trailer,
      officialLinks: normalized.officialLinks,
    };
  }

  const fallbackSources = sorted.slice(1);

  return {
    status: 'available',
    source: best,
    allSources: sorted,
    fallbackSources,
  };
}

export const streamingApi = {
  getEpisodeSources,
  getBestEpisodeSource,
  recordSourcePlaybackFailure,
  resetSourcePlaybackFailures,
  isSourceMarkedFailed,
  normalizeStreamingSource,
  isValidStreamUrl,
};

export default streamingApi;
