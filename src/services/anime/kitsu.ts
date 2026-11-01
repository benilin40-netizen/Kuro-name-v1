import { AnimeMedia } from '../../types/anime.ts';

export const KITSU_BASE_URL = 'https://kitsu.io/api/edge';

export interface KitsuAnimeItem {
  id: string;
  type: string;
  attributes: {
    canonicalTitle?: string;
    titles?: {
      en?: string;
      en_jp?: string;
      ja_jp?: string;
    };
    synopsis?: string;
    coverImage?: {
      large?: string;
      original?: string;
    };
    posterImage?: {
      tiny?: string;
      small?: string;
      medium?: string;
      large?: string;
      original?: string;
    };
    averageRating?: string;
    userCount?: number;
    status?: string;
    subtype?: string;
    episodeCount?: number;
    episodeLength?: number;
    startDate?: string;
    youtubeVideoId?: string;
  };
}

export function mapKitsuToAnimeMedia(item: KitsuAnimeItem): AnimeMedia {
  const attr = item.attributes || {};
  const idNum = parseInt(item.id, 10) || Math.abs(item.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));

  return {
    id: idNum,
    idMal: null,
    title: {
      romaji: attr.titles?.en_jp || attr.canonicalTitle || 'Unknown Title',
      english: attr.titles?.en || attr.canonicalTitle || attr.titles?.en_jp || 'Unknown Title',
      native: attr.titles?.ja_jp || null,
    },
    description: attr.synopsis || null,
    bannerImage: attr.coverImage?.large || attr.coverImage?.original || null,
    coverImage: {
      extraLarge: attr.posterImage?.original || attr.posterImage?.large || '',
      large: attr.posterImage?.large || attr.posterImage?.medium || '',
      medium: attr.posterImage?.medium || attr.posterImage?.small || '',
      color: null,
    },
    format: attr.subtype ? attr.subtype.toUpperCase() : 'TV',
    status: attr.status === 'current' ? 'RELEASING' : attr.status === 'finished' ? 'FINISHED' : 'NOT_YET_RELEASED',
    episodes: attr.episodeCount || null,
    duration: attr.episodeLength || null,
    season: null,
    seasonYear: attr.startDate ? new Date(attr.startDate).getFullYear() : null,
    averageScore: attr.averageRating ? Math.round(parseFloat(attr.averageRating)) : null,
    meanScore: attr.averageRating ? Math.round(parseFloat(attr.averageRating)) : null,
    popularity: attr.userCount || 0,
    genres: [],
    studios: { nodes: [] },
    nextAiringEpisode: null,
    trailer: attr.youtubeVideoId
      ? { id: attr.youtubeVideoId, site: 'youtube', thumbnail: undefined }
      : null,
  };
}

/**
 * Search Kitsu API for anime
 */
export async function searchKitsuAnime(query: string, limit = 20): Promise<AnimeMedia[]> {
  if (!query) return [];

  try {
    const url = `${KITSU_BASE_URL}/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    });

    if (!res.ok) return [];

    const json = await res.json();
    if (!Array.isArray(json.data)) return [];

    return json.data.map(mapKitsuToAnimeMedia);
  } catch (err) {
    console.error('[KITSU SERVICE] searchKitsuAnime failed:', err);
    return [];
  }
}

/**
 * Get anime by Kitsu ID
 */
export async function getKitsuAnime(id: string | number): Promise<AnimeMedia | null> {
  if (!id) return null;

  try {
    const url = `${KITSU_BASE_URL}/anime/${id}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (!json.data) return null;

    return mapKitsuToAnimeMedia(json.data);
  } catch (err) {
    console.error('[KITSU SERVICE] getKitsuAnime failed:', err);
    return null;
  }
}

export const KitsuAPI = {
  searchKitsuAnime,
  getKitsuAnime,
  mapKitsuToAnimeMedia,
};

export default KitsuAPI;
