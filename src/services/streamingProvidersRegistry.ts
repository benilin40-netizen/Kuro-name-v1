import { getAniEmbedUrl } from './aniembedService.ts';

/**
 * Central Streaming Provider Registry for KURO NAMI
 * 
 * Defines authorized streaming provider configurations, identifier requirements,
 * URL builders, and allowed embed origins for all 14 requested free stream servers.
 */

export type IdentifierType = 'mal_id' | 'anilist_id' | 'tmdb_id' | 'imdb_id' | 'custom' | 'any';
export type AudioLanguage = 'sub' | 'dub';

export interface StreamingProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  requiredIdType: IdentifierType;
  supportedLanguages: AudioLanguage[];
  allowedOrigins: string[];
  notes?: string;
  disabledReason?: string;
  badge?: string;
  buildUrl: (params: {
    malId?: number | null;
    anilistId?: number | null;
    tmdbId?: number | string | null;
    episodeNumber: number;
    language: AudioLanguage;
    season?: number;
    isMovie?: boolean;
    customEmbedUrl?: string;
    autoplay?: boolean;
    startTime?: number;
  }) => string | null;
}

export const STREAMING_PROVIDERS_REGISTRY: StreamingProviderConfig[] = [
  // 0. AniEmbed (Primary Official Player)
  {
    id: 'aniembed',
    name: 'AniEmbed',
    enabled: true,
    requiredIdType: 'anilist_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://aniembed.se'],
    badge: 'Primary',
    notes: 'AniEmbed official streaming player (https://aniembed.se/)',
    buildUrl: ({ anilistId, episodeNumber, language, autoplay = true, startTime = 0 }) => {
      if (!anilistId || Number(anilistId) <= 0) return null;
      const lang = language === 'dub' ? 'dub' : 'sub';
      return getAniEmbedUrl({
        anilistId: Number(anilistId),
        episode: Number(episodeNumber || 1),
        lang,
        autoplay,
        startTime,
      });
    },
  },

  // 1. Ani MegaPlay
  {
    id: 'animegaplay',
    name: 'Ani MegaPlay',
    enabled: true,
    requiredIdType: 'anilist_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://ani.megaplay.su'],
    badge: 'MegaPlay',
    notes: 'Ani MegaPlay streaming player (https://ani.megaplay.su/)',
    buildUrl: ({ anilistId, episodeNumber, language }) => {
      if (!anilistId) return null;
      const lang = language === 'dub' ? 'dub' : 'sub';
      return `https://ani.megaplay.su/embed/${anilistId}/${episodeNumber}/${lang}`;
    },
  },

  // 2. Miruro Stream Engine
  {
    id: 'miruro',
    name: 'Miruro HLS',
    enabled: true,
    requiredIdType: 'anilist_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://mirurotvapi.vercel.app', 'https://miruro.tv', 'https://vidlink.pro'],
    badge: 'Miruro',
    notes: 'Primary MiruroTVAPI streaming engine',
    buildUrl: ({ anilistId, episodeNumber, language }) => {
      if (!anilistId) return null;
      const cat = language === 'dub' ? 'dub' : 'sub';
      return `/api/miruro/watch/gogoanime/${anilistId}/${cat}/ep-${episodeNumber}`;
    },
  },

  // 3. VidLink
  {
    id: 'vidlink',
    name: 'VidLink',
    enabled: true,
    requiredIdType: 'any',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://vidlink.pro'],
    badge: 'VidLink',
    notes: 'VidLink stream engine (Supports TMDB & MAL IDs)',
    buildUrl: ({ malId, anilistId, tmdbId, episodeNumber, language, season = 1, isMovie }) => {
      if (tmdbId) {
        if (isMovie) return `https://vidlink.pro/movie/${tmdbId}`;
        return `https://vidlink.pro/tv/${tmdbId}/${season}/${episodeNumber}`;
      }
      if (anilistId && Number(anilistId) > 0) {
        const lang = language === 'dub' ? 'dub' : 'sub';
        return `https://vidlink.pro/anime/${anilistId}/${episodeNumber}/${lang}`;
      }
      if (malId && Number(malId) > 0) {
        const lang = language === 'dub' ? 'dub' : 'sub';
        return `https://vidlink.pro/anime/${malId}/${episodeNumber}/${lang}`;
      }
      return null;
    },
  },

  // 4. VidSrc 5
  {
    id: 'vidsrc5',
    name: 'VidSrc 5',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://vidsrc.cc', 'https://vidsrc.pro', 'https://vidsrc.vip', 'https://vidsrc.me'],
    badge: 'VidSrc',
    notes: 'VidSrc v2/v5 stream cluster',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
      return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episodeNumber}`;
    },
  },

  // 5. AnimePahe via CoorenLabs
  {
    id: 'animepahe',
    name: 'AnimePahe',
    enabled: true,
    requiredIdType: 'anilist_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://animepahe.pw', 'https://kwik.cx', 'https://pahe.win'],
    badge: 'AnimePahe',
    notes: 'Official AnimePahe (animepahe.pw) stream server',
    buildUrl: () => null,
  },

  // 6. Studio Master / VCDN / media.cm
  {
    id: 'configured_master',
    name: 'Studio Master',
    enabled: true,
    requiredIdType: 'anilist_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['*'],
    badge: 'VCDN / media.cm',
    notes: 'Licensed playback streams configured by administrators',
    buildUrl: () => null,
  },

  // 7. Custom Frame
  {
    id: 'custom_embed',
    name: '<Embed>',
    enabled: true,
    requiredIdType: 'custom',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['*'],
    badge: 'Custom',
    notes: 'Custom direct iframe embed player',
    buildUrl: ({ customEmbedUrl }) => {
      if (customEmbedUrl && (customEmbedUrl.startsWith('http://') || customEmbedUrl.startsWith('https://'))) {
        return customEmbedUrl;
      }
      return null;
    },
  },
];

export function getEnabledProviders(): StreamingProviderConfig[] {
  return STREAMING_PROVIDERS_REGISTRY.filter((p) => p.enabled);
}

export function getProviderById(id: string): StreamingProviderConfig | undefined {
  return STREAMING_PROVIDERS_REGISTRY.find((p) => p.id === id);
}

export function isAllowedEmbedOrigin(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    for (const provider of STREAMING_PROVIDERS_REGISTRY) {
      if (provider.id === 'custom_embed' || provider.id === 'configured_master') continue;
      if (provider.allowedOrigins.some(o => {
        try {
          const allowedParsed = new URL(o);
          return origin === allowedParsed.origin || origin.endsWith('.' + allowedParsed.hostname);
        } catch {
          return origin === o;
        }
      })) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
