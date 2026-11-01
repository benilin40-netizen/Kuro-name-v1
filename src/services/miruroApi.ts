/**
 * Miruro TV API Service Client
 * KURO NAMI integration for metadata discovery, anime collections, and stream resolution.
 */

import { AnimeMedia } from '../types/anime.ts';

export interface MiruroTitle {
  english?: string | null;
  romaji: string;
  native?: string | null;
  userPreferred?: string;
}

export interface MiruroCoverImage {
  extraLarge?: string | null;
  large: string;
  medium?: string | null;
  color?: string | null;
}

export interface MiruroAnimeItem {
  id: number;
  idMal?: number | null;
  title: MiruroTitle;
  coverImage: MiruroCoverImage;
  bannerImage?: string | null;
  description?: string;
  format?: string;
  status?: string;
  episodes?: number | null;
  duration?: number;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number;
  favourites?: number;
  genres?: string[];
  tags?: Array<{ id?: number; name: string; rank?: number }>;
  studios?: { nodes: Array<{ id: number; name: string; isAnimationStudio: boolean }> };
  nextAiringEpisode?: { episode: number; airingAt: number; timeUntilAiring: number } | null;
  trailer?: { id: string; site: string; thumbnail?: string } | null;
}

export interface MiruroFilterParams {
  genre?: string;
  tag?: string;
  year?: number;
  season?: string;
  format?: string;
  status?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}

export interface MiruroSuggestion {
  id: number;
  idMal?: number;
  title: string;
  romaji?: string;
  native?: string;
  coverImage?: string;
  format?: string;
  year?: number;
  score?: number;
  episodes?: number;
}

export interface MiruroCharacter {
  id: number;
  name: { full: string; native?: string | null };
  image: { large?: string | null; medium?: string | null };
  role?: string;
  voiceActor?: {
    id: number;
    name: { full: string; native?: string | null };
    image?: { large?: string | null; medium?: string | null };
  } | null;
}

export interface MiruroRelation {
  relationType: string;
  anime: MiruroAnimeItem;
}

export interface MiruroEpisode {
  id: string;
  number: number;
  title: string;
  slug: string;
  description?: string;
  thumbnail?: string;
  isFiller?: boolean;
  providers?: string[];
  sub?: boolean;
  dub?: boolean;
}

export interface MiruroEpisodesResponse {
  anilistId: number;
  totalEpisodes: number;
  providers: string[];
  episodes: MiruroEpisode[];
  source?: string;
}

export interface MiruroStreamSource {
  url: string;
  quality?: string;
  isM3U8?: boolean;
  type?: 'hls' | 'mp4' | 'iframe';
  provider?: string;
}

export interface MiruroSubtitleTrack {
  url: string;
  lang: string;
}

export interface MiruroWatchResponse {
  provider: string;
  anilistId: number;
  episodeNumber: number;
  category: string;
  slug: string;
  sources: MiruroStreamSource[];
  subtitles?: MiruroSubtitleTrack[];
  download?: string;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  source?: string;
}

// Convert Miruro anime item to standard Kuro Nami AnimeMedia
export function mapMiruroToAnimeMedia(item: any): AnimeMedia {
  if (!item) return {} as AnimeMedia;
  const mainTitle =
    item.title?.userPreferred ||
    item.title?.english ||
    item.title?.romaji ||
    (typeof item.title === 'string' ? item.title : 'Untitled Anime');

  return {
    id: item.id,
    idMal: item.idMal || item.id,
    title: {
      english: item.title?.english || mainTitle,
      romaji: item.title?.romaji || mainTitle,
      native: item.title?.native || mainTitle,
    },
    coverImage: {
      extraLarge: item.coverImage?.extraLarge || item.coverImage?.large || item.image,
      large: item.coverImage?.large || item.image || '',
      medium: item.coverImage?.medium || item.coverImage?.large || item.image || '',
      color: item.coverImage?.color || '#f43f5e',
    },
    bannerImage: item.bannerImage || item.coverImage?.extraLarge || item.coverImage?.large || null,
    description: item.description || '',
    format: item.format || 'TV',
    status: item.status || 'RELEASING',
    episodes: item.episodes || null,
    duration: item.duration || 24,
    season: item.season || 'FALL',
    seasonYear: item.seasonYear || item.year || 2026,
    averageScore: item.averageScore || (item.score ? Math.round(item.score * 10) : 85),
    meanScore: item.meanScore || item.averageScore || (item.score ? Math.round(item.score * 10) : 85),
    popularity: item.popularity || 10000,
    favourites: item.favourites || 1000,
    genres: item.genres || ['Action', 'Fantasy'],
    studios: item.studios || {
      nodes: [{ id: 1, name: 'Animation Studio', isAnimationStudio: true }],
    },
    nextAiringEpisode: item.nextAiringEpisode || null,
    trailer: item.trailer || null,
  };
}

// Request Helper
async function requestMiruroApi<T>(path: string): Promise<T> {
  const url = path.startsWith('/api') ? path : `/api/miruro${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Miruro API request failed: HTTP ${res.status} on ${path}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Miruro API returned non-JSON payload from ${path}`);
  }

  return res.json();
}

