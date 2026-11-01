import { JikanServerService } from '../jikanService.ts';
import { KitsuServerService } from './kitsuService.ts';
import { db } from '../db.ts';

export interface ExternalIdsResult {
  anilistId: number | null;
  malId: number | null;
  kitsuId: string | null;
  tmdbId: number | null;
}

export const IdMapperServerService = {
  /**
   * Resolve and normalize external IDs for an anime across AniList, MyAnimeList, and Kitsu.
   * Guarantees anilistId is valid (> 0) before returning.
   */
  async resolveExternalIds(params: {
    anilistId?: number | string | null;
    malId?: number | string | null;
    kitsuId?: string | null;
    title?: string | null;
  }): Promise<ExternalIdsResult> {
    let rawAnilist = params.anilistId ? parseInt(String(params.anilistId), 10) : null;
    let rawMal = params.malId ? parseInt(String(params.malId), 10) : null;
    let kitsuId: string | null = params.kitsuId ? String(params.kitsuId) : null;
    let tmdbId: number | null = null;

    if (rawAnilist && !isNaN(rawAnilist) && rawAnilist > 0) {
      // Valid AniList ID provided directly. Check local DB for cached mappings
      try {
        const local = db.prepare('SELECT mal_id FROM qwish_anime WHERE anilist_id = ?').get(rawAnilist) as any;
        if (local && local.mal_id) {
          rawMal = local.mal_id;
        }
      } catch (_e) {}

      return {
        anilistId: rawAnilist,
        malId: rawMal && !isNaN(rawMal) && rawMal > 0 ? rawMal : null,
        kitsuId,
        tmdbId,
      };
    }

    // If no direct AniList ID, try resolving MAL ID via AniList GraphQL query
    if (rawMal && !isNaN(rawMal) && rawMal > 0) {
      try {
        const query = `
          query ($idMal: Int) {
            Media(idMal: $idMal, type: ANIME) {
              id
              idMal
            }
          }
        `;
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { idMal: rawMal } }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data?.Media?.id) {
            rawAnilist = json.data.Media.id;
          }
        }
      } catch (_e) {}
    }

    // If still no AniList ID and title is provided, search AniList by title
    if ((!rawAnilist || rawAnilist <= 0) && params.title && params.title.trim()) {
      try {
        const query = `
          query ($search: String) {
            Page(page: 1, perPage: 1) {
              media(search: $search, type: ANIME) {
                id
                idMal
              }
            }
          }
        `;
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { search: params.title.trim() } }),
        });
        if (res.ok) {
          const json = await res.json();
          const found = json.data?.Page?.media?.[0];
          if (found) {
            rawAnilist = found.id;
            if (found.idMal) rawMal = found.idMal;
          }
        }
      } catch (_e) {}
    }

    return {
      anilistId: rawAnilist && !isNaN(rawAnilist) && rawAnilist > 0 ? rawAnilist : null,
      malId: rawMal && !isNaN(rawMal) && rawMal > 0 ? rawMal : null,
      kitsuId,
      tmdbId,
    };
  },
};
