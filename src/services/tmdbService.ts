/**
 * TMDB (The Movie Database) Integration Service for KURO NAMI
 * API Key: 053ce862dae3af63f9c2cfdf9b310d2a
 * 
 * Provides posters, background backdrops, overview, ratings, and cast details.
 */

export const TMDB_API_KEY = '053ce862dae3af63f9c2cfdf9b310d2a';
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface TMDBCastMember {
  id: number;
  name: string;
  original_name: string;
  character: string;
  profile_path: string | null;
  profile_url: string | null;
  order: number;
}

export interface TMDBMediaDetails {
  tmdb_id: number;
  imdb_id?: string | null;
  title: string;
  original_title?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  first_air_date?: string;
  media_type: 'movie' | 'tv';
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres: Array<{ id: number; name: string }>;
  cast: TMDBCastMember[];
  status?: string;
}

/**
 * Format image path to full URL
 */
export function getTMDBImageUrl(
  path: string | null | undefined,
  size: 'w185' | 'w300' | 'w500' | 'w1280' | 'original' = 'w500'
): string | null {
  if (!path || typeof path !== 'string') return null;
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${TMDB_IMAGE_BASE}/${size}${cleanPath}`;
}

// In-memory cache for TMDB requests
const tmdbCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const urlParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    ...params,
  });
  const fullUrl = `${TMDB_BASE_URL}${endpoint}?${urlParams.toString()}`;

  const cached = tmdbCache.get(fullUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as T;
  }

  try {
    const res = await fetch(fullUrl);
    if (!res.ok) {
      console.warn(`[TMDB SERVICE] Request failed with HTTP ${res.status}: ${fullUrl}`);
      return null;
    }
    const data = await res.json();
    tmdbCache.set(fullUrl, { data, timestamp: Date.now() });
    return data as T;
  } catch (err) {
    console.error(`[TMDB SERVICE] Fetch error for ${endpoint}:`, err);
    return null;
  }
}

/**
 * Search TMDB for Movies or TV Shows
 */
export async function searchTMDB(query: string, mediaType: 'multi' | 'movie' | 'tv' = 'multi') {
  if (!query || !query.trim()) return [];

  const endpoint = mediaType === 'multi' ? '/search/multi' : mediaType === 'movie' ? '/search/movie' : '/search/tv';
  const data: any = await fetchTMDB(endpoint, { query: query.trim(), include_adult: 'false' });

  if (!data || !Array.isArray(data.results)) return [];

  return data.results.map((item: any) => {
    const isMovie = item.media_type === 'movie' || Boolean(item.title && !item.name);
    const title = item.title || item.name || item.original_title || item.original_name || 'Untitled';
    const releaseDate = item.release_date || item.first_air_date || '';
    const year = releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : null;

    return {
      tmdb_id: item.id,
      media_type: (item.media_type || (isMovie ? 'movie' : 'tv')) as 'movie' | 'tv',
      title,
      overview: item.overview || '',
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      poster_url: getTMDBImageUrl(item.poster_path, 'w500'),
      backdrop_url: getTMDBImageUrl(item.backdrop_path, 'w1280'),
      vote_average: item.vote_average || 0,
      vote_count: item.vote_count || 0,
      year,
    };
  });
}

/**
 * Fetch detailed information for a TMDB media item including credits (cast), ratings, overview, posters
 */
export async function getTMDBDetails(
  tmdbId: number | string,
  mediaType: 'movie' | 'tv' = 'tv'
): Promise<TMDBMediaDetails | null> {
  if (!tmdbId) return null;

  const endpoint = `/${mediaType}/${tmdbId}`;
  const data: any = await fetchTMDB(endpoint, {
    append_to_response: 'credits,aggregate_credits,external_ids',
  });

  if (!data) return null;

  const title = data.title || data.name || data.original_title || data.original_name || 'Untitled';
  const rawCast = data.credits?.cast || data.aggregate_credits?.cast || [];

  const cast: TMDBCastMember[] = rawCast.slice(0, 12).map((c: any, index: number) => ({
    id: c.id,
    name: c.name || c.original_name || 'Unknown Actor',
    original_name: c.original_name || c.name || '',
    character: c.character || (c.roles && c.roles[0]?.character) || 'Voice / Cast',
    profile_path: c.profile_path,
    profile_url: getTMDBImageUrl(c.profile_path, 'w185'),
    order: c.order !== undefined ? c.order : index,
  }));

  const imdbId = data.external_ids?.imdb_id || data.imdb_id || null;

  return {
    tmdb_id: data.id,
    imdb_id: imdbId,
    title,
    original_title: data.original_title || data.original_name,
    overview: data.overview || '',
    poster_path: data.poster_path,
    backdrop_path: data.backdrop_path,
    poster_url: getTMDBImageUrl(data.poster_path, 'w500'),
    backdrop_url: getTMDBImageUrl(data.backdrop_path, 'w1280'),
    vote_average: Math.round((data.vote_average || 0) * 10) / 10,
    vote_count: data.vote_count || 0,
    release_date: data.release_date,
    first_air_date: data.first_air_date,
    media_type: mediaType,
    number_of_seasons: data.number_of_seasons || 1,
    number_of_episodes: data.number_of_episodes,
    genres: data.genres || [],
    cast,
    status: data.status,
  };
}

/**
 * Find TMDB ID and metadata by Title and Year (smart auto-matcher for anime / movies)
 */
export async function findTMDBByTitle(
  title: string,
  year?: number | null,
  preferMediaType: 'movie' | 'tv' = 'tv'
): Promise<TMDBMediaDetails | null> {
  if (!title || !title.trim()) return null;

  const cleanTitle = title.replace(/\s*\([^)]*\)/g, '').trim();
  const searchResults = await searchTMDB(cleanTitle, 'multi');

  if (!searchResults || searchResults.length === 0) {
    return null;
  }

  let bestMatch = searchResults.find((item: any) => {
    if (year && item.year && Math.abs(item.year - year) <= 1) {
      return true;
    }
    return false;
  });

  if (!bestMatch) {
    bestMatch = searchResults[0];
  }

  return getTMDBDetails(bestMatch.tmdb_id, bestMatch.media_type);
}
