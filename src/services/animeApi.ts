import {
  AnimeMedia,
  AnimeTitle,
  CoverImage,
  NextAiringEpisode,
  AiringScheduleItem,
  NewsArticle,
  AniListMediaResponse,
  SeasonalAnimeResponse,
  SearchFilterState,
  PageInfo,
} from '../types/anime.ts';

// In-memory cache with expiration
interface CacheItem<T> {
  data: T;
  expiry: number;
}

const memoryCache = new Map<string, CacheItem<any>>();

export function getCachedItem<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

export function setCachedItem<T>(key: string, data: T, ttlMs: number): void {
  memoryCache.set(key, { data, expiry: Date.now() + ttlMs });
}

// Default fallback SVG placeholder image (Natural dark anime poster placeholder)
export const DEFAULT_ANIME_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420" fill="none">
  <rect width="300" height="420" fill="#0f111a"/>
  <rect x="1" y="1" width="298" height="418" rx="12" stroke="#252b3b" stroke-width="2"/>
  <circle cx="150" cy="180" r="48" fill="#1c2233"/>
  <path d="M140 160L168 180L140 200V160Z" fill="#e11d48"/>
  <text x="150" y="260" fill="#94a3b8" font-family="sans-serif" font-size="14" font-weight="600" text-anchor="middle">KURO NAMI</text>
  <text x="150" y="282" fill="#64748b" font-family="sans-serif" font-size="11" text-anchor="middle">Artwork Loading</text>
</svg>
`);

/**
 * Safe image helper that retrieves the highest quality artwork available
 * with an exhaustive fallback chain and local SVG placeholder.
 */
export function getAnimeImage(
  anime: AnimeMedia | null | undefined,
  type: 'cover' | 'banner' | 'avatar' = 'cover'
): string {
  if (!anime) return DEFAULT_ANIME_PLACEHOLDER;

  if (type === 'banner' && anime.bannerImage) {
    return anime.bannerImage;
  }

  const cover = anime.coverImage;
  if (cover) {
    if (cover.extraLarge && typeof cover.extraLarge === 'string' && cover.extraLarge.trim().length > 0) {
      return cover.extraLarge;
    }
    if (cover.large && typeof cover.large === 'string' && cover.large.trim().length > 0) {
      return cover.large;
    }
    if (cover.medium && typeof cover.medium === 'string' && cover.medium.trim().length > 0) {
      return cover.medium;
    }
  }

  if (anime.bannerImage && typeof anime.bannerImage === 'string' && anime.bannerImage.trim().length > 0) {
    return anime.bannerImage;
  }

  return DEFAULT_ANIME_PLACEHOLDER;
}

/**
 * Handle image error events by safely swapping src to the default placeholder
 */
export function handleImageError(e: React.SyntheticEvent<HTMLImageElement, Event>): void {
  const target = e.currentTarget;
  if (target.src !== DEFAULT_ANIME_PLACEHOLDER) {
    target.src = DEFAULT_ANIME_PLACEHOLDER;
  }
}

/**
 * Custom fetch with timeout, automatic retries and exponential backoff
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000,
  retries = 2
): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 429 && attempt < retries) {
        // Rate limit backoff
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        attempt++;
        continue;
      }

      return response;
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt >= retries) {
        throw err;
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw new Error(`Request to ${url} timed out or failed after retries`);
}

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

const MEDIA_FIELDS = `
  id
  idMal
  title {
    romaji
    english
    native
  }
  description
  bannerImage
  coverImage {
    extraLarge
    large
    medium
    color
  }
  format
  status
  episodes
  duration
  season
  seasonYear
  averageScore
  meanScore
  popularity
  favourites
  genres
  synonyms
  studios(isMain: true) {
    nodes {
      id
      name
    }
  }
  nextAiringEpisode {
    id
    airingAt
    timeUntilAiring
    episode
  }
  trailer {
    id
    site
    thumbnail
  }
`;

/**
 * Helper to query AniList directly from client or through server
 */
async function queryAniListDirect<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const res = await fetchWithTimeout(
    ANILIST_GRAPHQL_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    },
    9000,
    2
  );

  if (!res.ok) {
    throw new Error(`AniList returned HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || 'AniList GraphQL Error');
  }

  return json.data;
}

/**
 * Calculate dynamic seasonal info
 */
