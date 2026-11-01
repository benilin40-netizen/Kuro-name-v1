import { AnimeMedia } from '../types/anime.ts';
import { AniListAPI } from './anilistApi.ts';

// In-flight request promise deduplication
let catalogRequestPromise: Promise<AnimeMedia[]> | null = null;

/**
 * Fetches the anime catalog using a resilient multi-tier loading sequence:
 * 1. Primary backend catalog endpoint (/api/catalog)
 * 2. Secondary backend recent endpoint (/api/anime/recent)
 * 3. Client-side AniList GraphQL API
 */
export async function fetchFullCatalog(): Promise<AnimeMedia[]> {
  if (catalogRequestPromise) {
    return catalogRequestPromise;
  }

  catalogRequestPromise = (async () => {
    // Helper to safely parse JSON response and verify content-type
    const fetchJsonSafely = async (url: string, timeoutMs = 8000) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`HTTP status ${res.status}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Received non-JSON response (HTML document or proxy fallback)');
        }

        const data = await res.json();
        const mediaList = Array.isArray(data)
          ? data
          : data?.media || data?.items || data?.catalog || [];

        if (Array.isArray(mediaList) && mediaList.length > 0) {
          return mediaList as AnimeMedia[];
        }
        throw new Error('Empty media array in catalog response');
      } catch (err: any) {
        clearTimeout(timeout);
        throw err;
      }
    };

    // Tier 1: Primary Central Backend Catalog Endpoint (/api/catalog)
    try {
      return await fetchJsonSafely('/api/catalog?page=1&perPage=50');
    } catch (tier1Error: any) {
      console.warn('[CATALOG TIER 1] /api/catalog failed, attempting Tier 2:', tier1Error.message);
    }

    // Tier 2: Secondary Backend Recent Endpoint (/api/anime/recent)
    try {
      return await fetchJsonSafely('/api/anime/recent?page=1&perPage=50');
    } catch (tier2Error: any) {
      console.warn('[CATALOG TIER 2] /api/anime/recent failed, attempting Tier 3 AniList GraphQL:', tier2Error.message);
    }

    // Tier 3: Direct Client-Side AniList GraphQL Call
    try {
      const aniListRes = await AniListAPI.getTrendingAnime(1, 50);
      if (aniListRes.media && aniListRes.media.length > 0) {
        return aniListRes.media as unknown as AnimeMedia[];
      }
    } catch (tier3Error: any) {
      console.warn('[CATALOG TIER 3] AniList GraphQL direct call failed:', tier3Error.message);
    }

    // All tiers exhausted -> throw explicit catalog error
    throw new Error('Catalog load failed: Both backend and external catalog sources are unreachable');
  })().finally(() => {
    catalogRequestPromise = null;
  });

  return catalogRequestPromise;
}

export const munoService = {
  fetchFullCatalog,
};

export default munoService;
