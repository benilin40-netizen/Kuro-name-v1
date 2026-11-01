import { NormalizedPlaybackSource, PlaybackSource, VideoProviderConfig } from '../types/videoProvider';

/**
 * Normalizes any external provider playback response into standard normalized sources.
 * Supports: single source object, { sources: [...] }, { servers: [...] }, { data: [...] }, or array of sources.
 * Prefers: 1. Authorized HLS, 2. Authorized MP4, 3. Official embed
 */
export function normalizePlaybackResponse(
  response: any
): NormalizedPlaybackSource[] {
  if (!response) return [];

  const rawList: any[] = [];

  if (Array.isArray(response)) {
    rawList.push(...response);
  } else if (Array.isArray(response.sources)) {
    rawList.push(...response.sources);
  } else if (Array.isArray(response.servers)) {
    rawList.push(...response.servers);
  } else if (Array.isArray(response.data)) {
    rawList.push(...response.data);
  } else if (Array.isArray(response.result?.sources)) {
    rawList.push(...response.result.sources);
  } else if (typeof response === 'object') {
    rawList.push(response);
  }

  const normalized: NormalizedPlaybackSource[] = [];

  for (const raw of rawList) {
    if (!raw) continue;
    const url = (raw.playbackUrl || raw.url || raw.sourceUrl || raw.streamUrl || raw.link || raw.embedUrl || '').trim();
    if (!url || typeof url !== 'string') continue;

    // Validate absolute HTTP/HTTPS URL
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//')) {
      continue;
    }

    const rawType = (raw.type || (url.includes('.m3u8') ? 'hls' : url.includes('.mp4') ? 'mp4' : 'iframe')).toLowerCase();
    const type: 'hls' | 'mp4' | 'iframe' =
      rawType === 'hls' || url.includes('.m3u8') || rawType === 'application/x-mpegurl'
        ? 'hls'
        : rawType === 'iframe' || rawType === 'embed'
        ? 'iframe'
        : 'mp4';

    normalized.push({
      id: raw.id ? String(raw.id) : undefined,
      title: raw.title || raw.name || undefined,
      provider: raw.provider || raw.server || 'Authorized Provider',
      type,
      url,
      quality: raw.quality || (type === 'hls' ? 'Adaptive 1080p' : '1080p'),
      language: raw.language || 'Japanese (Sub)',
      subtitles: Array.isArray(raw.subtitles) ? raw.subtitles : undefined,
      isOfficial: raw.isOfficial !== undefined ? !!raw.isOfficial : true,
    });
  }

  // Sort with preference: 1. HLS, 2. MP4, 3. Embed/iframe
  normalized.sort((a, b) => {
    const score = (t: string) => (t === 'hls' ? 3 : t === 'mp4' ? 2 : 1);
    return score(b.type) - score(a.type);
  });

  return normalized;
}

export class VideoProviderService {
  /**
   * Resolve an officially authorized playback source for an episode
   */
  static async getPlaybackSource(
    animeId: number,
    episodeNumber: number,
    season = 1,
    language = 'sub'
  ): Promise<PlaybackSource | null> {
    console.log(`[VIDEO PROVIDER] Anime ID: ${animeId}`);
    console.log(`[VIDEO PROVIDER] Episode ID: ${episodeNumber}`);

    if (!animeId || animeId <= 0 || !episodeNumber || episodeNumber <= 0) {
      console.warn('[VIDEO PROVIDER] Invalid episode identifier');
      return null;
    }

    const requestUrl = `/api/provider/playback/${animeId}/${episodeNumber}?season=${season}&language=${encodeURIComponent(language)}`;
    console.log(`[VIDEO PROVIDER] Provider request: ${requestUrl}`);

    try {
      const res = await fetch(requestUrl);
      console.log(`[VIDEO PROVIDER] Provider response status: ${res.status}`);

      if (!res.ok) {
        if (res.status === 404) {
          console.warn('[VIDEO PROVIDER] Provider returned no playback sources');
        } else {
          console.error(`[VIDEO PROVIDER] Provider request failed with status HTTP ${res.status}`);
        }
        return null;
      }

      const rawData = await res.json();
      console.log('[VIDEO PROVIDER] Provider response:', rawData);

      const normalizedList = normalizePlaybackResponse(rawData);
      console.log(`[VIDEO PROVIDER] Extracted sources: ${normalizedList.length}`);

      if (normalizedList.length === 0) {
        console.warn('[VIDEO PROVIDER] Provider returned no playback sources');
        return null;
      }

      const selected = normalizedList[0];
      console.log(`[VIDEO PROVIDER] Selected source: ${selected.title || selected.provider}`);
      console.log(`[VIDEO PROVIDER] Source type: ${selected.type}`);
      console.log(`[VIDEO PROVIDER] Playback source received: ${selected.provider} [${selected.type.toUpperCase()}]`);

      return {
        id: selected.id || rawData.id || `prov_${animeId}_s${season}_e${episodeNumber}`,
        title: selected.title || rawData.title || `Episode ${episodeNumber}`,
        episode: episodeNumber,
        provider: selected.provider || rawData.provider || 'Authorized Provider',
        type: selected.type,
        playbackUrl: selected.url,
        quality: selected.quality || '1080p',
        language: selected.language || (language === 'dub' ? 'English (Dub)' : 'Japanese (Sub)'),
        isOfficial: true,
      };
    } catch (err: any) {
      console.error('[VIDEO PROVIDER] Provider request failed:', err.message);
      return null;
    }
  }

  /**
   * Resolve all available servers/sources for an episode
   */
  static async getPlaybackSources(
    animeId: number,
    episodeNumber: number,
    season = 1,
    language = 'sub'
  ): Promise<PlaybackSource[]> {
    if (!animeId || animeId <= 0 || !episodeNumber || episodeNumber <= 0) {
      console.warn('[VIDEO PROVIDER] Invalid episode identifier');
      return [];
    }

    try {
      const res = await fetch(
        `/api/provider/sources/${animeId}/${episodeNumber}?season=${season}&language=${encodeURIComponent(language)}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      const normalized = normalizePlaybackResponse(data);
      return normalized.map((s, idx) => ({
        id: s.id || `src_${animeId}_s${season}_e${episodeNumber}_${idx + 1}`,
        title: s.title || `Episode ${episodeNumber} (Server ${idx + 1})`,
        episode: episodeNumber,
        provider: s.provider || `Server ${idx + 1}`,
        type: s.type,
        playbackUrl: s.url,
        quality: s.quality || '1080p',
        language: s.language || (language === 'dub' ? 'English (Dub)' : 'Japanese (Sub)'),
        isOfficial: true,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get current video provider admin configuration (Admin only)
   */
  static async getProviderConfig(token?: string): Promise<VideoProviderConfig> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/provider/config', { headers });
    if (!res.ok) {
      throw new Error(`Failed to load provider config (HTTP ${res.status})`);
    }
    return res.json();
  }

  /**
   * Save video provider configuration (Admin only)
   */
  static async updateProviderConfig(config: Partial<VideoProviderConfig>, token?: string): Promise<VideoProviderConfig> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/provider/config', {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update provider config' }));
      throw new Error(err.error || 'Failed to update provider config');
    }
    return res.json();
  }
}