export function getCurrentSeasonInfo(): { season: string; year: number } {
  const now = new Date();
  const month = now.getMonth(); // 0 = Jan, 11 = Dec
  const year = now.getFullYear();

  let season = 'WINTER';
  if (month >= 2 && month <= 4) {
    season = 'SPRING';
  } else if (month >= 5 && month <= 7) {
    season = 'SUMMER';
  } else if (month >= 8 && month <= 10) {
    season = 'FALL';
  } else {
    season = 'WINTER';
  }

  return { season, year };
}

// -----------------------------------------------------------------------------
// CENTRAL METADATA API METHODS
// -----------------------------------------------------------------------------

/**
 * 1. Popular Anime
 */
export async function getPopularAnime(page = 1, perPage = 12): Promise<AniListMediaResponse> {
  const cacheKey = `popular_${page}_${perPage}`;
  const cached = getCachedItem<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  // 1. Try internal backend API proxy first
  try {
    const res = await fetchWithTimeout(`/api/anime/popular?page=${page}&perPage=${perPage}`, {}, 5000, 1);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCachedItem(cacheKey, json, 15 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall back to direct AniList
  }

  // 2. Direct AniList Query
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          hasNextPage
          total
        }
        media(type: ANIME, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await queryAniListDirect(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setCachedItem(cacheKey, result, 15 * 60 * 1000);
  return result;
}

/**
 * 2. Currently Airing Anime
 */
export async function getCurrentlyAiring(page = 1, perPage = 15): Promise<AniListMediaResponse> {
  const cacheKey = `airing_${page}_${perPage}`;
  const cached = getCachedItem<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`/api/anime/airing?page=${page}&perPage=${perPage}`, {}, 5000, 1);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCachedItem(cacheKey, json, 5 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall back
  }

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          hasNextPage
          total
        }
        media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await queryAniListDirect(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setCachedItem(cacheKey, result, 5 * 60 * 1000);
  return result;
}

/**
 * 3. Current Season Anime
 */
export async function getCurrentSeason(
  season?: string,
  seasonYear?: number,
  page = 1,
  perPage = 16
): Promise<SeasonalAnimeResponse> {
  const { season: currentSeason, year: currentYear } = getCurrentSeasonInfo();
  const targetSeason = season || currentSeason;
  const targetYear = seasonYear || currentYear;

  const cacheKey = `seasonal_${targetSeason}_${targetYear}_${page}_${perPage}`;
  const cached = getCachedItem<SeasonalAnimeResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `/api/anime/seasonal?season=${targetSeason}&year=${targetYear}&page=${page}&perPage=${perPage}`,
      {},
      5000,
      1
    );
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCachedItem(cacheKey, json, 10 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall back
  }

  const query = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          hasNextPage
          total
        }
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await queryAniListDirect(query, {
    season: targetSeason,
    seasonYear: targetYear,
    page,
    perPage,
  });

  const result: SeasonalAnimeResponse = {
    media: data.Page?.media || [],
    season: targetSeason,
    year: targetYear,
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setCachedItem(cacheKey, result, 10 * 60 * 1000);
  return result;
}

/**
 * 4. Upcoming Anime
 */
export async function getUpcomingAnime(page = 1, perPage = 12): Promise<AniListMediaResponse> {
  const cacheKey = `upcoming_${page}_${perPage}`;
  const cached = getCachedItem<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`/api/anime/upcoming?page=${page}&perPage=${perPage}`, {}, 5000, 1);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCachedItem(cacheKey, json, 15 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall back
  }

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          hasNextPage
          total
        }
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await queryAniListDirect(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setCachedItem(cacheKey, result, 15 * 60 * 1000);
  return result;
}

/**
 * 5. Full Anime Details
 */