export const MiruroAPI = {
  // 1. Search anime: GET /search?query={name}&page=1&per_page=20
  async searchAnime(query: string, page = 1, perPage = 20): Promise<{ media: AnimeMedia[]; total?: number }> {
    const data = await requestMiruroApi<any>(
      `/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
    );
    const list = Array.isArray(data)
      ? data
      : data.results || data.media || [];
    return {
      media: list.map(mapMiruroToAnimeMedia),
      total: data.pageInfo?.total || list.length,
    };
  },

  // 2. Autocomplete suggestions: GET /suggestions?query={name}
  async getSuggestions(query: string): Promise<MiruroSuggestion[]> {
    if (!query || !query.trim()) return [];
    const data = await requestMiruroApi<any>(`/suggestions?query=${encodeURIComponent(query.trim())}`);
    const list = Array.isArray(data) ? data : data.suggestions || data.results || [];
    return list.slice(0, 8);
  },

  // 3. Browse and filter: GET /filter
  async filterAnime(params: MiruroFilterParams): Promise<{ media: AnimeMedia[]; total?: number }> {
    const qp = new URLSearchParams();
    if (params.genre) qp.set('genre', params.genre);
    if (params.tag) qp.set('tag', params.tag);
    if (params.year) qp.set('year', String(params.year));
    if (params.season) qp.set('season', params.season);
    if (params.format) qp.set('format', params.format);
    if (params.status) qp.set('status', params.status);
    if (params.sort) qp.set('sort', params.sort);
    if (params.page) qp.set('page', String(params.page));
    if (params.per_page) qp.set('per_page', String(params.per_page));

    const data = await requestMiruroApi<any>(`/filter?${qp.toString()}`);
    const list = Array.isArray(data) ? data : data.results || data.media || [];
    return {
      media: list.map(mapMiruroToAnimeMedia),
      total: data.pageInfo?.total || list.length,
    };
  },

  // 4. Trending anime: GET /trending
  async getTrending(page = 1, perPage = 20): Promise<AnimeMedia[]> {
    const data = await requestMiruroApi<any>(`/trending?page=${page}&per_page=${perPage}`);
    const list = Array.isArray(data) ? data : data.results || data.media || [];
    return list.map(mapMiruroToAnimeMedia);
  },

  // 5. Popular anime: GET /popular
  async getPopular(page = 1, perPage = 20): Promise<AnimeMedia[]> {
    const data = await requestMiruroApi<any>(`/popular?page=${page}&per_page=${perPage}`);
    const list = Array.isArray(data) ? data : data.results || data.media || [];
    return list.map(mapMiruroToAnimeMedia);
  },

  // 6. Upcoming anime: GET /upcoming
  async getUpcoming(page = 1, perPage = 20): Promise<AnimeMedia[]> {
    const data = await requestMiruroApi<any>(`/upcoming?page=${page}&per_page=${perPage}`);
    const list = Array.isArray(data) ? data : data.results || data.media || [];
    return list.map(mapMiruroToAnimeMedia);
  },

  // 7. Recently released / airing anime: GET /recent
  async getRecent(page = 1, perPage = 20): Promise<AnimeMedia[]> {
    const data = await requestMiruroApi<any>(`/recent?page=${page}&per_page=${perPage}`);
    const list = Array.isArray(data) ? data : data.results || data.media || [];
    return list.map(mapMiruroToAnimeMedia);
  },

  // 8. Spotlight anime: GET /spotlight
  async getSpotlight(): Promise<AnimeMedia[]> {
    const data = await requestMiruroApi<any>('/spotlight');
    const list = Array.isArray(data) ? data : data.spotlight || data.results || [];
    return list.map(mapMiruroToAnimeMedia);
  },

  // 9. Airing schedule: GET /schedule
  async getSchedule(date?: string): Promise<any[]> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    const data = await requestMiruroApi<any>(`/schedule${q}`);
    return Array.isArray(data) ? data : data.schedule || data.results || [];
  },

  // 10. Complete anime info: GET /info/{anilist_id}
  async getAnimeInfo(anilistId: number): Promise<any> {
    return requestMiruroApi<any>(`/info/${anilistId}`);
  },

  // 11. Anime characters: GET /anime/{id}/characters
  async getAnimeCharacters(anilistId: number, page = 1, perPage = 20): Promise<{ characters: MiruroCharacter[]; total?: number }> {
    const data = await requestMiruroApi<any>(`/anime/${anilistId}/characters?page=${page}&per_page=${perPage}`);
    const list = Array.isArray(data) ? data : data.characters || data.results || [];
    return {
      characters: list,
      total: data.pageInfo?.total || list.length,
    };
  },

  // 12. Anime relations: GET /anime/{id}/relations
  async getAnimeRelations(anilistId: number): Promise<MiruroRelation[]> {
    const data = await requestMiruroApi<any>(`/anime/${anilistId}/relations`);
    return Array.isArray(data) ? data : data.relations || data.results || [];
  },

  // 13. Anime recommendations: GET /anime/{id}/recommendations
  async getAnimeRecommendations(anilistId: number): Promise<AnimeMedia[]> {
    const data = await requestMiruroApi<any>(`/anime/${anilistId}/recommendations`);
    const list = Array.isArray(data) ? data : data.recommendations || data.results || [];
    return list.map(mapMiruroToAnimeMedia);
  },

  // 14. Episodes list: GET /episodes/{anilistId}
  async getEpisodes(anilistId: number): Promise<MiruroEpisodesResponse> {
    const data = await requestMiruroApi<any>(`/episodes/${anilistId}`);
    return data;
  },

  // 15. Streaming sources: GET /watch/{provider}/{anilistId}/{category}/{slug}
  async getStreamingSources(
    provider: string,
    anilistId: number,
    category: 'sub' | 'dub' | string = 'sub',
    slug: string
  ): Promise<MiruroWatchResponse> {
    const safeProvider = encodeURIComponent(provider || 'gogoanime');
    const safeCat = encodeURIComponent(category || 'sub');
    const safeSlug = encodeURIComponent(slug || 'ep-1');
    return requestMiruroApi<MiruroWatchResponse>(`/watch/${safeProvider}/${anilistId}/${safeCat}/${safeSlug}`);
  },
};

export default MiruroAPI;
