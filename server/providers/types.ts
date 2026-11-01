export type PlaybackType = 'hls' | 'iframe' | 'mp4';

export interface NormalizedPlaybackSource {
  type: 'hls' | 'mp4' | 'iframe';
  url: string;
  quality?: string;
  language?: string;
  subtitles?: Array<{ label?: string; lang?: string; url: string }>;
  id?: string;
  provider?: string;
  title?: string;
  isOfficial?: boolean;
}

export interface PlaybackSource {
  id: string;
  title: string;
  episode: number;
  provider: string;
  type: PlaybackType;
  playbackUrl: string;
  quality?: string;
  language?: string;
  isOfficial?: boolean;
  embedHeaders?: Record<string, string>;
  drm?: {
    type?: string;
    licenseServer?: string;
  };
}

export interface ProviderAnimeMetadata {
  id: string;
  title: string;
  synopsis?: string;
  totalEpisodes?: number;
  status?: string;
  coverImage?: string;
  bannerImage?: string;
  genres?: string[];
}

export interface ProviderEpisode {
  id: string;
  animeId: string;
  episodeNumber: number;
  seasonNumber?: number;
  title: string;
  thumbnail?: string;
  durationSeconds?: number;
  airDate?: string;
  sources?: PlaybackSource[];
}

export interface VideoProviderConfig {
  mode: 'authorized_hls' | 'official_embed' | 'direct_mp4' | 'custom_api' | 'database_only' | 'disabled';
  name: string;
  apiUrl: string;
  apiKey?: string;
  embedTemplateUrl?: string;
  isActive: boolean;
}

export interface VideoProvider {
  readonly name: string;
  readonly mode: string;
  getAnime(animeId: number): Promise<ProviderAnimeMetadata | null>;
  getEpisodes(animeId: number, season?: number): Promise<ProviderEpisode[]>;
  getEpisode(animeId: number, episodeNumber: number, season?: number): Promise<ProviderEpisode | null>;
  getPlaybackSource(
    animeId: number,
    episodeNumber: number,
    season?: number,
    options?: { language?: string; quality?: string }
  ): Promise<PlaybackSource | null>;
}
