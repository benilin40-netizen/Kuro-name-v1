/**
 * Neon PostgreSQL Client Configuration
 * Verified REST Endpoint: https://ep-gentle-feather-b4xzu1k9.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1
 * 
 * Verified API Format & Auth:
 * - Architecture: Neon Authorize PostgREST integration
 * - Header Requirement: Authorization: Bearer <JWT>
 * - Direct Driver: @neondatabase/serverless pool for standard PostgreSQL TCP/WebSocket queries
 * 
 * Domain Responsibility:
 * - High-throughput Anime Catalog caching
 * - Episode stream resolution & source index
 * - Watch progress timestamps & telemetry
 */

import { neon, neonConfig } from '@neondatabase/serverless';

export const NEON_REST_ENDPOINT =
  process.env.NEON_REST_URL ||
  'https://ep-gentle-feather-b4xzu1k9.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1';

export const NEON_HOST = 'ep-gentle-feather-b4xzu1k9.us-east-2.aws.neon.tech';
export const NEON_DB = 'neondb';

export interface NeonTestResult {
  provider: 'neon';
  status: 'connected' | 'unauthorized' | 'not_configured' | 'error';
  endpoint: string;
  authenticated: boolean;
  message: string;
  authType: 'jwt_rest' | 'connection_string' | 'none';
  details?: any;
  testedAt: string;
}

class NeonService {
  private jwtToken: string = process.env.NEON_JWT_TOKEN || '';
  private connectionString: string = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';

  constructor() {
    // Configured for Neon serverless queries
  }

  public isConfigured(): boolean {
    const hasValidNeonDbUrl =
      Boolean(this.connectionString) &&
      !this.connectionString.includes('user:password') &&
      this.connectionString.includes('neon.tech');
    const hasValidJwt = Boolean(this.jwtToken && this.jwtToken.trim() !== '');
    return hasValidNeonDbUrl || hasValidJwt;
  }

  /**
   * Tests the connection against Neon using either the Authorize REST JWT endpoint or PostgreSQL driver
   */
  public async testConnection(): Promise<NeonTestResult> {
    const testedAt = new Date().toISOString();
    const jwt = process.env.NEON_JWT_TOKEN || this.jwtToken;
    const dbUrl =
      process.env.NEON_DATABASE_URL ||
      (process.env.DATABASE_URL?.includes('neon.tech') ? process.env.DATABASE_URL : '');

    const isValidNeonDbUrl =
      dbUrl &&
      dbUrl.trim() !== '' &&
      !dbUrl.includes('user:password') &&
      dbUrl.includes('neon.tech');

    // 1. If real Neon connection string is provided, test via @neondatabase/serverless driver
    if (isValidNeonDbUrl) {
      try {
        const sql = neon(dbUrl);
        const result = await sql`SELECT 1 as connected, NOW() as server_time, version() as version`;
        return {
          provider: 'neon',
          status: 'connected',
          endpoint: NEON_REST_ENDPOINT,
          authenticated: true,
          authType: 'connection_string',
          message: 'Direct Neon Serverless PostgreSQL connection successfully established.',
          details: result,
          testedAt,
        };
      } catch (err: any) {
        return {
          provider: 'neon',
          status: 'error',
          endpoint: NEON_REST_ENDPOINT,
          authenticated: false,
          authType: 'connection_string',
          message: `Neon PostgreSQL driver error: ${err.message}`,
          details: { errorName: err.name },
          testedAt,
        };
      }
    }

    // 2. Test Neon REST API with JWT (or probe unauthenticated)
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (jwt && jwt.trim() !== '') {
        headers['Authorization'] = `Bearer ${jwt.trim()}`;
      }

      const res = await fetch(NEON_REST_ENDPOINT, { headers });
      const json = await res.json().catch(() => ({}));

      if (res.status === 400 && json?.message?.includes('missing authentication credentials')) {
        return {
          provider: 'neon',
          status: 'not_configured',
          endpoint: NEON_REST_ENDPOINT,
          authenticated: false,
          authType: 'jwt_rest',
          message: 'Neon REST endpoint verified (Neon Authorize PostgREST), but requires NEON_JWT_TOKEN in backend environment.',
          details: {
            httpStatus: res.status,
            apiResponse: json,
            requiredFormat: 'Bearer <JWT>',
          },
          testedAt,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          provider: 'neon',
          status: 'unauthorized',
          endpoint: NEON_REST_ENDPOINT,
          authenticated: false,
          authType: 'jwt_rest',
          message: `Neon REST JWT authentication failed: ${json?.message || res.statusText} (HTTP ${res.status})`,
          details: json,
          testedAt,
        };
      }

      if (res.ok) {
        return {
          provider: 'neon',
          status: 'connected',
          endpoint: NEON_REST_ENDPOINT,
          authenticated: true,
          authType: 'jwt_rest',
          message: 'Neon REST endpoint query authorized and active.',
          details: json,
          testedAt,
        };
      }

      return {
        provider: 'neon',
        status: 'error',
        endpoint: NEON_REST_ENDPOINT,
        authenticated: Boolean(jwt),
        authType: jwt ? 'jwt_rest' : 'none',
        message: `Neon REST returned HTTP ${res.status}: ${json?.message || res.statusText}`,
        details: json,
        testedAt,
      };
    } catch (err: any) {
      return {
        provider: 'neon',
        status: 'error',
        endpoint: NEON_REST_ENDPOINT,
        authenticated: false,
        authType: 'none',
        message: `Network error connecting to Neon REST endpoint: ${err.message}`,
        testedAt,
      };
    }
  }
}

export const NeonManager = new NeonService();