export async function getAnimeDetails(id: number): Promise<AnimeMedia | null> {
  const cacheKey = `anime_details_${id}`;
  const cached = getCachedItem<AnimeMedia>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`/api/anime/${id}`, {}, 5000, 1);
    if (res.ok) {
      const media = await res.json();
      if (media && media.id) {
        setCachedItem(cacheKey, media, 30 * 60 * 1000);
        return media;
      }
    }
  } catch {
    // Fall back
  }

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        source
        hashtag
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
        characters(sort: ROLE, perPage: 12) {
          edges {
            role
            node {
              id
              name {
                full
                native
              }
              image {
                large
                medium
              }
            }
            voiceActors(language: JAPANESE, sort: RELEVANCE) {
              id
              name {
                full
                native
              }
              image {
                medium
              }
              languageV2
            }
          }
        }
        staff(perPage: 8) {
          edges {
            role
            node {
              id
              name {
                full
              }
              image {
                medium
              }
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              id
              title {
                romaji
                english
              }
              format
              status
              coverImage {
                medium
                large
              }
            }
          }
        }
        recommendations(perPage: 8, sort: RATING_DESC) {
          nodes {
            id
            rating
            mediaRecommendation {
              id
              title {
                romaji
                english
              }
              format
              coverImage {
                large
                medium
              }
              averageScore
            }
          }
        }
      }
    }
  `;

  try {
    const data = await queryAniListDirect(query, { id });
    const media = data.Media;
    if (media) {
      setCachedItem(cacheKey, media, 30 * 60 * 1000);
      return media;
    }
  } catch (err) {
    console.error(`Failed to fetch details for anime ${id}:`, err);
  }

  return null;
}

/**
 * 6. Recent Anime / Latest Releases from Backend AniKoto Provider
 */
export async function getRecentAnime(page = 1, perPage = 20): Promise<AniListMediaResponse> {
  const cacheKey = `recent_${page}_${perPage}`;
  const cached = getCachedItem<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`/api/anime/recent?page=${page}&perPage=${perPage}`, {}, 5000, 1);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCachedItem(cacheKey, json, 5 * 60 * 1000);
        return json;
      }
    }
  } catch (err) {
    console.warn('Recent anime backend fetch error:', err);
  }

  return { media: [], pageInfo: { total: 0, currentPage: page, perPage, hasNextPage: false } };
}

/**
 * Legacy compatibility stub: AniKoto API does not document an airing-schedule endpoint.
 * Returns an empty array without making unsupported requests.
 */
export async function getAiringSchedule(_daysAhead = 7): Promise<AiringScheduleItem[]> {
  return [];
}

/**
 * 7. Trending Anime
 */
export async function getTrendingAnime(page = 1, perPage = 10): Promise<AniListMediaResponse> {
  const cacheKey = `trending_${page}_${perPage}`;
  const cached = getCachedItem<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`/api/anime/trending?page=${page}&perPage=${perPage}`, {}, 5000, 1);
    if (res.ok) {
      const json = await res.json();
      if (json.media && json.media.length > 0) {
        setCachedItem(cacheKey, json, 10 * 60 * 1000);
        return json;
      }
    }
  } catch {
    // Fall back
  }

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          hasNextPage
          total
        }
        media(type: ANIME, sort: TRENDING_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await queryAniListDirect(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setCachedItem(cacheKey, result, 10 * 60 * 1000);
  return result;
}

/**
 * 8. Search & Filters
 */
export async function searchAnime(params: SearchFilterState = {}): Promise<AniListMediaResponse> {
  const safeParams = params || {};
  const cacheKey = `search_${JSON.stringify(safeParams)}`;
  const cached = getCachedItem<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const searchParams = new URLSearchParams();
    if (safeParams.query) searchParams.set('query', safeParams.query);
    if (safeParams.genre && safeParams.genre !== 'ALL') searchParams.set('genre', safeParams.genre);
    if (safeParams.year) searchParams.set('year', safeParams.year.toString());
    if (safeParams.season && safeParams.season !== 'ALL') searchParams.set('season', safeParams.season);
    if (safeParams.status && safeParams.status !== 'ALL') searchParams.set('status', safeParams.status);
    if (safeParams.format && safeParams.format !== 'ALL') searchParams.set('format', safeParams.format);
    if (safeParams.sort) searchParams.set('sort', safeParams.sort);
    if (safeParams.page) searchParams.set('page', safeParams.page.toString());
    if (safeParams.perPage) searchParams.set('perPage', safeParams.perPage.toString());

    const res = await fetchWithTimeout(`/api/anime/search?${searchParams.toString()}`, {}, 6000, 1);
    if (res.ok) {
      const json = await res.json();
      setCachedItem(cacheKey, json, 5 * 60 * 1000);
      return json;
    }
  } catch {
    // Fall back
  }

  const variables: any = {
    page: safeParams.page || 1,
    perPage: safeParams.perPage || 20,
    sort: [safeParams.sort || 'POPULARITY_DESC'],
  };

  if (safeParams.query?.trim()) variables.search = safeParams.query.trim();
  if (safeParams.genre && safeParams.genre !== 'ALL') variables.genre = safeParams.genre;
  if (safeParams.year) variables.seasonYear = safeParams.year;
  if (safeParams.season && safeParams.season !== 'ALL') variables.season = safeParams.season;
  if (safeParams.status && safeParams.status !== 'ALL') variables.status = safeParams.status;
  if (safeParams.format && safeParams.format !== 'ALL') variables.format = safeParams.format;

  const query = `
    query ($page: Int, $perPage: Int, $search: String, $genre: String, $seasonYear: Int, $season: MediaSeason, $status: MediaStatus, $format: MediaFormat, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          currentPage
          total
        }
        media(type: ANIME, search: $search, genre: $genre, seasonYear: $seasonYear, season: $season, status: $status, format: $format, sort: $sort) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  try {
    const data = await queryAniListDirect(query, variables);
    const result: AniListMediaResponse = {
      media: data.Page?.media || [],
      pageInfo: data.Page?.pageInfo || { hasNextPage: false },
    };
    setCachedItem(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch (err) {
    console.error('Search failed:', err);
    return { media: [], pageInfo: { hasNextPage: false } };
  }
}

/**
 * 9. Top Rankings
 */
export async function getRankings(
  category: 'AIRING' | 'RATED' | 'POPULAR' | 'UPCOMING' | 'MOVIES',
  page = 1,
  perPage = 20
): Promise<AniListMediaResponse> {
  const cacheKey = `rankings_${category}_${page}_${perPage}`;
  const cached = getCachedItem<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `/api/anime/rankings?category=${category}&page=${page}&perPage=${perPage}`,
      {},
      6000,
      1
    );
    if (res.ok) {
      const json = await res.json();
      setCachedItem(cacheKey, json, 15 * 60 * 1000);
      return json;
    }
  } catch {
    // Fall back
  }

  let sort = 'SCORE_DESC';
  let status: string | undefined;
  let format: string | undefined;

  switch (category) {
    case 'AIRING':
      status = 'RELEASING';
      sort = 'POPULARITY_DESC';
      break;
    case 'RATED':
      sort = 'SCORE_DESC';
      break;
    case 'POPULAR':
      sort = 'POPULARITY_DESC';
      break;
    case 'UPCOMING':
      status = 'NOT_YET_RELEASED';
      sort = 'POPULARITY_DESC';
      break;
    case 'MOVIES':
      format = 'MOVIE';
      sort = 'SCORE_DESC';
      break;
  }

  const variables: any = { page, perPage, sort: [sort] };
  if (status) variables.status = status;
  if (format) variables.format = format;

  const query = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $format: MediaFormat) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          currentPage
          total
        }
        media(type: ANIME, sort: $sort, status: $status, format: $format) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  try {
    const data = await queryAniListDirect(query, variables);
    const result: AniListMediaResponse = {
      media: data.Page?.media || [],
      pageInfo: data.Page?.pageInfo || { hasNextPage: false },
    };
    setCachedItem(cacheKey, result, 15 * 60 * 1000);
    return result;
  } catch (err) {
    console.error('Rankings query failed:', err);
    return { media: [], pageInfo: { hasNextPage: false } };
  }
}

/**
 * 10. News
 */
export async function getNews(): Promise<NewsArticle[]> {
  const cacheKey = 'news_feed';
  const cached = getCachedItem<NewsArticle[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout('/api/news', {}, 5000, 1);
    if (res.ok) {
      const data = await res.json();
      const articles = Array.isArray(data) ? data : data.articles || [];
      if (articles.length > 0) {
        setCachedItem(cacheKey, articles, 5 * 60 * 1000);
        return articles;
      }
    }
  } catch (err) {
    console.warn('Backend news fetch failed, returning empty news:', err);
  }

  return [];
}

export const animeApi = {
  getRecentAnime,
  getPopularAnime,
  getCurrentlyAiring,
  getCurrentSeason,
  getUpcomingAnime,
  getAnimeDetails,
  getAiringSchedule,
  getTrendingAnime,
  searchAnime,
  getRankings,
  getNews,
  getAnimeImage,
  handleImageError,
  getCurrentSeasonInfo,
};

export const AnimeApiService = animeApi;

export default animeApi;
