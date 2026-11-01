/**
 * AnimePahe Client-Side Proxy Wrapper
 *
 * Implements a resilient client-side interface for the `/api/anime/animepahe` endpoint
 * (as defined in `cooren-api`), with comprehensive error handling, configurable request
 * timeouts, NDJSON / JSON parsing, and diagnostic logging for debugging 'Failed to fetch' errors.
 */

export interface AnimePaheProxySearchResult {
  id: string;
  session: string;
  title: string;
  poster?: string | null;
  year?: number | null;
  type?: string;
  episodes?: number | null;
  score?: number | null;
  status?: string;
}

export interface AnimePaheEpisodeResult {
  episodeNumber: number;
  title: string;
  session: string;
  episodeSession?: string;
  animeSession?: string;
  snapshot?: string | null;
  createdAt?: string | null;
  filler?: boolean;
}

export interface AnimePaheStreamVariant {
  title?: string;
  quality: string;
  audio: 'sub' | 'dub' | string;
  url: string;
  proxiedUrl?: string;
  directUrl?: string;
  downloadUrl?: string;
  provider: string;
  session?: string;
  headers?: Record<string, string>;
}

export interface AnimePaheInfoResult {
  id?: string;
  title?: string;
  synopsis?: string;
  episodes?: number;
  status?: string;
  type?: string;
  season?: string;
  year?: number;
  [key: string]: unknown;
}

export interface AnimePaheRequestOptions {
  /** Maximum duration before aborting the request in milliseconds. Defaults to 10000ms */
  timeoutMs?: number;
  /** Optional external AbortSignal to cancel requests when navigating away or switching episodes */
  signal?: AbortSignal;
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Explicitly toggle detailed console debugging logs */
  debug?: boolean;
  /** Number of retry attempts on transient network failures. Defaults to 1 */
  retries?: number;
}

/**
 * Custom error class providing rich diagnostic information for AnimePahe proxy requests.
 */
export class AnimePaheProxyError extends Error {
  public readonly endpoint: string;
  public readonly status?: number;
  public readonly statusText?: string;
  public readonly isTimeout: boolean;
  public readonly isNetworkError: boolean;
  public readonly details?: unknown;

  constructor(params: {
    message: string;
    endpoint: string;
    status?: number;
    statusText?: string;
    isTimeout?: boolean;
    isNetworkError?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'AnimePaheProxyError';
    this.endpoint = params.endpoint;
    this.status = params.status;
    this.statusText = params.statusText;
    this.isTimeout = Boolean(params.isTimeout);
    this.isNetworkError = Boolean(params.isNetworkError);
    this.details = params.details;

    if (params.cause) {
      this.cause = params.cause;
    }
    Object.setPrototypeOf(this, AnimePaheProxyError.prototype);
  }
}

let customBaseUrl: string | null = null;
let debugLoggingEnabled = true;

/**
 * Configure or override the base URL used by the AnimePahe proxy wrapper.
 * By default, uses `/api/anime/animepahe`.
 */
export function setAnimePaheProxyBaseUrl(url: string | null): void {
  customBaseUrl = url ? url.replace(/\/+$/, '') : null;
  if (debugLoggingEnabled) {
    console.info(`[ANIMEPAHE PROXY] Base URL updated to: ${getAnimePaheProxyBaseUrl()}`);
  }
}

/**
 * Enable or disable diagnostic logging in the browser console.
 */
export function enableAnimePaheProxyDebugLogs(enabled: boolean): void {
  debugLoggingEnabled = enabled;
}

/**
 * Resolves the active base URL for AnimePahe requests.
 */
export function getAnimePaheProxyBaseUrl(): string {
  if (customBaseUrl) return customBaseUrl;

  // If VITE_COOREN_API_BASE_URL is provided and valid, it can be used;
  // otherwise default to same-origin '/api/anime/animepahe'
  const envBase = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COOREN_API_BASE_URL) ||
    ''
  ).trim();

  // If envBase is an absolute URL pointing to a different origin, prefer same-origin
  // proxy unless configured specifically for CORS-enabled backend
  if (envBase && envBase.startsWith('http') && !envBase.includes('localhost:3000')) {
    // Return relative same-origin route by default to eliminate browser CORS/Failed to fetch
    return '/api/anime/animepahe';
  }

  return '/api/anime/animepahe';
}

/**
 * Utility to extract clean anime or episode session hash from URLs or parameters.
 */
