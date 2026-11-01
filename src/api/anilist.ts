import {
  AnimeMedia,
  AiringScheduleItem,
  PageInfo,
  AniListMediaResponse,
  SeasonalAnimeResponse,
  SearchFilterState,
} from '../types/anime.ts';

export const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

/**
 * Custom error class for AniList GraphQL API errors
 */
export class AniListError extends Error {
  public status?: number;
  public errors?: Array<{ message: string; status?: number; locations?: any[] }>;

  constructor(
    message: string,
    status?: number,
    errors?: Array<{ message: string; status?: number; locations?: any[] }>
  ) {
    super(message);
    this.name = 'AniListError';
    this.status = status;
    this.errors = errors;
  }
}

// Media GraphQL fragment matching the entire AniList specification
export const MEDIA_FRAGMENT = `
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

// In-memory client cache with TTL
const cache = new Map<string, { data: any; expiry: number }>();

export function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setInCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

export function clearCache(): void {
  cache.clear();
}

/**
 * Executes a GraphQL query against AniList with timeout and retry backoff support
 */
export async function anilistQuery<T = any>(
  query: string,
  variables: Record<string, any> = {},
  retries = 2
): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'KuroNami/1.0',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          // Rate limit backoff
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          attempt++;
          continue;
        }

        let errorMsg = `AniList returned HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.errors && errJson.errors.length > 0) {
            errorMsg = errJson.errors.map((e: any) => e.message).join(', ');
            throw new AniListError(errorMsg, response.status, errJson.errors);
          }
        } catch (e: any) {
          if (e instanceof AniListError) throw e;
        }

        throw new AniListError(errorMsg, response.status);
      }

      const json = await response.json();
      if (json.errors && json.errors.length > 0) {
        const errorMsg = json.errors.map((e: any) => e.message).join(', ');
        throw new AniListError(errorMsg, 200, json.errors);
      }

      return json.data;
    } catch (err: any) {
      if (err instanceof AniListError && err.status !== 429) {
        throw err;
      }
      if (attempt >= retries) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      attempt++;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('AniList request failed after retries');
}

/**
 * Calculates current anime season dynamically based on system date
 */
