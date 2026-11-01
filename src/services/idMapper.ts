import { AnimeExternalIds } from '../types/anime.ts';

export async function resolveAnimeExternalIds(params: {
  anilistId?: number | string | null;
  malId?: number | string | null;
  kitsuId?: string | null;
  title?: string | null;
}): Promise<AnimeExternalIds> {
  try {
    const queryParams = new URLSearchParams();
    if (params.anilistId) queryParams.set('anilistId', String(params.anilistId));
    if (params.malId) queryParams.set('malId', String(params.malId));
    if (params.kitsuId) queryParams.set('kitsuId', params.kitsuId);
    if (params.title) queryParams.set('title', params.title);

    const res = await fetch(`/api/id-mapper/resolve?${queryParams.toString()}`);
    if (!res.ok) throw new Error(`IdMapper HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.warn('[ID MAPPER CLIENT]', err.message);
    const parsedAnilist = params.anilistId ? parseInt(String(params.anilistId), 10) : null;
    const parsedMal = params.malId ? parseInt(String(params.malId), 10) : null;
    return {
      anilistId: parsedAnilist && !isNaN(parsedAnilist) && parsedAnilist > 0 ? parsedAnilist : null,
      malId: parsedMal && !isNaN(parsedMal) && parsedMal > 0 ? parsedMal : null,
      kitsuId: params.kitsuId || null,
      tmdbId: null,
    };
  }
}