export function extractAnimePaheSession(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '';
  const clean = input.trim();
  if (clean.includes('/anime/')) {
    const parts = clean.split('/anime/');
    return parts[1]?.split('/')[0]?.split('?')[0]?.split('#')[0] || clean;
  }
  if (clean.includes('animepahe.')) {
    const parts = clean.split('/');
    return parts[parts.length - 1]?.split('?')[0]?.split('#')[0] || clean;
  }
  return clean;
}

/**
 * Core generic fetch wrapper with timeouts, signal chaining, retries, and comprehensive error analysis.
 */
const proxyCache = new Map<string, { data: any; expiry: number }>();

export async function fetchFromAnimePaheProxy<T>(
  subPath: string,
  options: AnimePaheRequestOptions = {}
): Promise<T> {
  const {
    timeoutMs = 20000,
    signal: externalSignal,
    headers = {},
    debug = debugLoggingEnabled,
    retries = 1,
  } = options;

  const base = getAnimePaheProxyBaseUrl();
  const cleanSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const fullUrl = `${base}${cleanSubPath}`;

  const cacheKey = `proxy_${fullUrl}`;
  const cached = proxyCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    if (debug) console.debug(`[ANIMEPAHE PROXY] 📦 Cache hit for: ${fullUrl}`);
    return cached.data as T;
  }

  const startTime = Date.now();

  if (debug) {
    console.debug(`[ANIMEPAHE PROXY] 🚀 Fetching: ${fullUrl} (timeout: ${timeoutMs}ms)`);
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    attempt++;

    // Setup combined abort controller for timeout & external cancellation
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let didTimeout = false;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, timeoutMs);
    }

    const onExternalAbort = () => {
      controller.abort();
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        if (timeoutId) clearTimeout(timeoutId);
        throw new DOMException('Aborted', 'AbortError');
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json, application/x-ndjson, text/plain, */*',
          ...headers,
        },
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        let errorBody: any = null;
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            errorBody = await response.json();
          } else {
            errorBody = await response.text();
          }
        } catch {
          // ignore parsing error for error payload
        }

        if (debug) {
          console.warn(
            `[ANIMEPAHE PROXY] ⚠️ HTTP ${response.status} (${response.statusText}) on ${fullUrl} after ${durationMs}ms:`,
            errorBody
          );
        }

        throw new AnimePaheProxyError({
          message:
            typeof errorBody === 'object' && errorBody?.error
              ? `AnimePahe proxy error: ${errorBody.error}`
              : `AnimePahe proxy returned HTTP ${response.status}: ${response.statusText || 'Request failed'}`,
          endpoint: fullUrl,
          status: response.status,
          statusText: response.statusText,
          details: errorBody,
        });
      }

      const contentType = response.headers.get('content-type') || '';

      // Check if response is NDJSON (application/x-ndjson)
      if (contentType.includes('application/x-ndjson') || contentType.includes('ndjson')) {
        const text = await response.text();
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        const parsedItems: any[] = [];
        for (const line of lines) {
          try {
            parsedItems.push(JSON.parse(line));
          } catch {
            // ignore malformed line
          }
        }
        if (debug) {
          console.debug(
            `[ANIMEPAHE PROXY] ✅ Received NDJSON (${parsedItems.length} lines) from ${fullUrl} in ${durationMs}ms`
          );
        }
        return parsedItems as unknown as T;
      }

      // Standard JSON
      const rawText = await response.text();
      console.log(`[RAW COOREN-API RESPONSE] Endpoint: ${fullUrl} | Status: ${response.status} | Raw Text Length: ${rawText.length} | Raw Body:`, rawText);
      let json: any;
      try {
        json = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(`[RAW COOREN-API PARSE ERROR] Failed to parse JSON from ${fullUrl}:`, parseErr);
        throw parseErr;
      }

      if (debug) {
        const count = Array.isArray(json)
          ? `${json.length} items`
          : Array.isArray(json?.results)
          ? `${json.results.length} results`
          : Array.isArray(json?.streams)
          ? `${json.streams.length} streams`
          : 'object';
        console.debug(
          `[ANIMEPAHE PROXY] ✅ Success (${count}) from ${fullUrl} in ${durationMs}ms`
        );
      }
      proxyCache.set(cacheKey, { data: json, expiry: Date.now() + 10 * 60 * 1000 });
      return json as T;
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      const durationMs = Date.now() - startTime;
      lastError = err;

      // Handle explicit abort from consumer
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Handle timeout
      if (didTimeout || err.name === 'TimeoutError' || (err.name === 'AbortError' && didTimeout)) {
        const timeoutError = new AnimePaheProxyError({
          message: `Request to AnimePahe proxy timed out after ${timeoutMs}ms (${fullUrl})`,
          endpoint: fullUrl,
          isTimeout: true,
          cause: err,
        });

        if (debug) {
          console.error(`[ANIMEPAHE PROXY] ⏱️ Timeout on ${fullUrl} after ${durationMs}ms`);
        }

        if (attempt <= retries) {
          if (debug) console.info(`[ANIMEPAHE PROXY] Retrying request (attempt ${attempt}/${retries})...`);
          continue;
        }
        throw timeoutError;
      }

      // Handle TypeError: Failed to fetch (Browser Network Error, CORS, or Server Down)
      const isFailedToFetch =
        err instanceof TypeError ||
        String(err.message || '').includes('Failed to fetch') ||
        String(err.message || '').includes('NetworkError') ||
        String(err.message || '').includes('Load failed');

      if (isFailedToFetch) {
        const networkError = new AnimePaheProxyError({
          message:
            `Failed to fetch from AnimePahe proxy at "${fullUrl}". ` +
            `This typically occurs when: ` +
            `1) The backend server is not running or unreachable, ` +
            `2) A cross-origin request was blocked by CORS headers, or ` +
            `3) The browser was disconnected or blocked by an ad-blocker.`,
          endpoint: fullUrl,
          isNetworkError: true,
          cause: err,
        });

        if (debug) {
          console.error(`[ANIMEPAHE PROXY] ❌ Network Error ("Failed to fetch") on ${fullUrl}:`, {
            error: err.message,
            stack: err.stack,
            durationMs,
            suggestion: 'Ensure the server is running on port 3000 and proxying requests through /api/anime/animepahe or /api/cooren/animepahe.',
          });
        }

        if (attempt <= retries) {
          if (debug) console.info(`[ANIMEPAHE PROXY] Retrying after network glitch (attempt ${attempt}/${retries})...`);
          continue;
        }
        throw networkError;
      }

      // Re-throw existing AnimePaheProxyError
      if (err instanceof AnimePaheProxyError) {
        throw err;
      }

      // Generic error wrapper
      throw new AnimePaheProxyError({
        message: err.message || 'Unknown error occurred while contacting AnimePahe proxy',
        endpoint: fullUrl,
        cause: err,
      });
    }
  }

  throw lastError;
}

/**
 * Searches AnimePahe titles via `/api/anime/animepahe/search/:query`.
 */
export async function proxySearchAnimePahe(
  query: string,
  options?: AnimePaheRequestOptions
): Promise<AnimePaheProxySearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const subPath = `/search/${encodeURIComponent(clean)}`;
  const data = await fetchFromAnimePaheProxy<any>(subPath, options);

  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
    ? data.results
    : [];

  return rawList.map((item: any) => ({
    id: extractAnimePaheSession(item.session || item.id || ''),
    session: extractAnimePaheSession(item.session || item.id || ''),
    title: item.title || item.name || clean,
    poster: item.poster || item.coverImage || null,
    year: typeof item.year === 'number' ? item.year : null,
    type: item.type || 'TV',
    episodes: typeof item.episodes === 'number' ? item.episodes : null,
    score: typeof item.score === 'number' ? item.score : null,
    status: item.status || undefined,
  }));
}

