import { NormalizedEpisodeSources, StreamingSource, BestSourceResult } from '../types/anime.ts';
import { getEpisodeSources, getBestEpisodeSource } from './streamingApi.ts';

export interface Provider {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  health: 'online' | 'degraded' | 'offline';
}

/**
 * Resolves available episode sources through configured streaming providers
 * with fallback, quality sorting, and health verification.
 */
export async function resolveEpisodeSources(
  animeId: number,
  episodeNumber: number,
  seasonNumber = 1
): Promise<NormalizedEpisodeSources> {
  return getEpisodeSources(animeId, episodeNumber, seasonNumber);
}

/**
 * Selects the optimal healthy source for an episode
 */
export async function resolveBestSource(
  animeId: number,
  episodeNumber: number,
  seasonNumber = 1,
  preferredQuality = '1080p',
  preferredLanguage?: 'sub' | 'dub'
): Promise<BestSourceResult> {
  return getBestEpisodeSource(animeId, episodeNumber, seasonNumber, preferredQuality, preferredLanguage);
}

export const streamingResolver = {
  resolveEpisodeSources,
  resolveBestSource,
};

export default streamingResolver;
