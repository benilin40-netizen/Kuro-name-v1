export interface CanonicalAnimeIdentity {
  internalId: number | string;
  anilistId: number | null;
  malId: number | null;
  kitsuId: string | null;
  tmdbId: number | null;
  providerAnimeId: string | null;
  title: {
    english: string | null;
    romaji: string | null;
    native: string | null;
    canonical: string;
  };
  posterUrl: string | null;
  bannerUrl: string | null;
  verified: boolean;
  verificationSource?: string;
}

export interface PlaybackDiagnosticSession {
  sessionId: string;
  timestamp: string;
  canonicalAnimeId: number | string;
  anilistId: number | null;
  malId: number | null;
  providerName: string;
  providerAnimeId: string | null;
  providerEpisodeId: string | null;
  selectedEpisode: number;
  selectedLanguage: string;
  resolvedPlaybackUrl: string | null;
  metadataSource: string;
  artworkSource: string;
  artworkVerificationResult: 'VERIFIED' | 'REJECTED_MISMATCH' | 'FALLBACK_NEUTRAL';
  playbackInitializationResult: 'SUCCESS' | 'FAILED_TIMEOUT' | 'UNAVAILABLE' | 'MISMATCH_PREVENTED';
  providerFallbackReason?: string;
  warnings: string[];
}

const serverDiagnosticSessions: PlaybackDiagnosticSession[] = [];
const MAX_SERVER_SESSIONS = 150;

/**
 * Resolves a raw anime payload into a verified CanonicalAnimeIdentity on the server side.
 * Enforces strict ID isolation rules.
 */
export function resolveServerCanonicalIdentity(rawAnime: any): CanonicalAnimeIdentity {
  if (!rawAnime) {
    return {
      internalId: 0,
      anilistId: null,
      malId: null,
      kitsuId: null,
      tmdbId: null,
      providerAnimeId: null,
      title: { english: null, romaji: null, native: null, canonical: 'Unknown Anime' },
      posterUrl: null,
      bannerUrl: null,
      verified: false,
      verificationSource: 'NULL_PAYLOAD',
    };
  }

  const internalId = rawAnime.id || rawAnime.anilist_id || rawAnime.anilistId || 0;

  let anilistId: number | null = null;
  if (typeof rawAnime.anilist_id === 'number' && rawAnime.anilist_id > 0) {
    anilistId = rawAnime.anilist_id;
  } else if (typeof rawAnime.anilistId === 'number' && rawAnime.anilistId > 0) {
    anilistId = rawAnime.anilistId;
  } else if (typeof rawAnime.id === 'number' && rawAnime.id > 0) {
    anilistId = rawAnime.id;
  }

  let malId: number | null = null;
  if (typeof rawAnime.idMal === 'number' && rawAnime.idMal > 0) {
    malId = rawAnime.idMal;
  } else if (typeof rawAnime.mal_id === 'number' && rawAnime.mal_id > 0) {
    malId = rawAnime.mal_id;
  } else if (typeof rawAnime.malId === 'number' && rawAnime.malId > 0) {
    malId = rawAnime.malId;
  }

  let kitsuId: string | null = null;
  if (rawAnime.kitsuId) kitsuId = String(rawAnime.kitsuId);
  else if (rawAnime.kitsu_id) kitsuId = String(rawAnime.kitsu_id);

  let tmdbId: number | null = null;
  if (typeof rawAnime.tmdbId === 'number' && rawAnime.tmdbId > 0) tmdbId = rawAnime.tmdbId;
  else if (typeof rawAnime.tmdb_id === 'number' && rawAnime.tmdb_id > 0) tmdbId = rawAnime.tmdb_id;

  const providerAnimeId = rawAnime.providerAnimeId || rawAnime.provider_anime_id || null;

  const titleObj = rawAnime.title || {};
  const english = typeof titleObj === 'string' ? titleObj : titleObj.english || rawAnime.title_english || null;
  const romaji = typeof titleObj === 'string' ? titleObj : titleObj.romaji || rawAnime.title_romaji || null;
  const native = typeof titleObj === 'string' ? null : titleObj.native || rawAnime.title_native || null;
  const canonicalTitle = english || romaji || rawAnime.title_english || rawAnime.title || 'Untitled Anime';

  let posterUrl: string | null = null;
  if (rawAnime.coverImage) {
    posterUrl = rawAnime.coverImage.extraLarge || rawAnime.coverImage.large || rawAnime.coverImage.medium || null;
  } else if (rawAnime.cover_image) {
    posterUrl = rawAnime.cover_image;
  } else if (rawAnime.poster) {
    posterUrl = rawAnime.poster;
  }

  const bannerUrl = rawAnime.bannerImage || rawAnime.banner_image || null;

  return {
    internalId,
    anilistId,
    malId,
    kitsuId,
    tmdbId,
    providerAnimeId,
    title: { english, romaji, native, canonical: canonicalTitle },
    posterUrl,
    bannerUrl,
    verified: Boolean(anilistId || malId || internalId),
    verificationSource: anilistId ? 'ANILIST' : malId ? 'MAL' : 'LOCAL_DB',
  };
}

export function recordServerPlaybackSession(session: PlaybackDiagnosticSession): void {
  serverDiagnosticSessions.unshift(session);
  if (serverDiagnosticSessions.length > MAX_SERVER_SESSIONS) {
    serverDiagnosticSessions.pop();
  }
}

export function getServerPlaybackSessions(): PlaybackDiagnosticSession[] {
  return [...serverDiagnosticSessions];
}

export const ServerCanonicalAnimeResolver = {
  resolveServerCanonicalIdentity,
  recordServerPlaybackSession,
  getServerPlaybackSessions,
};