/**
 * Fetches latest updated AnimePahe releases via `/api/anime/animepahe/latest`.
 */
export async function proxyGetAnimePaheLatest(
  options?: AnimePaheRequestOptions
): Promise<AnimePaheProxySearchResult[]> {
  const data = await fetchFromAnimePaheProxy<any>('/latest', options);
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
    ? data.results
    : [];

  return rawList.map((item: any) => ({
    id: extractAnimePaheSession(item.session || item.id || ''),
    session: extractAnimePaheSession(item.session || item.id || ''),
    title: item.title || item.name || 'Untitled',
    poster: item.poster || item.coverImage || null,
    year: typeof item.year === 'number' ? item.year : null,
    type: item.type || 'TV',
    episodes: typeof item.episodes === 'number' ? item.episodes : null,
    score: typeof item.score === 'number' ? item.score : null,
  }));
}

/**
 * Fetches full anime details via `/api/anime/animepahe/info/:id`.
 */
export async function proxyGetAnimePaheInfo(
  id: string,
  options?: AnimePaheRequestOptions
): Promise<AnimePaheInfoResult> {
  const cleanId = extractAnimePaheSession(id);
  if (!cleanId) {
    throw new AnimePaheProxyError({
      message: 'Anime ID / session hash is required for info lookup',
      endpoint: `${getAnimePaheProxyBaseUrl()}/info`,
    });
  }

  const subPath = `/info/${encodeURIComponent(cleanId)}`;
  return await fetchFromAnimePaheProxy<AnimePaheInfoResult>(subPath, options);
}

