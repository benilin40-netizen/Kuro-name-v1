/**
 * QWISH Anime - Personalized Recommendations Engine
 * 
 * Powered by a transparent, explainable heuristic:
 * 1. Analyzes user interaction history (favorites, watchlist status, watch history, continue watching)
 * 2. Computes weighted genre affinity & studio resonance scores
 * 3. Filters out already watched/favorited titles
 * 4. Ranks candidate anime by (Genre Affinity + Rating Score + Popularity Factor + Studio Boost)
 * 5. Generates human-friendly match reasons & affinity percentages
 */

import { AnimeMedia } from '../types/anime.ts';
import { AniListAPI, AniListMedia } from './anilistApi.ts';

export interface RecommendedAnime extends AnimeMedia {
  matchPercentage: number;
  recommendationReason: string;
  matchedGenres: string[];
}

export interface UserInteractionProfile {
  favouriteIds: Set<number>;
  watchlist: Array<{ anime_id: number; status?: string; score?: number }>;
  continueWatching: Array<{ anime_id: number | string; title?: string }>;
  recentViewIds?: number[];
}

export class RecommendationService {
  /**
   * Weights assigned to interaction types
   */
  private static WEIGHTS = {
    FAVORITE: 3.5,
    WATCHLIST_COMPLETED: 3.0,
    WATCHLIST_WATCHING: 2.5,
    CONTINUE_WATCHING: 2.5,
    WATCHLIST_HIGH_SCORE: 2.0, // score >= 8
    RECENT_VIEW: 1.5,
    WATCHLIST_PLANNED: 1.0,
  };

  /**
   * Computes genre weights from interacted anime metadata
   */
  public static computeGenreAffinities(
    profile: UserInteractionProfile,
    knownAnimeMap: Map<number, AnimeMedia>
  ): { genreScores: Map<string, number>; topGenres: string[]; studioSet: Set<string> } {
    const genreScores = new Map<string, number>();
    const studioSet = new Set<string>();

    const addGenreScore = (genre: string, weight: number) => {
      const g = genre.trim();
      genreScores.set(g, (genreScores.get(g) || 0) + weight);
    };

    // 1. Process Favorites (+3.5 each)
    for (const favId of profile.favouriteIds) {
      const anime = knownAnimeMap.get(favId);
      if (anime) {
        if (anime.genres) {
          for (const g of anime.genres) addGenreScore(g, this.WEIGHTS.FAVORITE);
        }
        if (anime.studios?.nodes) {
          for (const s of anime.studios.nodes) studioSet.add(s.name.toLowerCase());
        }
      }
    }

    // 2. Process Watchlist entries
    for (const item of profile.watchlist) {
      const anime = knownAnimeMap.get(item.anime_id);
      if (anime) {
        let weight = this.WEIGHTS.WATCHLIST_PLANNED;
        if (item.status === 'COMPLETED') weight = this.WEIGHTS.WATCHLIST_COMPLETED;
        else if (item.status === 'WATCHING') weight = this.WEIGHTS.WATCHLIST_WATCHING;

        if (item.score && item.score >= 8) weight += this.WEIGHTS.WATCHLIST_HIGH_SCORE;

        if (anime.genres) {
          for (const g of anime.genres) addGenreScore(g, weight);
        }
        if (anime.studios?.nodes) {
          for (const s of anime.studios.nodes) studioSet.add(s.name.toLowerCase());
        }
      }
    }

    // 3. Process Continue Watching / Watch History
    for (const cw of profile.continueWatching) {
      const numId = parseInt(String(cw.anime_id), 10);
      if (!isNaN(numId)) {
        const anime = knownAnimeMap.get(numId);
        if (anime && anime.genres) {
          for (const g of anime.genres) addGenreScore(g, this.WEIGHTS.CONTINUE_WATCHING);
        }
      }
    }

    // 4. Process Recent views
    if (profile.recentViewIds) {
      for (const rvId of profile.recentViewIds) {
        const anime = knownAnimeMap.get(rvId);
        if (anime && anime.genres) {
          for (const g of anime.genres) addGenreScore(g, this.WEIGHTS.RECENT_VIEW);
        }
      }
    }

    // Sort genres by accumulated score
    const topGenres = Array.from(genreScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre);

    return { genreScores, topGenres, studioSet };
  }

