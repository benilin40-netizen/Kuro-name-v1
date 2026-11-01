import { fetchFullCatalog } from './munoService.ts';
import { AnimeMedia } from '../types/anime.ts';

/**
 * Fetches media items from catalog through munoService
 */
export async function getMedia(): Promise<AnimeMedia[]> {
  try {
    const media = await fetchFullCatalog();
    return media;
  } catch (err: any) {
    console.error('getMedia catalogue fetch failed:', err);
    throw err;
  }
}

export const api = {
  getMedia,
  fetchFullCatalog,
};

export default api;