/**
 * Fetches episode list for an anime via `/api/anime/animepahe/episodes/:id`.
 */
export async function proxyGetAnimePaheEpisodes(
  id: string,
  options?: AnimePaheRequestOptions
): Promise<AnimePaheEpisodeResult[]> {
  const cleanId = extractAnimePaheSession(id);
  if (!cleanId) return [];

  const subPath = `/episodes/${encodeURIComponent(cleanId)}`;
  const data = await fetchFromAnimePaheProxy<any>(subPath, options);

  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.episodes)
    ? data.episodes
    : [];

  return rawList.map((item: any, idx: number) => ({
    episodeNumber: Number(item.episode || item.episodeNumber || idx + 1),
    title: item.title || `Episode ${item.episode || idx + 1}`,
    session: item.session || String(item.id || ''),
    episodeSession: item.session || String(item.id || ''),
    animeSession: cleanId,
    snapshot: item.snapshot || null,
    createdAt: item.created_at || item.createdAt || null,
    filler: Boolean(item.filler),
  }));
}

/**
 * Fetches stream variants for a specific episode via `/api/anime/animepahe/episode/:id/:session`.
 * Handles both JSON streams array and NDJSON responses seamlessly.
 */
export async function proxyGetAnimePaheStreams(
  animeId: string,
  episodeSession: string,
  options?: AnimePaheRequestOptions
): Promise<AnimePaheStreamVariant[]> {
  const aId = extractAnimePaheSession(animeId);
  const epSession = extractAnimePaheSession(episodeSession);

  if (!aId || !epSession) {
    throw new AnimePaheProxyError({
      message: 'Both anime ID and episode session are required to fetch streams',
      endpoint: `${getAnimePaheProxyBaseUrl()}/episode`,
    });
  }

  const subPath = `/episode/${encodeURIComponent(aId)}/${encodeURIComponent(epSession)}`;
  const rawData = await fetchFromAnimePaheProxy<any>(subPath, options);

  const items = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.streams)
    ? rawData.streams
    : [];

  const variants: AnimePaheStreamVariant[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const url = item.proxiedUrl || item.directUrl || item.url || item.embedUrl;
    if (!url || typeof url !== 'string') continue;

    const qualityRaw = String(item.quality || item.resolution || '720p');
    let quality = '720p';
    if (qualityRaw.includes('1080')) quality = '1080p';
    else if (qualityRaw.includes('720')) quality = '720p';
    else if (qualityRaw.includes('480')) quality = '480p';
    else if (qualityRaw.includes('360')) quality = '360p';

    const audioRaw = String(item.audio || item.language || 'jpn').toLowerCase();
    const audio = audioRaw.includes('eng') || audioRaw.includes('dub') ? 'dub' : 'sub';

    variants.push({
      title: item.title || undefined,
      quality,
      audio,
      url,
      proxiedUrl: item.proxiedUrl || undefined,
      directUrl: item.directUrl || undefined,
      downloadUrl: item.downloadUrl || undefined,
      provider: 'animepahe',
      session: epSession,
      headers: item.corsHeaders || item.headers || undefined,
    });
  }

  return variants;
}

/**
 * Diagnostic health check to test reachability and report round-trip latency.
 */
export async function checkAnimePaheProxyHealth(
  options?: AnimePaheRequestOptions
): Promise<{ reachable: boolean; latencyMs?: number; error?: string; baseUrl: string }> {
  const start = Date.now();
  const base = getAnimePaheProxyBaseUrl();
  try {
    const res = await fetch(base, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options?.signal,
    });

    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { reachable: true, latencyMs, baseUrl: base };
    }
    return {
      reachable: false,
      latencyMs,
      baseUrl: base,
      error: `Server responded with HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (err: any) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      baseUrl: base,
      error: err.message || 'Network unreachable',
    };
  }
}

/**
 * Default wrapper object encapsulating all AnimePahe proxy client functions.
 */
export const animePaheProxy = {
  getBaseUrl: getAnimePaheProxyBaseUrl,
  setBaseUrl: setAnimePaheProxyBaseUrl,
  enableDebugLogs: enableAnimePaheProxyDebugLogs,
  extractSession: extractAnimePaheSession,
  fetch: fetchFromAnimePaheProxy,
  search: proxySearchAnimePahe,
  getLatest: proxyGetAnimePaheLatest,
  getInfo: proxyGetAnimePaheInfo,
  getEpisodes: proxyGetAnimePaheEpisodes,
  getStreams: proxyGetAnimePaheStreams,
  checkHealth: checkAnimePaheProxyHealth,
};

export default animePaheProxy;
