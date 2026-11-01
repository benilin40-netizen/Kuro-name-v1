export interface AnimeTitle {
  romaji: string;
  english: string | null;
  native: string | null;
}

export interface CoverImage {
  extraLarge: string;
  large: string;
  medium: string;
  color: string | null;
}

export interface StudioNode {
  id: number;
  name: string;
}

export interface NextAiringEpisode {
  id: number;
  airingAt: number; // Unix timestamp in seconds
  timeUntilAiring: number; // Seconds
  episode: number;
}

export interface Trailer {
  id: string;
  site: string;
  thumbnail?: string;
}

export interface NormalizedAnimeIDs {
  anidb?: string;
  mal?: number;
  kitsu?: string;
  ann?: string;
  anilist?: number;
}

export interface AnimeExternalIds {
  anilistId: number | null;
  malId: number | null;
  kitsuId: string | null;
  tmdbId: number | null;
}

export interface TraceMoeResultItem {
  anilist: number | { id: number; title: { romaji: string; english: string | null; native: string | null }; coverImage: { large: string } };
  filename: string;
  episode: number | string | null;
  from: number;
  to: number;
  similarity: number;
  video: string;
  image: string;
}

export interface ApiIntegrationStatus {
  name: string;
  endpoint: string;
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  latencyMs: number;
  lastSuccess: string | null;
  lastError: string | null;
  requestCount: number;
  failedCount: number;
}

export interface AnimeMedia {
  id: number;
  idMal?: number | null;
  externalIds?: AnimeExternalIds;
  ids?: NormalizedAnimeIDs;
  title: AnimeTitle;
  description: string | null;
  bannerImage: string | null;
  coverImage: CoverImage;
  format: string; // TV, MOVIE, OVA, ONA, SPECIAL
  status: string; // RELEASING, FINISHED, NOT_YET_RELEASED, CANCELLED
  episodes: number | null;
  duration: number | null;
  season: string | null; // WINTER, SPRING, SUMMER, FALL
  seasonYear: number | null;
  averageScore: number | null;
  meanScore: number | null;
  popularity: number;
  favourites?: number;
  genres: string[];
  synonyms?: string[];
  studios?: {
    nodes: StudioNode[];
  };
  nextAiringEpisode?: NextAiringEpisode | null;
  trailer?: Trailer | null;
  source?: string;
  hashtag?: string;
  startDate?: { year: number; month: number; day: number };
  endDate?: { year: number; month: number; day: number };
  characters?: {
    edges: {
      role: string;
      node: {
        id: number;
        name: { full: string; native?: string };
        image: { large: string; medium: string };
      };
      voiceActors: {
        id: number;
        name: { full: string; native?: string };
        image: { medium: string };
        languageV2: string;
      }[];
    }[];
  };
  staff?: {
    edges: {
      role: string;
      node: {
        id: number;
        name: { full: string };
        image: { medium: string };
      };
    }[];
  };
  relations?: {
    edges: {
      relationType: string;
      node: {
        id: number;
        title: { romaji: string; english: string | null };
        format: string;
        status: string;
        coverImage: { medium: string; large: string };
      };
    }[];
  };
  recommendations?: {
    nodes: {
      id: number;
      rating: number;
      mediaRecommendation: {
        id: number;
        title: { romaji: string; english: string | null };
        format: string;
        coverImage: { large: string; medium: string };
        averageScore: number | null;
      };
    }[];
  };
}

export interface PageInfo {
  total?: number;
  perPage?: number;
  currentPage?: number;
  lastPage?: number;
  hasNextPage: boolean;
}

export interface AniListMediaResponse {
  media: AnimeMedia[];
  pageInfo?: PageInfo;
}

export interface SeasonalAnimeResponse {
  media: AnimeMedia[];
  season: string;
  year: number;
  pageInfo?: PageInfo;
}

