import { NormalizedAnimeIDs, AnimeMedia } from '../../types/anime.ts';

export interface AniDBAnime {
  id: string;
  ids: NormalizedAnimeIDs;
  title: string;
  alternativeTitles?: string[];
  type?: string;
  year?: number;
  episodes?: number;
  status?: string;
  synopsis?: string;
  genres?: string[];
  tags?: string[];
  creators?: string[];
  crossReferences?: {
    mal?: number;
    kitsu?: string;
    ann?: string;
    anilist?: number;
  };
}

export interface AniDBProvider {
  isConfigured: boolean;
  search(query: string): Promise<AniDBAnime[]>;
  getAnime(id: string): Promise<AniDBAnime | null>;
}

/**
 * Default AniDB Provider implementation following strict compliance rules.
 *
 * Checks if an authorized backend endpoint/client is available.
 * If not configured, gracefully falls back without scraping or bypassing rate limits.
 */
export class DefaultAniDBProvider implements AniDBProvider {
  public isConfigured: boolean = false;

  constructor() {
    // Determine if supported backend API integration is present
    if (typeof process !== 'undefined' && process.env && process.env.ANIDB_CLIENT_NAME && process.env.ANIDB_CLIENT_VER) {
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      if (typeof console !== 'undefined' && (process.env.NODE_ENV !== 'production')) {
        console.log('AniDB: unavailable — using fallback metadata providers');
      }
    }
  }

  /**
   * Search AniDB metadata (Only if authorized backend integration configured)
   */
  async search(query: string): Promise<AniDBAnime[]> {
    if (!query || !this.isConfigured) {
      return [];
    }

    try {
      const res = await fetch(`/api/anime/anidb/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    } catch (_err) {
      return [];
    }
  }

  /**
   * Fetch AniDB anime by ID (Only if authorized backend integration configured)
   */
  async getAnime(id: string): Promise<AniDBAnime | null> {
    if (!id || !this.isConfigured) {
      return null;
    }

    try {
      const res = await fetch(`/api/anime/anidb/${id}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (_err) {
      return null;
    }
  }
}

export const aniDBProvider: AniDBProvider = new DefaultAniDBProvider();

/**
 * Utility to build normalized ID structure from provider data
 */
export function buildNormalizedIDs(params: {
  anidb?: string | number;
  mal?: number;
  kitsu?: string;
  ann?: string;
  anilist?: number;
}): NormalizedAnimeIDs {
  return {
    anidb: params.anidb ? String(params.anidb) : undefined,
    mal: params.mal ? Number(params.mal) : undefined,
    kitsu: params.kitsu ? String(params.kitsu) : undefined,
    ann: params.ann ? String(params.ann) : undefined,
    anilist: params.anilist ? Number(params.anilist) : undefined,
  };
}

/**
 * Maps AniDBAnime to common AnimeMedia format
 */
export function mapAniDBToAnimeMedia(item: AniDBAnime): AnimeMedia {
  const numId = parseInt(item.id, 10) || Math.abs(item.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));

  return {
    id: numId,
    idMal: item.crossReferences?.mal || item.ids?.mal || null,
    ids: {
      anidb: item.id,
      mal: item.crossReferences?.mal || item.ids?.mal,
      kitsu: item.crossReferences?.kitsu || item.ids?.kitsu,
      ann: item.crossReferences?.ann || item.ids?.ann,
      anilist: item.crossReferences?.anilist || item.ids?.anilist,
    },
    title: {
      romaji: item.title,
      english: item.alternativeTitles?.[0] || item.title,
      native: null,
    },
    description: item.synopsis || null,
    bannerImage: null,
    coverImage: {
      extraLarge: '',
      large: '',
      medium: '',
      color: null,
    },
    format: item.type ? item.type.toUpperCase() : 'TV',
    status: item.status ? item.status.toUpperCase() : 'FINISHED',
    episodes: item.episodes || null,
    duration: null,
    season: null,
    seasonYear: item.year || null,
    averageScore: null,
    meanScore: null,
    popularity: 0,
    genres: item.genres || [],
    studios: { nodes: [] },
    nextAiringEpisode: null,
    trailer: null,
  };
}

export const AniDBAPI = {
  aniDBProvider,
  buildNormalizedIDs,
  mapAniDBToAnimeMedia,
};

export default aniDBProvider;
