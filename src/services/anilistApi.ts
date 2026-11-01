/**
 * AniList GraphQL API Service
 * Official metadata integration for QWISH platform.
 * 
 * Retrieves anime metadata, cover/banner images, descriptions, studio credits,
 * and character info with in-memory caching and resilient error handling.
 */

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
    userPreferred?: string;
  };
  description: string | null;
  coverImage: {
    extraLarge?: string | null;
    large: string;
    medium?: string | null;
    color?: string | null;
  };
  bannerImage: string | null;
  genres: string[];
  averageScore: number | null;
  popularity: number | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  duration: number | null;
  format: string | null;
  tags?: Array<{ id: number; name: string; rank?: number }>;
  siteUrl?: string | null;
  studios?: {
    nodes: Array<{ id: number; name: string; isAnimationStudio: boolean }>;
  };
  characters?: {
    nodes: Array<{
      id: number;
      name: { full: string; native?: string | null };
      image: { medium: string | null; large: string | null };
    }>;
  };
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        title: { romaji: string; english: string | null };
        coverImage: { large: string };
        format: string;
      };
    }>;
  };
  streamingEpisodes?: Array<{
    title: string;
    thumbnail: string | null;
    url: string | null;
    site: string | null;
  }>;
  nextAiringEpisode?: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  } | null;
}

export interface AniListSearchFilter {
  query?: string;
  genre?: string;
  season?: string;
  seasonYear?: number;
  status?: string;
  format?: string;
  sort?: string[];
  page?: number;
  perPage?: number;
}

const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

// In-memory cache for AniList GraphQL requests
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

function getFromCache<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.data as T;
}

function setInCache<T>(key: string, data: T, ttl = CACHE_TTL_MS): void {
  cache.set(key, { data, expiry: Date.now() + ttl });
}

const MEDIA_FIELDS_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
    native
    userPreferred
  }
  description(asHtml: false)
  coverImage {
    extraLarge
    large
    medium
    color
  }
  bannerImage
  genres
  averageScore
  popularity
  status
  season
  seasonYear
  episodes
  duration
  format
  tags {
    id
    name
    rank
  }
  siteUrl
  studios(isMain: true) {
    nodes {
      id
      name
      isAnimationStudio
    }
  }
  nextAiringEpisode {
    airingAt
    timeUntilAiring
    episode
  }
`;

const DETAILED_MEDIA_FIELDS_FRAGMENT = `
  ${MEDIA_FIELDS_FRAGMENT}
  characters(sort: ROLE, perPage: 10) {
    nodes {
      id
      name {
        full
        native
      }
      image {
        medium
        large
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
        coverImage {
          large
        }
        format
      }
    }
  }
  streamingEpisodes {
    title
    thumbnail
    url
    site
  }
`;

async function executeAniListQuery<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const cacheKey = JSON.stringify({ query, variables });
  const cached = getFromCache<T>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      console.warn('[ANILIST API] Rate limit reached (429). Attempting fallback...');
      throw new Error('AniList API rate limit reached. Please wait a few seconds.');
    }

    if (response.status === 404) {
      return null as unknown as T;
    }

    if (!response.ok) {
      throw new Error(`AniList GraphQL request failed with HTTP ${response.status}`);
    }

    const json = await response.json();
    if (json.errors && json.errors.length > 0) {
      const isNotFound = json.errors.some(
        (e: any) => e.status === 404 || e.message?.toLowerCase().includes('not found')
      );
      if (isNotFound) {
        return null as unknown as T;
      }
      throw new Error(json.errors[0]?.message || 'AniList GraphQL execution error');
    }

    const data = json.data as T;
    setInCache(cacheKey, data);
    return data;
  } catch (err: any) {
    if (err?.message?.toLowerCase().includes('not found')) {
      return null as unknown as T;
    }
    console.warn('[ANILIST API]', err.message);
    throw err;
  }
}

/**
 * Get current Trending anime on AniList
 */
export async function getTrendingAnime(page = 1, perPage = 12): Promise<{ media: AniListMedia[]; total?: number }> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
        }
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
          ${MEDIA_FIELDS_FRAGMENT}
        }
      }
    }
  `;

  try {
    const data = await executeAniListQuery<{ Page: { media: AniListMedia[]; pageInfo: { total: number } } }>(query, {
      page,
      perPage,
    });
    return {
      media: data?.Page?.media || [],
      total: data?.Page?.pageInfo?.total,
    };
  } catch (_e) {
    return { media: [] };
  }
}

