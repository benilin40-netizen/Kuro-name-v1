import { SourceHealthStatus, StreamingSource } from '../types/anime.ts';

/**
 * Result of a server-side source probe
 */
export interface SourceHealthCheckResult {
  sourceId: string;
  url: string;
  healthStatus: SourceHealthStatus;
  responseTimeMs: number;
  httpStatus: number;
  message: string;
  lastChecked: string;
}

/**
 * Helper to get authentication header
 */
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('kuronami_auth_token') || localStorage.getItem('anivera_auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Perform a server-side health check probe for a specific source ID
 */
export async function checkSourceHealth(sourceId: string): Promise<SourceHealthCheckResult> {
  const res = await fetch(`/api/admin/sources/${sourceId}/health-check`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Health check failed with status ${res.status}`);
  }

  return res.json();
}

/**
 * Run a batch health check across all registered sources
 */
export async function checkAllSourcesHealth(): Promise<SourceHealthCheckResult[]> {
  const res = await fetch('/api/admin/sources/health-check-all', {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Batch health check failed with status ${res.status}`);
  }

  return res.json();
}

/**
 * Pre-validate a URL on the server before adding/saving
 */
export async function validateSourceUrl(url: string): Promise<{
  status: 'VALID' | 'UNREACHABLE' | 'INVALID';
  message: string;
  httpStatus?: number;
  responseTimeMs?: number;
}> {
  if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
    return { status: 'INVALID', message: 'URL must start with http:// or https://' };
  }

  try {
    const res = await fetch('/api/admin/validate-source', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ url: url.trim() }),
    });

    if (!res.ok) {
      return { status: 'UNREACHABLE', message: `Server check failed (${res.status})` };
    }

    return res.json();
  } catch (err: any) {
    return { status: 'UNREACHABLE', message: err.message || 'Validation request failed' };
  }
}

/**
 * Visual styling helper for source health status
 */
export function getHealthStatusMeta(healthStatus?: SourceHealthStatus | string): {
  label: string;
  dotColor: string;
  badgeBg: string;
  textColor: string;
} {
  switch (healthStatus) {
    case 'healthy':
      return {
        label: 'Healthy',
        dotColor: 'bg-emerald-400',
        badgeBg: 'bg-emerald-500/10 border-emerald-500/20',
        textColor: 'text-emerald-400',
      };
    case 'degraded':
      return {
        label: 'Degraded',
        dotColor: 'bg-amber-400',
        badgeBg: 'bg-amber-500/10 border-amber-500/20',
        textColor: 'text-amber-400',
      };
    case 'offline':
      return {
        label: 'Offline',
        dotColor: 'bg-rose-500',
        badgeBg: 'bg-rose-500/10 border-rose-500/20',
        textColor: 'text-rose-400',
      };
    default:
      return {
        label: 'Unknown',
        dotColor: 'bg-slate-400',
        badgeBg: 'bg-slate-500/10 border-slate-500/20',
        textColor: 'text-slate-400',
      };
  }
}

/**
 * Human-readable format of last check timestamp
 */
export function formatLastChecked(timestamp?: string | null): string {
  if (!timestamp) return 'Never checked';
  try {
    const checkDate = new Date(timestamp);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - checkDate.getTime()) / 1000);

    if (diffSecs < 10) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return checkDate.toLocaleDateString();
  } catch {
    return 'Recently';
  }
}

export const sourceHealth = {
  checkSourceHealth,
  checkAllSourcesHealth,
  validateSourceUrl,
  getHealthStatusMeta,
  formatLastChecked,
};

export default sourceHealth;
