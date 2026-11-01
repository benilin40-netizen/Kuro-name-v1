/**
 * Supabase Official Client Configuration
 * Project Reference: xkwoblrgneiihzywfuep
 * Dashboard: https://supabase.com/dashboard/project/xkwoblrgneiihzywfuep
 * 
 * Domain Responsibility:
 * - User Authentication & Profiles
 * - User Watchlists & Status tracking
 * - User Favorites & Bookmark sync
 * - Row Level Security (RLS) enforcement
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_REF = 'xkwoblrgneiihzywfuep';
export const SUPABASE_URL = (process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`)
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/$/, '');

// Backend uses service role key if available for administrative tasks, otherwise anon key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export interface DatabaseTestResult {
  provider: 'supabase';
  status: 'connected' | 'unauthorized' | 'not_configured' | 'error';
  endpoint: string;
  authenticated: boolean;
  message: string;
  details?: any;
  testedAt: string;
}

class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (SUPABASE_KEY && SUPABASE_KEY.trim() !== '') {
      try {
        this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
      } catch (err: any) {
        console.warn('[SUPABASE] Failed to initialize client:', err.message);
        this.client = null;
      }
    }
  }

  public getClient(): SupabaseClient | null {
    if (!this.client && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
      this.init();
    }
    return this.client;
  }

  public isConfigured(): boolean {
    return Boolean(SUPABASE_KEY && SUPABASE_KEY.trim() !== '');
  }

  /**
   * Tests real authorized connection against Supabase REST endpoint
   */
  public async testConnection(): Promise<DatabaseTestResult> {
    const testedAt = new Date().toISOString();
    const endpoint = `${SUPABASE_URL}/rest/v1/`;

    if (!SUPABASE_KEY) {
      // Test real probe without key to verify endpoint accessibility
      try {
        const res = await fetch(endpoint, {
          headers: { 'Accept': 'application/json' },
        });
        const json = await res.json().catch(() => ({}));

        return {
          provider: 'supabase',
          status: 'not_configured',
          endpoint,
          authenticated: false,
          message: 'Supabase project endpoint reachable, but missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in backend environment.',
          details: {
            httpStatus: res.status,
            projectRef: res.headers.get('sb-project-ref') || SUPABASE_PROJECT_REF,
            gatewayResponse: json,
          },
          testedAt,
        };
      } catch (err: any) {
        return {
          provider: 'supabase',
          status: 'error',
          endpoint,
          authenticated: false,
          message: `Network error connecting to Supabase endpoint: ${err.message}`,
          testedAt,
        };
      }
    }

    try {
      const client = this.getClient();
      if (!client) {
        return {
          provider: 'supabase',
          status: 'error',
          endpoint,
          authenticated: false,
          message: 'Client initialization failed with provided key.',
          testedAt,
        };
      }

      // Execute authorized query against Supabase
      const { data, error, status } = await client.from('profiles').select('count', { count: 'exact', head: true });

      if (error) {
        if (status === 401 || status === 403) {
          return {
            provider: 'supabase',
            status: 'unauthorized',
            endpoint,
            authenticated: false,
            message: `Supabase authentication failed: ${error.message} (HTTP ${status})`,
            details: error,
            testedAt,
          };
        }
        // If table doesn't exist yet (HTTP 404 or 42P01 in postgres), credentials are valid!
        if (error.code === '42P01' || error.message.includes('relation "public.profiles" does not exist')) {
          return {
            provider: 'supabase',
            status: 'connected',
            endpoint,
            authenticated: true,
            message: 'Supabase credentials verified successfully! Target tables need schema migration.',
            details: { schemaReady: false, notice: error.message },
            testedAt,
          };
        }

        return {
          provider: 'supabase',
          status: 'error',
          endpoint,
          authenticated: true,
          message: `Supabase query returned: ${error.message}`,
          details: error,
          testedAt,
        };
      }

      return {
        provider: 'supabase',
        status: 'connected',
        endpoint,
        authenticated: true,
        message: 'Supabase connection verified and active.',
        details: { data },
        testedAt,
      };
    } catch (err: any) {
      return {
        provider: 'supabase',
        status: 'error',
        endpoint,
        authenticated: false,
        message: err.message || 'Unexpected Supabase error',
        testedAt,
      };
    }
  }
}

export const SupabaseManager = new SupabaseService();
