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
  }) => string | null;
}

export const STREAMING_PROVIDERS_REGISTRY: StreamingProviderConfig[] = [
  // 1. VidLink (Recommended)
  {
    id: 'vidlink',
    name: 'VidLink',
    enabled: true,
    requiredIdType: 'any',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://vidlink.pro'],
    badge: 'Recommended',
    notes: 'Primary high-speed stream player (Supports TMDB & MAL IDs)',
    buildUrl: ({ malId, tmdbId, episodeNumber, language, season = 1, isMovie }) => {
      if (tmdbId) {
        if (isMovie) return `https://vidlink.pro/movie/${tmdbId}`;
        return `https://vidlink.pro/tv/${tmdbId}/${season}/${episodeNumber}`;
      }
      if (malId && malId > 0) {
        const lang = language === 'dub' ? 'dub' : 'sub';
        return `https://vidlink.pro/anime/${malId}/${episodeNumber}/${lang}`;
      }
      return null;
    },
  },

  // 2. VidLink 2
  {
    id: 'vidlink2',
    name: 'VidLink 2',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://vidlink.pro'],
    badge: 'Embed Pro',
    notes: 'Secondary VidLink embed player (Supports Movies & Series by TMDB ID)',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://vidlink.pro/embed/movie/${tmdbId}`;
      return `https://vidlink.pro/embed/tv/${tmdbId}/${season}/${episodeNumber}`;
    },
  },

  // 3. SuperEmbed
  {
    id: 'superembed',
    name: 'SuperEmbed',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://multiembed.mov', 'https://superembed.stream', 'https://seapi.link'],
    badge: 'MultiEmbed',
    notes: 'Multi-host streaming embed player with auto-backup servers',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
      return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episodeNumber}`;
    },
  },

  // 4. VidSrc 5 (Recommended)
  {
    id: 'vidsrc5',
    name: 'VidSrc 5',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://vidsrc.cc', 'https://vidsrc.pro', 'https://vidsrc.vip', 'https://vidsrc.me', 'https://vidsrc.xyz'],
    badge: 'Recommended',
    notes: 'VidSrc v2/v5 high quality stream cluster',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
      return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episodeNumber}`;
    },
  },

  // 5. VidSrc 2
  {
    id: 'vidsrc2',
    name: 'VidSrc 2',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://vidsrc2.to'],
    badge: 'VidSrc.to',
    notes: 'VidSrc2 direct embed player',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://vidsrc2.to/embed/movie/${tmdbId}`;
      return `https://vidsrc2.to/embed/tv/${tmdbId}/${season}/${episodeNumber}`;
    },
  },

  // 6. AutoEmbed 1
  {
    id: 'autoembed1',
    name: 'AutoEmbed 1',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['https://player.autoembed.cc'],
    badge: 'Player CC',
    notes: 'Fast AutoEmbed player endpoint 1',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://player.autoembed.cc/embed/movie/${tmdbId}`;
      return `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episodeNumber}`;
    },
  },

  // 7. AutoEmbed 2
  {
    id: 'autoembed2',
    name: 'AutoEmbed 2',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://autoembed.co'],
    badge: 'AutoEmbed.co',
    notes: 'Alternative AutoEmbed endpoint 2',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://autoembed.co/movie/tmdb/${tmdbId}`;
      return `https://autoembed.co/tv/tmdb/${tmdbId}-${season}-${episodeNumber}`;
    },
  },

  // 8. 2embed.cc
  {
    id: 'twoembed',
    name: '2embed.cc',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://www.2embed.cc'],
    badge: '2embed',
    notes: '2embed stream engine',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://www.2embed.cc/embed/${tmdbId}`;
      return `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episodeNumber}`;
    },
  },

  // 9. MoviesAPI
  {
    id: 'moviesapi',
    name: 'MoviesAPI',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://moviesapi.club'],
    badge: 'Club',
    notes: 'MoviesAPI.club stream player',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://moviesapi.club/movie/${tmdbId}`;
      return `https://moviesapi.club/tv/${tmdbId}-${season}-${episodeNumber}`;
    },
  },

  // 10. FilmKu
  {
    id: 'filmku',
    name: 'FilmKu',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://filmku.stream', 'https://filmku.org'],
    badge: 'Stream',
    notes: 'FilmKu player embed',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://filmku.stream/movie/${tmdbId}`;
      return `https://filmku.stream/tv/${tmdbId}/${season}/${episodeNumber}`;
    },
  },

  // 11. NontonGo
  {
    id: 'nontongo',
    name: 'NontonGo',
    enabled: true,
    requiredIdType: 'any',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://nontongo.win', 'https://www.nontongo.win'],
    badge: 'AniList/TMDB',
    notes: 'NontonGo anime & Asian media player',
    buildUrl: ({ anilistId, tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (anilistId && !isMovie) {
        return `https://nontongo.win/anime/${anilistId}/${episodeNumber}/play`;
      }
      if (tmdbId) {
        if (isMovie) return `https://www.nontongo.win/embed/movie/${tmdbId}`;
        return `https://www.nontongo.win/embed/tv/${tmdbId}/${season}/${episodeNumber}`;
      }
      return null;
    },
  },

  // 12. <Embed> (Custom Embed)
  {
    id: 'custom_embed',
    name: '<Embed>',
    enabled: true,
    requiredIdType: 'custom',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['*'],
    badge: 'Custom Frame',
    notes: 'Custom user or administrator defined iframe player',
    buildUrl: ({ customEmbedUrl }) => {
      if (customEmbedUrl && (customEmbedUrl.startsWith('http://') || customEmbedUrl.startsWith('https://'))) {
        return customEmbedUrl;
      }
      return null;
    },
  },

  // 13. embed.smashystream.com
  {
    id: 'smashystream',
    name: 'SmashyStream',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://embed.smashystream.com'],
    badge: 'Smashy',
    notes: 'SmashyStream player endpoint',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}`;
      return `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${season}&episode=${episodeNumber}`;
    },
  },

  // 14. databasegdriveplayer.xyz
  {
    id: 'databasegdriveplayer',
    name: 'DatabaseGdrivePlayer',
    enabled: true,
    requiredIdType: 'tmdb_id',
    supportedLanguages: ['sub'],
    allowedOrigins: ['https://databasegdriveplayer.xyz'],
    badge: 'GDrivePlayer',
    notes: 'Gdrive Player stream endpoint',
    buildUrl: ({ tmdbId, episodeNumber, season = 1, isMovie }) => {
      if (!tmdbId) return null;
      if (isMovie) return `https://databasegdriveplayer.xyz/player.php?tmdb=${tmdbId}`;
      return `https://databasegdriveplayer.xyz/player.php?type=series&tmdb=${tmdbId}&season=${season}&episode=${episodeNumber}`;
    },
  },

  // 15. AnimePahe via animepahe.pw (Direct HLS/MP4 & Kwik embeds)
  {
    id: 'animepahe',
    name: 'AnimePahe',
    enabled: true,
    requiredIdType: 'anilist_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: [
      'https://animepahe.pw',
      'https://kwik.cx',
      'https://pahe.win',
      'https://animepahe.org',
      'https://animepahe.com',
      'https://coorenlabs-2.onrender.com',
    ],
    badge: 'animepahe.pw',
    notes: 'Official AnimePahe (animepahe.pw) & Kwik stream server',
    buildUrl: () => null,
  },

  // 16. Studio Master
  {
    id: 'configured_master',
    name: 'Studio Master',
    enabled: true,
    requiredIdType: 'anilist_id',
    supportedLanguages: ['sub', 'dub'],
    allowedOrigins: ['*'],
    badge: 'Studio Master',
    notes: 'Administrator configured playback streams',
    buildUrl: () => null,
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
