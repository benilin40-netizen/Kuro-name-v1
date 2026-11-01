/**
 * QWISH Anime - Search Service Layer
 *
 * Provides typed anime search, filtering, and aggregation.
 */

import { AnimeMedia, AniListMediaResponse, SearchFilterState } from '../types/anime.ts';
import { AnimeApiService } from './animeApi.ts';

export const GENRE_LIST = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
] as const;

export const FORMAT_OPTIONS = [
  { label: 'All Formats', value: '' },
  { label: 'TV Series', value: 'TV' },
  { label: 'Anime Movie', value: 'MOVIE' },
  { label: 'TV Short', value: 'TV_SHORT' },
  { label: 'OVA', value: 'OVA' },
  { label: 'ONA', value: 'ONA' },
  { label: 'Special', value: 'SPECIAL' },
];

export const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Releasing', value: 'RELEASING' },
  { label: 'Finished', value: 'FINISHED' },
  { label: 'Upcoming', value: 'NOT_YET_RELEASED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export const SORT_OPTIONS = [
  { label: 'Most Popular', value: 'POPULARITY_DESC' },
  { label: 'Highest Rated', value: 'SCORE_DESC' },
  { label: 'Trending', value: 'TRENDING_DESC' },
  { label: 'Recently Updated', value: 'UPDATED_AT_DESC' },
  { label: 'Release Date', value: 'START_DATE_DESC' },
  { label: 'Title (A-Z)', value: 'TITLE_ROMAJI' },
];

/**
 * Searches anime with full filter parameters
 */
export async function searchAnime(filters: SearchFilterState = {}): Promise<AniListMediaResponse> {
  return AnimeApiService.searchAnime(filters);
}

/**
 * Quick search by title query (for search modal / autocomplete)
 */
export async function quickSearch(query: string, limit = 8): Promise<AnimeMedia[]> {
  if (!query || !query.trim()) return [];
  try {
    const res = await AnimeApiService.searchAnime({
      query: query.trim(),
      perPage: limit,
      page: 1,
    });
    return res.media || [];
  } catch (err) {
    console.error('[SEARCH API] Quick search failed:', err);
    return [];
  }
}

export const SearchApiService = {
  searchAnime,
  quickSearch,
  GENRE_LIST,
  FORMAT_OPTIONS,
  STATUS_OPTIONS,
  SORT_OPTIONS,
};

export default SearchApiService;
