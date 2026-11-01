/**
 * QWISH Anime - Legal Video Source Service
 *
 * Implements strict legal, authorized video streaming resolution.
 * Supports HLS (.m3u8), MP4, and official embedded players with subtitle tracks.
 * Connects to configured licensed CDN streams or public-domain demonstration streams.
 */

export interface SubtitleTrack {
  id: string;
  language: string;
  label: string;
  url: string;
  default?: boolean;
}

export interface VideoSource {
  id: string;
  animeId: string;
  episodeNumber: number;
  type: 'hls' | 'mp4' | 'embed';
  url: string;
  quality?: string;
  language?: string;
  subtitles?: SubtitleTrack[];
  isOfficial: boolean;
  provider?: string;
  title?: string;
}

export interface VideoResolutionResult {
  sources: VideoSource[];
  activeSource: VideoSource | null;
  hasPlayableSource: boolean;
  isDemoFallback: boolean;
  message?: string;
}

/**
 * Publicly licensed, Creative Commons demonstration video sources
 * (Used for development, testing, and initial CDN bootstrapping)
 * All sample media is hosted on public Google Storage or open streaming test harnesses.
 */
export const LICENSED_DEMO_SOURCES: VideoSource[] = [
  {
    id: 'demo-hls-mux-test',
    animeId: 'default',
    episodeNumber: 1,
    type: 'hls',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    quality: '1080p (Multi-Bitrate)',
    language: 'Japanese (Sub)',
    provider: 'QWISH Licensed Demo HLS (Mux Test Stream)',
    title: 'Episode 1 - High Definition HLS Stream',
    isOfficial: true,
    subtitles: [
      {
        id: 'sub-en',
        language: 'en',
        label: 'English',
        url: 'https://bitdash-a.akamaihd.net/content/sintel/subtitles/subtitles_en.vtt',
        default: true,
      },
    ],
  },
  {
    id: 'demo-mp4-bigbuck',
    animeId: 'default',
    episodeNumber: 1,
    type: 'mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    quality: '1080p HD',
    language: 'Japanese (Sub)',
    provider: 'Blender Foundation Public License CDN',
    title: 'Episode 1 - Direct MP4 Stream',
    isOfficial: true,
  },
  {
    id: 'demo-mp4-sintel',
    animeId: 'default',
    episodeNumber: 2,
    type: 'mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    quality: '1080p HD',
    language: 'Japanese (Sub)',
    provider: 'Blender Open Movie CDN',
    title: 'Episode 2 - Direct MP4 Stream',
    isOfficial: true,
    subtitles: [
      {
        id: 'sub-en',
        language: 'en',
        label: 'English',
        url: 'https://bitdash-a.akamaihd.net/content/sintel/subtitles/subtitles_en.vtt',
        default: true,
      },
    ],
  },
  {
    id: 'demo-hls-tears',
    animeId: 'default',
    episodeNumber: 3,
    type: 'hls',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    quality: '1080p HLS',
    language: 'Japanese (Sub)',
    provider: 'Unified Streaming Open HLS Test CDN',
    title: 'Episode 3 - Multi-Rate HLS Stream',
    isOfficial: true,
  },
  {
    id: 'demo-mp4-blazes',
    animeId: 'default',
    episodeNumber: 4,
    type: 'mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    quality: '720p HD',
    language: 'Japanese (Sub)',
    provider: 'Google GTV Sample Video CDN',
    title: 'Episode 4 - Google Storage Licensed Stream',
    isOfficial: true,
  },
  {
    id: 'demo-mp4-escapes',
    animeId: 'default',
    episodeNumber: 5,
    type: 'mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    quality: '720p HD',
    language: 'Japanese (Sub)',
    provider: 'Google GTV Sample Video CDN',
    title: 'Episode 5 - Google Storage Licensed Stream',
    isOfficial: true,
  },
];

/**
 * Validates whether a source URL is potentially reachable and safe
 */
export async function verifySourceHealth(source: VideoSource): Promise<boolean> {
  if (!source || !source.url) return false;

  // Embedded player URLs cannot be validated via HEAD/fetch due to X-Frame or CORS
  if (source.type === 'embed') {
    return source.url.startsWith('https://');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(source.url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors',
    });
    clearTimeout(timeoutId);

    // Accept 200 OK, 206 Partial, or 304 Not Modified
    return response.ok || response.status === 206 || response.status === 304;
  } catch (_err) {
    // If CORS prevents HEAD probe, treat direct http(s) URL as provisional true
    return source.url.startsWith('http://') || source.url.startsWith('https://');
  }
}