export interface AiringScheduleItem {
  id: number;
  airingAt: number;
  episode: number;
  timeUntilAiring: number;
  media: AnimeMedia;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  source: string;
  url: string;
  source_url?: string;
  author?: string;
  image_url: string;
  category: string;
  anime_id?: number | null;
  anime_title?: string | null;
  published_at: string;
  fetched_at?: string;
  is_featured?: number;
  is_hidden?: number;
  is_admin_post?: number;
}

export type SourceHealthStatus = 'healthy' | 'degraded' | 'offline' | 'unknown';

export interface VideoSource {
  id: string;
  episode_id: number;
  anime_id: number;
  provider: string;
  title: string;
  url: string;
  type: 'mp4' | 'hls' | 'embed';
  quality?: string;
  language?: string;
  is_active: number | boolean;
  notes?: string;
  season_number?: number;
  is_default?: number | boolean;
  status?: string;
  health_status?: SourceHealthStatus;
  last_checked?: string | null;
  last_successful_check?: string | null;
  response_time_ms?: number | null;
  failure_count?: number;
  http_status?: number | null;
  created_at: string;
  updated_at?: string;
}

export type WatchlistStatus = 'WATCHING' | 'COMPLETED' | 'PLANNED' | 'ON_HOLD' | 'DROPPED';

export interface WatchlistItem {
  id: string;
  user_id: string;
  anime_id: number;
  status: WatchlistStatus;
  progress_episodes: number;
  score: number;
  notes: string;
  updated_at: string;
  anime?: AnimeMedia;
}

export interface WatchHistoryItem {
  id: string;
  user_id: string;
  anime_id: number;
  episode_number: number;
  progress_seconds: number;
  duration_seconds: number;
  watched_at: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  is_admin: number;
  created_at: string;
}

export interface UserProfile {
  bio: string;
  favourite_genres: string[];
  banner: string;
}

export interface UserProfileData {
  user: User;
  profile: UserProfile;
  stats: {
    anime_watched: number;
    episodes_watched: number;
    currently_watching: number;
    plan_to_watch: number;
    completed: number;
    total_anime: number;
  };
  favourites: { anime_id: number; created_at: string }[];
}

export interface Subtitle {
  url: string;
  lang: string;
  label: string;
}

export interface StreamingSource {
  id: string;
  animeId: number;
  episodeNumber: number;
  seasonNumber?: number;
  provider: string;
  sourceUrl: string;
  url: string; // compatibility alias for sourceUrl
  type: 'video/mp4' | 'application/x-mpegURL' | 'embed' | 'hls' | 'mp4';
  quality: string;
  server?: string; // compatibility alias for provider
  subtitles?: Subtitle[];
  language: string;
  isActive: boolean;
  isDefault?: boolean;
  lastChecked?: string | null;
  lastSuccessfulCheck?: string | null;
  healthStatus: SourceHealthStatus;
  responseTimeMs?: number | null;
  failureCount?: number;
  httpStatus?: number | null;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type BestSourceResult =
  | {
      status: 'available';
      source: StreamingSource;
      allSources: StreamingSource[];
      fallbackSources: StreamingSource[];
    }
  | {
      status: 'unavailable';
      reason: 'NO_VALID_SOURCE' | 'ALL_SOURCES_OFFLINE' | 'EPISODE_NOT_YET_AIRED';
      allSources: StreamingSource[];
      trailer?: Trailer | null;
      officialLinks?: Array<{ site: string; url: string }>;
    };

export interface StreamingProvider {
  id: string;
  name: string;
  isOfficial: boolean;
  requiresAuth?: boolean;
}

export interface NormalizedEpisodeSources {
  animeId: number;
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
  status: 'available' | 'unavailable' | 'scheduled';
  sources: StreamingSource[];
  subtitles: Subtitle[];
  trailer?: Trailer | null;
  officialLinks?: Array<{ site: string; url: string }>;
  provider: string;
  airDate?: string;
}

export interface SearchFilterState {
  query?: string;
  genre?: string;
  format?: string;
  status?: string;
  year?: number;
  season?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}
