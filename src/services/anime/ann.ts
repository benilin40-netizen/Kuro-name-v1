import { AnimeMedia } from '../../types/anime.ts';

export const ANN_BASE_URL = 'https://www.animenewsnetwork.com/encyclopedia/api.php';

export interface ANNAnimeDetails {
  id: number;
  title: string;
  type?: string;
  vintage?: string;
  episodes?: number;
  synopsis?: string;
  genres?: string[];
  studios?: string[];
  alternativeTitles?: string[];
  rawXml?: string;
}

/**
 * Parses XML string returned from Anime News Network Encyclopedia API
 */
export function parseANNResponse(xmlString: string): ANNAnimeDetails[] {
  if (!xmlString) return [];

  const results: ANNAnimeDetails[] = [];

  try {
    if (typeof window !== 'undefined' && window.DOMParser) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'text/xml');
      const animeNodes = doc.querySelectorAll('anime, manga');

      animeNodes.forEach((node) => {
        const id = parseInt(node.getAttribute('id') || '0', 10);
        const title = node.getAttribute('name') || node.querySelector('info[type="Main title"]')?.textContent || 'Unknown Title';
        const type = node.getAttribute('type') || 'TV';

        const genres: string[] = [];
        const studios: string[] = [];
        const altTitles: string[] = [];
        let synopsis = '';
        let episodes = 0;
        let vintage = '';

        node.querySelectorAll('info').forEach((info) => {
          const typeAttr = info.getAttribute('type');
          const val = info.textContent?.trim() || '';

          if (typeAttr === 'Genres') genres.push(val);
          else if (typeAttr === 'Plot Summary') synopsis = val;
          else if (typeAttr === 'Number of episodes') episodes = parseInt(val, 10) || 0;
          else if (typeAttr === 'Vintage') vintage = val;
          else if (typeAttr === 'Alternative title') altTitles.push(val);
        });

        node.querySelectorAll('staff').forEach((staff) => {
          const task = staff.querySelector('task')?.textContent || '';
          if (task.toLowerCase().includes('animation production') || task.toLowerCase().includes('studio')) {
            const studioName = staff.querySelector('person')?.textContent || '';
            if (studioName && !studios.includes(studioName)) {
              studios.push(studioName);
            }
          }
        });

        results.push({
          id,
          title,
          type,
          vintage,
          episodes,
          synopsis,
          genres,
          studios,
          alternativeTitles: altTitles,
          rawXml: xmlString,
        });
      });
    }
  } catch (err) {
    console.warn('[ANN PARSER] XML parse error:', err);
  }

  return results;
}

/**
 * Search Anime News Network Encyclopedia for title query
 */
export async function searchANNAnime(query: string): Promise<ANNAnimeDetails[]> {
  if (!query) return [];

  try {
    const url = `${ANN_BASE_URL}?title=~${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const xml = await res.text();
    return parseANNResponse(xml);
  } catch (err) {
    console.error('[ANN SERVICE] searchANNAnime failed:', err);
    return [];
  }
}

/**
 * Fetch specific anime by ANN ID
 */
export async function getANNAnime(id: number): Promise<ANNAnimeDetails | null> {
  if (!id) return null;

  try {
    const url = `${ANN_BASE_URL}?anime=${id}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const xml = await res.text();
    const list = parseANNResponse(xml);
    return list[0] || null;
  } catch (err) {
    console.error('[ANN SERVICE] getANNAnime failed:', err);
    return null;
  }
}

/**
 * Convert ANN details to common AnimeMedia model
 */
export function mapANNToAnimeMedia(ann: ANNAnimeDetails): AnimeMedia {
  return {
    id: ann.id,
    idMal: null,
    title: {
      romaji: ann.title,
      english: ann.alternativeTitles?.[0] || ann.title,
      native: null,
    },
    description: ann.synopsis || null,
    bannerImage: null,
    coverImage: {
      extraLarge: '',
      large: '',
      medium: '',
      color: null,
    },
    format: ann.type || 'TV',
    status: 'FINISHED',
    episodes: ann.episodes || null,
    duration: null,
    season: null,
    seasonYear: ann.vintage ? parseInt(ann.vintage, 10) || null : null,
    averageScore: null,
    meanScore: null,
    popularity: 0,
    genres: ann.genres || [],
    studios: {
      nodes: (ann.studios || []).map((s, idx) => ({ id: idx + 1, name: s })),
    },
    nextAiringEpisode: null,
    trailer: null,
  };
}

export const ANNService = {
  parseANNResponse,
  searchANNAnime,
  getANNAnime,
  mapANNToAnimeMedia,
};

export default ANNService;