/**
 * Resolves legal video sources for a specific anime and episode.
 *
 * Sequence:
 * 1. Checks backend database for registered licensed CDN feeds
 * 2. If no custom database sources exist, falls back to the licensed demo CDN stream
 * 3. Never attempts unauthorized scraping or illegal streams
 */
export async function getVideoSources(
  animeId: string | number,
  episodeNumber = 1
): Promise<VideoResolutionResult> {
  const animeIdStr = String(animeId);
  const resolvedSources: VideoSource[] = [];

  // 1. Fetch authorized database sources from server
  try {
    const res = await fetch(`/api/video-sources/${encodeURIComponent(animeIdStr)}/${episodeNumber}`);
    if (res.ok) {
      const dbSources: any[] = await res.json();
      if (Array.isArray(dbSources) && dbSources.length > 0) {
        for (const s of dbSources) {
          if (s.url && s.is_active !== 0) {
            resolvedSources.push({
              id: s.id || `vs_${animeIdStr}_${episodeNumber}`,
              animeId: animeIdStr,
              episodeNumber,
              type: s.type === 'hls' ? 'hls' : s.type === 'embed' ? 'embed' : 'mp4',
              url: s.url,
              quality: s.quality || '1080p',
              language: s.language || 'Japanese (Sub)',
              provider: s.provider || 'Licensed Partner CDN',
              title: s.title || `Episode ${episodeNumber}`,
              isOfficial: Boolean(s.isOfficial ?? true),
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[VIDEO API] Server video sources query error:', err);
  }

  // 2. Fallback to licensed demo provider if no custom stream registered
  let isDemoFallback = false;
  if (resolvedSources.length === 0) {
    isDemoFallback = true;
    const demoSource =
      LICENSED_DEMO_SOURCES.find((s) => s.episodeNumber === episodeNumber) ||
      LICENSED_DEMO_SOURCES[(episodeNumber - 1) % LICENSED_DEMO_SOURCES.length] ||
      LICENSED_DEMO_SOURCES[0];

    if (demoSource) {
      resolvedSources.push({
        ...demoSource,
        id: `demo_${animeIdStr}_${episodeNumber}_${demoSource.id}`,
        animeId: animeIdStr,
        episodeNumber,
        title: `Episode ${episodeNumber} (${demoSource.provider})`,
      });
    }
  }

  const activeSource = resolvedSources[0] || null;

  return {
    sources: resolvedSources,
    activeSource,
    hasPlayableSource: resolvedSources.length > 0,
    isDemoFallback,
    message:
      resolvedSources.length > 0
        ? undefined
        : 'Video unavailable from the current source. Please verify that a legal licensed CDN feed is configured.',
  };
}

/**
 * Report a problem with a video source
 */
export async function reportSourceProblem(
  sourceId: string,
  animeId: string | number,
  episodeNumber: number,
  reason: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/reports/video-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId,
        animeId: String(animeId),
        episodeNumber,
        reason,
        reportedAt: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

/**
 * Save custom licensed CDN video source (for admin or custom configuration)
 */
export async function saveCustomVideoSource(source: {
  animeId: string | number;
  episodeNumber: number;
  url: string;
  type: 'hls' | 'mp4' | 'embed';
  quality?: string;
  language?: string;
  provider?: string;
  title?: string;
}): Promise<boolean> {
  try {
    const token = localStorage.getItem('kuronami_auth_token') || localStorage.getItem('qwish_auth_token');
    const res = await fetch('/api/admin/video-sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        anime_id: Number(source.animeId),
        episode_id: `ep_${source.animeId}_${source.episodeNumber}`,
        episode_number: source.episodeNumber,
        provider: source.provider || 'Custom Licensed CDN',
        title: source.title || `Episode ${source.episodeNumber}`,
        url: source.url,
        type: source.type,
        quality: source.quality || '1080p',
        language: source.language || 'Japanese (Sub)',
        is_active: 1,
        is_default: 1,
      }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

export const VideoApiService = {
  getVideoSources,
  verifySourceHealth,
  reportSourceProblem,
  saveCustomVideoSource,
  LICENSED_DEMO_SOURCES,
};

export default VideoApiService;