export function getCurrentSeason(): { season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'; year: number } {
  const now = new Date();
  const month = now.getMonth(); // 0 to 11
  const year = now.getFullYear();

  let season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL' = 'WINTER';
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

/**
 * 1. Fetch currently trending anime
 */
export async function getTrendingAnime(
  page = 1,
  perPage = 10
): Promise<AniListMediaResponse> {
  const cacheKey = `anilist_trending_${page}_${perPage}`;
  const cached = getFromCache<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          currentPage
          total
        }
        media(type: ANIME, sort: TRENDING_DESC) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `;

  const data = await anilistQuery(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setInCache(cacheKey, result, 10 * 60 * 1000); // 10 minutes cache
  return result;
}

/**
 * 2. Fetch currently airing anime with next episode timestamps
 */
export async function getAiringAnime(
  page = 1,
  perPage = 15
): Promise<AniListMediaResponse> {
  const cacheKey = `anilist_airing_${page}_${perPage}`;
  const cached = getFromCache<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          currentPage
          total
        }
        media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `;

  const data = await anilistQuery(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setInCache(cacheKey, result, 3 * 60 * 1000); // 3 minutes cache
  return result;
}

/**
 * 3. Fetch seasonal anime dynamically
 */
export async function getSeasonalAnime(
  season?: string,
  seasonYear?: number,
  page = 1,
  perPage = 16
): Promise<SeasonalAnimeResponse> {
  const current = getCurrentSeason();
  const targetSeason = season || current.season;
  const targetYear = seasonYear || current.year;

  const cacheKey = `anilist_seasonal_${targetSeason}_${targetYear}_${page}_${perPage}`;
  const cached = getFromCache<SeasonalAnimeResponse>(cacheKey);
  if (cached) return cached;

  const query = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          currentPage
          total
        }
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `;

  const data = await anilistQuery(query, {
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

  setInCache(cacheKey, result, 10 * 60 * 1000);
  return result;
}

/**
 * 4. Fetch airing schedule with exact broadcast timestamps
 */
export async function getAiringSchedule(
  daysAhead = 7
): Promise<AiringScheduleItem[]> {
  const cacheKey = `anilist_schedule_${daysAhead}`;
  const cached = getFromCache<AiringScheduleItem[]>(cacheKey);
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const end = now + daysAhead * 86400;

  const query = `
    query ($airingAt_greater: Int, $airingAt_lesser: Int) {
      Page(page: 1, perPage: 50) {
        airingSchedules(airingAt_greater: $airingAt_greater, airingAt_lesser: $airingAt_lesser, sort: TIME) {
          id
          airingAt
          episode
          timeUntilAiring
          media {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    }
  `;

  const data = await anilistQuery(query, {
    airingAt_greater: now,
    airingAt_lesser: end,
  });

  const schedules = data.Page?.airingSchedules || [];
  setInCache(cacheKey, schedules, 2 * 60 * 1000);
  return schedules;
}

/**
 * 5. Fetch all-time popular anime
 */
export async function getPopularAnime(
  page = 1,
  perPage = 12
): Promise<AniListMediaResponse> {
  const cacheKey = `anilist_popular_${page}_${perPage}`;
  const cached = getFromCache<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          total
        }
        media(type: ANIME, sort: POPULARITY_DESC) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `;

  const data = await anilistQuery(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setInCache(cacheKey, result, 20 * 60 * 1000);
  return result;
}

/**
 * 6. Fetch upcoming anime
 */
export async function getUpcomingAnime(
  page = 1,
  perPage = 12
): Promise<AniListMediaResponse> {
  const cacheKey = `anilist_upcoming_${page}_${perPage}`;
  const cached = getFromCache<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          total
        }
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `;

  const data = await anilistQuery(query, { page, perPage });
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setInCache(cacheKey, result, 20 * 60 * 1000);
  return result;
}

/**
 * 7. Fetch full Anime details with characters, staff, relations, and recommendations
 */
export async function getAnimeDetails(id: number): Promise<AnimeMedia> {
  const cacheKey = `anilist_details_${id}`;
  const cached = getFromCache<AnimeMedia>(cacheKey);
  if (cached) return cached;

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FRAGMENT}
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

  const data = await anilistQuery(query, { id });
  const media = data.Media;
  if (!media) throw new AniListError(`Anime #${id} not found`, 404);

  setInCache(cacheKey, media, 60 * 60 * 1000);
  return media;
}

/**
 * 8. Search anime with rich filters
 */
export async function searchAnime(
  params: SearchFilterState = {}
): Promise<AniListMediaResponse> {
  const safeParams = params || {};
  const cacheKey = `anilist_search_${JSON.stringify(safeParams)}`;
  const cached = getFromCache<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

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
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `;

  const data = await anilistQuery(query, variables);
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setInCache(cacheKey, result, 5 * 60 * 1000);
  return result;
}

/**
 * 9. Fetch rankings
 */
export async function getRankings(
  category: 'AIRING' | 'RATED' | 'POPULAR' | 'UPCOMING' | 'MOVIES',
  page = 1,
  perPage = 20
): Promise<AniListMediaResponse> {
  const cacheKey = `anilist_rankings_${category}_${page}_${perPage}`;
  const cached = getFromCache<AniListMediaResponse>(cacheKey);
  if (cached) return cached;

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
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `;

  const data = await anilistQuery(query, variables);
  const result: AniListMediaResponse = {
    media: data.Page?.media || [],
    pageInfo: data.Page?.pageInfo || { hasNextPage: false },
  };

  setInCache(cacheKey, result, 15 * 60 * 1000);
  return result;
}