  /**
   * Generates personalized recommendations using interaction heuristics
   */
  public static async getPersonalizedRecommendations(
    profile: UserInteractionProfile,
    baseCandidates: AnimeMedia[],
    preferredGenresOverride?: string[]
  ): Promise<{
    recommendations: RecommendedAnime[];
    topUserGenres: string[];
    hasInteractions: boolean;
    heuristicSummary: string;
  }> {
    // 1. Build map of all known anime so far
    const knownAnimeMap = new Map<number, AnimeMedia>();
    for (const a of baseCandidates) {
      knownAnimeMap.set(a.id, a);
    }

    // Also fetch metadata for favorites/watchlist not in base pool if needed
    const missingIds: number[] = [];
    for (const favId of profile.favouriteIds) {
      if (!knownAnimeMap.has(favId)) missingIds.push(favId);
    }
    for (const wl of profile.watchlist) {
      if (!knownAnimeMap.has(wl.anime_id) && missingIds.length < 8) missingIds.push(wl.anime_id);
    }

    if (missingIds.length > 0) {
      const fetched = await Promise.allSettled(
        missingIds.slice(0, 6).map((id) => AniListAPI.getAnimeById(id))
      );
      for (const res of fetched) {
        if (res.status === 'fulfilled' && res.value) {
          knownAnimeMap.set(res.value.id, res.value as unknown as AnimeMedia);
        }
      }
    }

    // 2. Compute genre affinities
    let { genreScores, topGenres, studioSet } = this.computeGenreAffinities(profile, knownAnimeMap);

    // If manual genre override supplied by user interaction, boost those
    if (preferredGenresOverride && preferredGenresOverride.length > 0) {
      topGenres = Array.from(new Set([...preferredGenresOverride, ...topGenres]));
      for (const g of preferredGenresOverride) {
        genreScores.set(g, (genreScores.get(g) || 0) + 10);
      }
    }

    const hasInteractions =
      profile.favouriteIds.size > 0 ||
      profile.watchlist.length > 0 ||
      profile.continueWatching.length > 0 ||
      (profile.recentViewIds && profile.recentViewIds.length > 0) ||
      (preferredGenresOverride && preferredGenresOverride.length > 0);

    // IDs to exclude from suggestions (already completed, favorited, or actively in continue watching)
    const excludeIds = new Set<number>();
    for (const id of profile.favouriteIds) excludeIds.add(id);
    for (const wl of profile.watchlist) {
      if (wl.status === 'COMPLETED' || wl.status === 'WATCHING') {
        excludeIds.add(wl.anime_id);
      }
    }
    for (const cw of profile.continueWatching) {
      const numId = parseInt(String(cw.anime_id), 10);
      if (!isNaN(numId)) excludeIds.add(numId);
    }

    // 3. Gather candidate pool
    const candidateMap = new Map<number, AnimeMedia>();
    for (const a of baseCandidates) {
      if (!excludeIds.has(a.id)) {
        candidateMap.set(a.id, a);
      }
    }

    // Fetch genre-targeted anime if we have top user genres and candidate pool is small
    if (topGenres.length > 0 && candidateMap.size < 20) {
      const primaryGenre = topGenres[0];
      const secondaryGenre = topGenres[1] || primaryGenre;

      try {
        const [primaryResults, secondaryResults] = await Promise.all([
          AniListAPI.searchAnime('', 1, 10, primaryGenre).catch(() => ({ media: [] })),
          AniListAPI.searchAnime('', 1, 10, secondaryGenre).catch(() => ({ media: [] })),
        ]);

        for (const item of [...(primaryResults.media || []), ...(secondaryResults.media || [])]) {
          if (!excludeIds.has(item.id)) {
            candidateMap.set(item.id, item as unknown as AnimeMedia);
          }
        }
      } catch (_e) {}
    }

    const candidates = Array.from(candidateMap.values());

    // 4. Score each candidate with heuristic
    const scoredList: RecommendedAnime[] = [];

    const maxGenreWeight = Math.max(...Array.from(genreScores.values()), 1);

    for (const anime of candidates) {
      let genreScore = 0;
      const matchedGenres: string[] = [];

      if (anime.genres) {
        for (const g of anime.genres) {
          const affinity = genreScores.get(g) || 0;
          if (affinity > 0) {
            genreScore += affinity;
            matchedGenres.push(g);
          }
        }
      }

      // Quality factor (AniList community average score)
      const avgScore = anime.averageScore || 75;
      const qualityScore = (avgScore / 100) * 25; // 0 - 25 pts

      // Studio boost
      let studioBonus = 0;
      if (anime.studios?.nodes) {
        for (const s of anime.studios.nodes) {
          if (studioSet.has(s.name.toLowerCase())) {
            studioBonus = 12;
            break;
          }
        }
      }

      // Popularity stability
      const popularityBonus = Math.min(10, Math.log10(anime.popularity || 1000) * 2);

      // Combined affinity score
      const normalizedGenre = hasInteractions ? (genreScore / (maxGenreWeight * 2)) * 50 : 25;
      const totalScore = normalizedGenre + qualityScore + studioBonus + popularityBonus;

      // Calculate 0-100% Match percentage (scaled between 80% and 99%)
      const matchPercentage = Math.min(
        99,
        Math.max(80, Math.round(75 + (totalScore / 100) * 24))
      );

      // Generate explainable heuristic reason
      let recommendationReason = 'High community rating & popularity';
      if (matchedGenres.length >= 2) {
        recommendationReason = `Because you like ${matchedGenres.slice(0, 2).join(' & ')}`;
      } else if (matchedGenres.length === 1) {
        recommendationReason = `Matches your preference for ${matchedGenres[0]}`;
      } else if (studioBonus > 0) {
        recommendationReason = 'From a studio you have enjoyed';
      } else if (avgScore >= 85) {
        recommendationReason = `Critically acclaimed (${avgScore}% community score)`;
      }

      scoredList.push({
        ...anime,
        matchPercentage,
        recommendationReason,
        matchedGenres,
      });
    }

    // 5. Sort candidates by match percentage & score descending
    scoredList.sort((a, b) => {
      if (b.matchPercentage !== a.matchPercentage) {
        return b.matchPercentage - a.matchPercentage;
      }
      return (b.averageScore || 0) - (a.averageScore || 0);
    });

    const recommendations = scoredList.slice(0, 10);

    const heuristicSummary = hasInteractions
      ? `Weighted by ${topGenres.slice(0, 3).join(', ')} affinity and community score`
      : 'Curated starter suggestions • Favorite or watch titles to fine-tune';

    return {
      recommendations,
      topUserGenres: topGenres.slice(0, 4),
      hasInteractions: Boolean(hasInteractions),
      heuristicSummary,
    };
  }
}
