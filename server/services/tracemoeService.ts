const TRACEMOE_BASE_URL = 'https://api.trace.moe/search';

let requestCount = 0;
let failedCount = 0;
let lastSuccessTime: string | null = null;
let lastErrorMsg: string | null = null;
let lastLatencyMs = 0;

export interface TraceMoeResult {
  anilist: number;
  filename: string;
  episode: number | string | null;
  from: number;
  to: number;
  similarity: number;
  video: string;
  image: string;
}

export const TraceMoeServerService = {
  getStats() {
    return {
      name: 'Trace.moe Anime Screenshot Search',
      endpoint: TRACEMOE_BASE_URL,
      status: failedCount > 5 && requestCount > 0 && (failedCount / requestCount > 0.5) ? 'degraded' : 'healthy',
      latencyMs: lastLatencyMs,
      lastSuccess: lastSuccessTime,
      lastError: lastErrorMsg,
      requestCount,
      failedCount,
    };
  },

  async searchByImageUrl(imageUrl: string, anilistFilter?: number): Promise<TraceMoeResult[]> {
    requestCount++;
    const startTime = Date.now();
    try {
      let targetUrl = `${TRACEMOE_BASE_URL}?url=${encodeURIComponent(imageUrl)}`;
      if (anilistFilter && anilistFilter > 0) {
        targetUrl += `&anilistID=${anilistFilter}`;
      }

      const res = await fetch(targetUrl, {
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Trace.moe HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }

      lastLatencyMs = Date.now() - startTime;
      lastSuccessTime = new Date().toISOString();
      return json.result || [];
    } catch (err: any) {
      failedCount++;
      lastErrorMsg = err.message || 'Trace.moe search failed';
      lastLatencyMs = Date.now() - startTime;
      console.warn('[TRACEMOE SERVICE] Search failed:', err.message);
      throw err;
    }
  },

  async searchByImageBuffer(imageBuffer: Buffer, mimeType = 'image/jpeg', anilistFilter?: number): Promise<TraceMoeResult[]> {
    requestCount++;
    const startTime = Date.now();
    try {
      let targetUrl = TRACEMOE_BASE_URL;
      if (anilistFilter && anilistFilter > 0) {
        targetUrl += `?anilistID=${anilistFilter}`;
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'Accept': 'application/json',
        },
        body: new Uint8Array(imageBuffer) as any,
      });

      if (!res.ok) {
        throw new Error(`Trace.moe HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }

      lastLatencyMs = Date.now() - startTime;
      lastSuccessTime = new Date().toISOString();
      return json.result || [];
    } catch (err: any) {
      failedCount++;
      lastErrorMsg = err.message || 'Trace.moe upload search failed';
      lastLatencyMs = Date.now() - startTime;
      console.warn('[TRACEMOE SERVICE] Upload search failed:', err.message);
      throw err;
    }
  },
};
