import { AnimeMedia } from '../types/anime.ts';

// In-flight request promise deduplication
let catalogRequestPromise: Promise<AnimeMedia[]> | null = null;

/**
 * Fetches the anime catalog from the local backend catalog service.
 */
export async function fetchFullCatalog(): Promise<AnimeMedia[]> {
  if (catalogRequestPromise) {
    return catalogRequestPromise;
  }

  catalogRequestPromise = (async () => {
    try {
      const res = await fetch('/api/anime/recent?page=1&perPage=50');
      if (!res.ok) {
        throw new Error(`Local catalog service responded with status ${res.status}`);
      }
      const data = await res.json();
      const mediaList = Array.isArray(data)
        ? data
        : data?.media || data?.items || [];

      if (!Array.isArray(mediaList)) {
        throw new Error('Invalid catalog response format');
      }
      return mediaList;
    } catch (err: any) {
      console.error('Local catalog load failed:', err);
      throw new Error(`Catalog load failed: ${err?.message || 'Catalog service unreachable'}`);
    }
  })().finally(() => {
    catalogRequestPromise = null;
  });

  return catalogRequestPromise;
}

export const munoService = {
  fetchFullCatalog,
};

export default munoService;
