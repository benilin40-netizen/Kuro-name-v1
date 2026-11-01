import { AnimeMedia } from '../types/anime.ts';

export async function searchKitsuAnime(query: string, limit = 20, offset = 0): Promise<{ media: AnimeMedia[]; total: number }> {
  try {
    const res = await fetch(`/api/kitsu/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`Kitsu search HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.warn('[KITSU API CLIENT]', err.message);
    return { media: [], total: 0 };
  }
}

export async function getKitsuAnimeDetails(id: string): Promise<AnimeMedia | null> {
  try {
    const res = await fetch(`/api/kitsu/anime/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err: any) {
    console.warn('[KITSU API CLIENT]', err.message);
    return null;
  }
}

export async function getKitsuTrending(): Promise<{ media: AnimeMedia[]; total: number }> {
  try {
    const res = await fetch('/api/kitsu/trending');
    if (!res.ok) throw new Error(`Kitsu trending HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.warn('[KITSU API CLIENT]', err.message);
    return { media: [], total: 0 };
  }
}

export async function getKitsuCategories(): Promise<any[]> {
  try {
    const res = await fetch('/api/kitsu/categories');
    if (!res.ok) return [];
    return await res.json();
  } catch (err: any) {
    console.warn('[KITSU API CLIENT]', err.message);
    return [];
  }
}

export const KitsuAPI = {
  searchAnime: searchKitsuAnime,
  getAnimeDetails: getKitsuAnimeDetails,
  getTrending: getKitsuTrending,
  getCategories: getKitsuCategories,
};