/**
 * Get All-Time Popular anime on AniList
 */
export async function getPopularAnime(page = 1, perPage = 12): Promise<{ media: AniListMedia[]; total?: number }> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
        }
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_FIELDS_FRAGMENT}
        }
      }
    }
  `;

  try {
    const data = await executeAniListQuery<{ Page: { media: AniListMedia[]; pageInfo: { total: number } } }>(query, {
      page,
      perPage,
    });
    return {
      media: data?.Page?.media || [],
      total: data?.Page?.pageInfo?.total,
    };
  } catch (_e) {
    return { media: [] };
  }
}

/**
 * Get Latest Released/Airing anime
 */
export async function getLatestAnime(page = 1, perPage = 12): Promise<{ media: AniListMedia[]; total?: number }> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
        }
        media(type: ANIME, sort: START_DATE_DESC, status_in: [RELEASING, FINISHED], isAdult: false) {
          ${MEDIA_FIELDS_FRAGMENT}
        }
      }
    }
  `;

  try {
    const data = await executeAniListQuery<{ Page: { media: AniListMedia[]; pageInfo: { total: number } } }>(query, {
      page,
      perPage,
    });
    return {
      media: data?.Page?.media || [],
      total: data?.Page?.pageInfo?.total,
    };
  } catch (_e) {
    return { media: [] };
  }
}

/**
 * Search anime on AniList with query text and optional filters
 */
export async function searchAnime(
  queryText: string,
  page = 1,
  perPage = 12,
  genre?: string
): Promise<{ media: AniListMedia[]; total?: number }> {
  const query = `
    query ($search: String, $page: Int, $perPage: Int, $genre: String) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
        }
        media(search: $search, genre: $genre, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
          ${MEDIA_FIELDS_FRAGMENT}
        }
      }
    }
  `;

  const variables: Record<string, any> = { page, perPage };
  if (queryText && queryText.trim()) variables.search = queryText.trim();
  if (genre && genre.trim() && genre !== 'ALL') variables.genre = genre.trim();

  try {
    const data = await executeAniListQuery<{ Page: { media: AniListMedia[]; pageInfo: { total: number } } }>(query, variables);
    return {
      media: data?.Page?.media || [],
      total: data?.Page?.pageInfo?.total,
    };
  } catch (err: any) {
    throw err;
  }
}

/**
 * Get detailed anime info by AniList ID
 */
export async function getAnimeById(id: number | string): Promise<AniListMedia | null> {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  if (!numId || isNaN(numId)) return null;

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${DETAILED_MEDIA_FIELDS_FRAGMENT}
      }
    }
  `;

  try {
    const data = await executeAniListQuery<{ Media: AniListMedia }>(query, { id: numId });
    if (data?.Media) return data.Media;
  } catch (_err) {
    // Non-AniList ID (e.g. AniKoto or local DB record)
  }

  // Cross-provider fallback: try backend /api/anime/:id
  try {
    const res = await fetch(`/api/anime/${numId}`);
    if (res.ok) {
      const localData = await res.json();
      if (localData && localData.title) {
        return localData as unknown as AniListMedia;
      }
    }
  } catch (_e) {}

  return null;
}

export async function getAiringSchedule(days = 7): Promise<any[]> {
  const now = Math.floor(Date.now() / 1000);
  const end = now + days * 24 * 60 * 60;
  const query = `
    query ($page: Int, $perPage: Int, $airingAtGreater: Int, $airingAtLesser: Int) {
      Page(page: $page, perPage: $perPage) {
        airingSchedules(airingAt_greater: $airingAtGreater, airingAt_lesser: $airingAtLesser, sort: TIME) {
          id
          airingAt
          timeUntilAiring
          episode
          mediaId
          media {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              extraLarge
              medium
            }
            bannerImage
            episodes
            status
            format
            genres
            averageScore
            popularity
          }
        }
      }
    }
  `;

  try {
    const data = await executeAniListQuery<{ Page: { airingSchedules: any[] } }>(query, {
      page: 1,
      perPage: 35,
      airingAtGreater: now,
      airingAtLesser: end,
    });
    return data?.Page?.airingSchedules || [];
  } catch (_e) {
    return [];
  }
}

export const AniListAPI = {
  getTrendingAnime,
  getPopularAnime,
  getLatestAnime,
  searchAnime,
  getAnimeById,
  getAiringSchedule,
};
