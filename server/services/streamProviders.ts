/**
 * CoorenLabs Anime & Streaming Provider Integration
 * 
 * Official documentation & repositories:
 * - Documentation: https://docs.coorenlabs.com/provider/anime
 * - AnimePahe routes: https://docs.coorenlabs.com/provider/anime/animepahe
 * - ToonStream routes: https://docs.coorenlabs.com/provider/anime/toonstream
 * - Configuration guide: https://docs.coorenlabs.com/getting-started/configuration
 * - Repository: https://github.com/CoorenLabs/CoorenLabs
 */

import { db } from '../db.ts';

export interface StreamVariantOption {
  title?: string;
  quality: string;
  language: string;
  proxiedUrl?: string;
  directUrl?: string;
  url?: string;
  downloadUrl?: string;
  provider: string;
  session?: string;
  headers?: Record<string, string>;
}

export interface CoorenHealthResult {
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  docsReachable: boolean;
  apiName?: string;
  version?: string;
  message: string;
  status?: string;
  latencyMs?: number;
  source?: 'env' | 'database' | 'local_dev' | 'unconfigured';
}

export function getCoorenLabsBaseUrl(): string {
  // 1. Support COOREN_API_BASE_URL (standard) & COORENLABS_API_BASE_URL from env
  const fromEnv = (process.env.COOREN_API_BASE_URL || process.env.COORENLABS_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;

  // 2. Check persisted site_settings in database
  try {
    const row = db.prepare("SELECT value FROM site_settings WHERE key = 'cooren_api_base_url'").get() as any;
    if (row && row.value && typeof row.value === 'string' && row.value.trim().startsWith('http')) {
      return row.value.trim().replace(/\/+$/, '');
    }
  } catch {}

  return 'https://coorenlabs-2.onrender.com';
}

export function setCoorenLabsBaseUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  db.prepare(`
    INSERT INTO site_settings (key, value) VALUES ('cooren_api_base_url', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(clean);
}

function fixProxiedUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('localhost:3000') || trimmed.includes('127.0.0.1:3000') || trimmed.includes('localhost:4000') || trimmed.includes('127.0.0.1:4000')) {
    try {
      const parsed = new URL(trimmed);
      const baseParsed = new URL(baseUrl);
      parsed.protocol = baseParsed.protocol;
      parsed.host = baseParsed.host;
      return parsed.toString();
    } catch {
      return trimmed.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, baseUrl);
    }
  }
  return trimmed;
}

/**
 * Validates the CoorenLabs API server:
 * 1. Checks GET / for operational status
 * 2. Checks GET /docs for OpenAPI documentation
 */
export async function checkCoorenLabsHealth(targetUrl?: string): Promise<CoorenHealthResult> {
  const baseUrl = (targetUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return {
      configured: false,
      reachable: false,
      baseUrl: '',
      docsReachable: false,
      message: 'COOREN_API_BASE_URL is not configured. Set COOREN_API_BASE_URL=https://YOUR-DEPLOYED-DOMAIN in server environment variables or deploy CoorenLabs.',
    };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    // 1. Check Root Endpoint (/)
    const rootRes = await fetch(`${baseUrl}/`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }).catch(() => null);

    // 2. Check Documentation Endpoint (/docs)
    const docsRes = await fetch(`${baseUrl}/docs`, {
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeout);
    const latencyMs = Date.now() - startTime;

    if (rootRes && rootRes.ok) {
      const data = await rootRes.json().catch(() => ({}));
      const docsReachable = docsRes ? docsRes.status < 400 : false;
      return {
        configured: true,
        reachable: true,
        baseUrl,
        docsReachable,
        apiName: data.name || 'Cooren API',
        version: data.version || '3.0.0',
        status: data.status || 'operational',
        latencyMs,
        message: `CoorenLabs API server is online and operational (${latencyMs}ms). Documentation: ${docsReachable ? 'Verified' : 'Unavailable'}.`,
      };
    }

    return {
      configured: true,
      reachable: false,
      baseUrl,
      docsReachable: docsRes ? docsRes.status < 400 : false,
      message: `CoorenLabs API responded with HTTP ${rootRes?.status || 'unreachable'}. Verify the server is running and accessible.`,
    };
  } catch (err: any) {
    return {
      configured: true,
      reachable: false,
      baseUrl,
      docsReachable: false,
      message: `Failed to reach CoorenLabs API at ${baseUrl}: ${err.message}`,
    };
  }
}

/* ==========================================================================
   AnimePahe Provider Routes
   Documented routes:
   - GET /anime/animepahe/search/:query
   - GET /anime/animepahe/latest
   - GET /anime/animepahe/info/:id
   - GET /anime/animepahe/episodes/:id
   - GET /anime/animepahe/episode/:id/:session (NDJSON)
   ========================================================================== */

export async function searchAnimePahe(query: string, customBaseUrl?: string): Promise<any[]> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured. Please set COOREN_API_BASE_URL in your environment.');
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const res = await fetch(`${baseUrl}/anime/animepahe/search/${encodedQuery}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`CoorenLabs AnimePahe search failed with HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data?.results || [];
}

export async function getAnimePaheLatest(customBaseUrl?: string): Promise<any[]> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const res = await fetch(`${baseUrl}/anime/animepahe/latest`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch AnimePahe latest releases (HTTP ${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data?.results || [];
}

export async function getAnimePaheInfo(id: string, customBaseUrl?: string): Promise<any> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const res = await fetch(`${baseUrl}/anime/animepahe/info/${encodeURIComponent(id.trim())}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch AnimePahe info for ID "${id}" (HTTP ${res.status})`);
  }

  return await res.json();
}

export async function getAnimePaheEpisodes(animeId: string, customBaseUrl?: string): Promise<any[]> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const encodedId = encodeURIComponent(animeId.trim());
  const res = await fetch(`${baseUrl}/anime/animepahe/episodes/${encodedId}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch AnimePahe episodes (HTTP ${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data?.results || data?.episodes || [];
}

/**
 * Handles AnimePahe stream resolution.
 * The endpoint returns Newline-Delimited JSON (NDJSON), not a regular JSON array.
 * Reads line-by-line and extracts quality, audio, directUrl, proxiedUrl, and url.
 */
export async function getAnimePaheStreams(animeId: string, session: string, customBaseUrl?: string): Promise<StreamVariantOption[]> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const url = `${baseUrl}/anime/animepahe/episode/${encodeURIComponent(animeId.trim())}/${encodeURIComponent(session.trim())}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch AnimePahe episode streams (HTTP ${res.status})`);
  }

  const text = await res.text();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const variants: StreamVariantOption[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const quality = parsed.quality || parsed.resolution || (parsed.directUrl?.includes('1080') || parsed.url?.includes('1080') ? '1080p' : parsed.directUrl?.includes('720') || parsed.url?.includes('720') ? '720p' : '360p');
      const audioRaw = (parsed.audio || parsed.language || 'jpn').toLowerCase();
      const language = audioRaw.includes('eng') || audioRaw.includes('dub') ? 'dub' : 'sub';

      const proxiedUrl = fixProxiedUrl(parsed.proxiedUrl || parsed.proxyUrl, baseUrl);
      const directUrl = fixProxiedUrl(parsed.directUrl || parsed.hlsUrl, baseUrl);
      const rawUrl = fixProxiedUrl(parsed.url || parsed.embedUrl, baseUrl);
      const chosenUrl = proxiedUrl || directUrl || rawUrl;
      if (!chosenUrl) continue;

      variants.push({
        title: parsed.title || undefined,
        quality,
        language,
        proxiedUrl,
        directUrl,
        url: chosenUrl,
        downloadUrl: fixProxiedUrl(parsed.downloadUrl, baseUrl),
        provider: 'animepahe',
        session,
        headers: parsed.corsHeaders || undefined,
      });
    } catch {
      // Safely ignore malformed or partial NDJSON lines
    }
  }

  return variants;
}

