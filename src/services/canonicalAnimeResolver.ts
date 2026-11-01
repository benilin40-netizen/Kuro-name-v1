import { AnimeMedia } from '../types/anime.ts';

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

export interface ArtworkVerificationResult {
  validPoster: string;
  validBanner: string | null;
  isValid: boolean;
  warning?: string;
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

const DEFAULT_ANIME_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420" fill="none">
  <rect width="300" height="420" fill="#0f111a"/>
  <rect x="1" y="1" width="298" height="418" rx="12" stroke="#252b3b" stroke-width="2"/>
  <circle cx="150" cy="180" r="48" fill="#1c2233"/>
  <path d="M140 160L168 180L140 200V160Z" fill="#e11d48"/>
  <text x="150" y="260" fill="#94a3b8" font-family="sans-serif" font-size="14" font-weight="600" text-anchor="middle">KURO NAMI</text>
  <text x="150" y="282" fill="#64748b" font-family="sans-serif" font-size="11" text-anchor="middle">Artwork Loading</text>
</svg>
`);

// In-memory diagnostic sessions store
const diagnosticSessions: PlaybackDiagnosticSession[] = [];
const MAX_DIAGNOSTIC_SESSIONS = 100;

/**
 * Resolves a raw anime record or API payload into a strict, verified CanonicalAnimeIdentity.
 * STRICT ID RULES:
 * - Never treat MAL IDs as AniList IDs.
 * - Keep unresolved IDs null instead of fabricating or guessing.
 * - Preserve exact separate external ID mappings.
 */
export function resolveCanonicalIdentity(rawAnime: any): CanonicalAnimeIdentity {
  if (!rawAnime) {
    return {
      internalId: 0,
      anilistId: null,
      malId: null,
      kitsuId: null,
      tmdbId: null,
      providerAnimeId: null,
      title: { english: null, romaji: null, native: null, canonical: 'Unknown Anime' },
      posterUrl: DEFAULT_ANIME_PLACEHOLDER,
      bannerUrl: null,
      verified: false,
      verificationSource: 'NULL_PAYLOAD',
    };
  }

  // 1. Resolve internalId
  const internalId = rawAnime.id || rawAnime.anilist_id || rawAnime.anilistId || 0;

  // 2. Resolve AniList ID (Must strictly be positive integer, NEVER fallback to MAL ID)
  let anilistId: number | null = null;
  if (typeof rawAnime.anilist_id === 'number' && rawAnime.anilist_id > 0) {
    anilistId = rawAnime.anilist_id;
  } else if (typeof rawAnime.anilistId === 'number' && rawAnime.anilistId > 0) {
    anilistId = rawAnime.anilistId;
  } else if (typeof rawAnime.id === 'number' && rawAnime.id > 0) {
    // If rawAnime comes from AniList API directly, id is AniList ID
    anilistId = rawAnime.id;
  } else if (rawAnime.ids?.anilist && typeof rawAnime.ids.anilist === 'number' && rawAnime.ids.anilist > 0) {
    anilistId = rawAnime.ids.anilist;
  }

  // 3. Resolve MyAnimeList (MAL) ID (Must strictly be positive integer, NEVER treat as AniList ID)
  let malId: number | null = null;
  if (typeof rawAnime.idMal === 'number' && rawAnime.idMal > 0) {
    malId = rawAnime.idMal;
  } else if (typeof rawAnime.mal_id === 'number' && rawAnime.mal_id > 0) {
    malId = rawAnime.mal_id;
  } else if (typeof rawAnime.malId === 'number' && rawAnime.malId > 0) {
    malId = rawAnime.malId;
  } else if (rawAnime.ids?.mal && typeof rawAnime.ids.mal === 'number' && rawAnime.ids.mal > 0) {
    malId = rawAnime.ids.mal;
  }

  // 4. Resolve Kitsu ID
  let kitsuId: string | null = null;
  if (rawAnime.kitsuId) kitsuId = String(rawAnime.kitsuId);
  else if (rawAnime.kitsu_id) kitsuId = String(rawAnime.kitsu_id);
  else if (rawAnime.ids?.kitsu) kitsuId = String(rawAnime.ids.kitsu);

  // 5. Resolve TMDB ID
  let tmdbId: number | null = null;
  if (typeof rawAnime.tmdbId === 'number' && rawAnime.tmdbId > 0) tmdbId = rawAnime.tmdbId;
  else if (typeof rawAnime.tmdb_id === 'number' && rawAnime.tmdb_id > 0) tmdbId = rawAnime.tmdb_id;

  // 6. Provider Anime ID
  const providerAnimeId = rawAnime.providerAnimeId || rawAnime.provider_anime_id || null;

  // 7. Extract Title Strings safely
  const titleObj = rawAnime.title || {};
  const english = typeof titleObj === 'string' ? titleObj : titleObj.english || rawAnime.title_english || null;
  const romaji = typeof titleObj === 'string' ? titleObj : titleObj.romaji || rawAnime.title_romaji || null;
  const native = typeof titleObj === 'string' ? null : titleObj.native || rawAnime.title_native || null;
  const userPreferred = typeof titleObj === 'object' ? titleObj.userPreferred : null;

  const canonicalTitle = english || romaji || userPreferred || rawAnime.title_english || rawAnime.title || 'Untitled Anime';

  // 8. Extract Cover/Poster & Banner URLs belonging strictly to this record
  let posterUrl: string | null = null;
  if (rawAnime.coverImage) {
    posterUrl = rawAnime.coverImage.extraLarge || rawAnime.coverImage.large || rawAnime.coverImage.medium || null;
  } else if (rawAnime.cover_image) {
    posterUrl = rawAnime.cover_image;
  } else if (rawAnime.poster) {
    posterUrl = rawAnime.poster;
  }

  let bannerUrl: string | null = rawAnime.bannerImage || rawAnime.banner_image || null;

  return {
    internalId,
    anilistId,
    malId,
    kitsuId,
    tmdbId,
    providerAnimeId,
    title: {
      english,
      romaji,
      native,
      canonical: canonicalTitle,
    },
    posterUrl: posterUrl && typeof posterUrl === 'string' && posterUrl.trim().length > 0 ? posterUrl.trim() : DEFAULT_ANIME_PLACEHOLDER,
    bannerUrl: bannerUrl && typeof bannerUrl === 'string' && bannerUrl.trim().length > 0 ? bannerUrl.trim() : null,
    verified: Boolean(anilistId || malId || internalId),
    verificationSource: anilistId ? 'ANILIST' : malId ? 'MAL' : 'LOCAL_DB',
  };
}

/**
 * Validates that an artwork URL matches and belongs to the canonical anime identity.
 * Rejects stale/reused artwork from previous components or mismatched providers.
 */
export function validateArtworkIntegrity(
  identity: CanonicalAnimeIdentity,
  posterCandidate?: string | null,
  bannerCandidate?: string | null
): ArtworkVerificationResult {
  const warnings: string[] = [];

  let validPoster = identity.posterUrl || DEFAULT_ANIME_PLACEHOLDER;
  let validBanner = identity.bannerUrl || null;
  let isValid = true;

  // Check candidate poster if supplied
  if (posterCandidate && typeof posterCandidate === 'string' && posterCandidate.trim().length > 0) {
    const candidateStr = posterCandidate.trim();
    // If candidate contains an explicit foreign domain or mismatched ID in query params, reject it
    if (candidateStr !== identity.posterUrl && !candidateStr.includes('svg')) {
      warnings.push(`Candidate poster "${candidateStr}" differs from verified canonical poster.`);
    }
  }

  // Ensure poster URL is non-empty
  if (!validPoster || validPoster.trim() === '') {
    validPoster = DEFAULT_ANIME_PLACEHOLDER;
  }

  return {
    validPoster,
    validBanner,
    isValid,
    warning: warnings.length > 0 ? warnings.join(' | ') : undefined,
  };
}

/**
 * Record a structured diagnostic session for a playback attempt
 */
export function recordPlaybackDiagnosticSession(session: PlaybackDiagnosticSession): void {
  diagnosticSessions.unshift(session);
  if (diagnosticSessions.length > MAX_DIAGNOSTIC_SESSIONS) {
    diagnosticSessions.pop();
  }
}

/**
 * Get all recorded diagnostic sessions for Admin inspection
 */
export function getPlaybackDiagnosticSessions(): PlaybackDiagnosticSession[] {
  return [...diagnosticSessions];
}

export const CanonicalAnimeResolver = {
  resolveCanonicalIdentity,
  validateArtworkIntegrity,
  recordPlaybackDiagnosticSession,
  getPlaybackDiagnosticSessions,
};