/* ==========================================================================
   ToonStream Provider Routes
   Documented routes:
   - GET /anime/toonstream/home
   - GET /anime/toonstream/search/:query/:page
   - GET /anime/toonstream/series/info/:slug
   - GET /anime/toonstream/episode/sources/:slug?season=:season&episode=:episode
   ========================================================================== */

export async function getToonStreamHome(customBaseUrl?: string): Promise<any> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const res = await fetch(`${baseUrl}/anime/toonstream/home`);
  if (!res.ok) {
    throw new Error(`ToonStream home fetch failed with HTTP ${res.status}`);
  }

  return await res.json();
}

export async function searchToonStream(query: string, page = 1, customBaseUrl?: string): Promise<any> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const res = await fetch(`${baseUrl}/anime/toonstream/search/${encodedQuery}/${page}`);
  if (!res.ok) {
    throw new Error(`ToonStream search failed with HTTP ${res.status}`);
  }

  return await res.json();
}

export async function getToonStreamSeriesInfo(slug: string, customBaseUrl?: string): Promise<any> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const res = await fetch(`${baseUrl}/anime/toonstream/series/info/${encodeURIComponent(slug.trim())}`);
  if (!res.ok) {
    throw new Error(`ToonStream series info failed with HTTP ${res.status}`);
  }

  return await res.json();
}

export async function getToonStreamEpisodeSources(slug: string, season = 1, episode = 1, customBaseUrl?: string): Promise<any> {
  const baseUrl = (customBaseUrl || getCoorenLabsBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('COOREN_API_BASE_URL is not configured.');
  }

  const res = await fetch(`${baseUrl}/anime/toonstream/episode/sources/${encodeURIComponent(slug.trim())}?season=${season}&episode=${episode}`);
  if (!res.ok) {
    throw new Error(`ToonStream episode sources failed with HTTP ${res.status}`);
  }

  return await res.json();
}

/* ==========================================================================
   Security & URL Validation (SSRF Protection)
   ========================================================================== */

export function validateEmbedUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Embed URL cannot be empty' };
  }

  const trimmed = url.trim();
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return { valid: false, error: 'Embed URL must begin with https:// or http://' };
  }

  const lowercase = trimmed.toLowerCase();
  if (lowercase.includes('javascript:') || lowercase.includes('data:') || lowercase.includes('vbscript:')) {
    return { valid: false, error: 'Unsafe URL scheme detected. Only HTTP/HTTPS URLs are allowed.' };
  }

  return { valid: true };
}

/**
 * Validates destination URLs to prevent Server-Side Request Forgery (SSRF)
 * when proxying streams or fetching remote manifests.
 */
export function validateSafeDestinationUrl(targetUrl: string): { safe: boolean; error?: string } {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, error: 'Forbidden protocol scheme' };
    }

    const hostname = parsed.hostname.toLowerCase();
    
    // Prohibit loopback and private networks
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      (hostname.startsWith('172.') && parseInt(hostname.split('.')[1] || '0', 10) >= 16 && parseInt(hostname.split('.')[1] || '0', 10) <= 31)
    ) {
      return { safe: false, error: 'Access to loopback or private network addresses is forbidden.' };
    }

    return { safe: true };
  } catch {
    return { safe: false, error: 'Malformed target URL' };
  }
}
