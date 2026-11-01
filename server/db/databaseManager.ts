/**
 * KURO NAMI Database Architecture Coordinator
 * 
 * Manages hybrid storage architecture:
 * 1. Operational Primary: Local SQLite (db in server/db.ts) ensuring seamless offline/dev operation
 * 2. Supabase Integration: User accounts, Profiles, Watchlists, Favorites (RLS-backed)
 * 3. Neon Integration: High-throughput Catalog caching & Streaming analytics (PostgREST / Serverless)
 */

import { db } from '../db.ts';
import { SupabaseManager, type DatabaseTestResult } from './supabaseClient.ts';
import { NeonManager, type NeonTestResult } from './neonClient.ts';

export interface ComprehensiveDatabaseStatus {
  activePrimary: 'sqlite_local' | 'supabase' | 'neon';
  sqlite: {
    status: 'connected';
    path: string;
    tableCounts: Record<string, number>;
  };
  supabase: DatabaseTestResult;
  neon: NeonTestResult;
  separationDefinition: {
    supabaseResponsibilities: string[];
    neonResponsibilities: string[];
    localSqliteResponsibilities: string[];
  };
  remainingSetupSteps: string[];
}

export class DatabaseManager {
  /**
   * Returns live diagnostic report of all database connections with real query execution
   */
  public static async getDiagnostics(): Promise<ComprehensiveDatabaseStatus> {
    // 1. Gather local SQLite counts to verify data preservation
    const tableCounts: Record<string, number> = {};
    const tables = ['users', 'profiles', 'watchlist', 'favorites', 'news', 'qwish_anime', 'qwish_episodes', 'qwish_watch_progress'];
    for (const t of tables) {
      try {
        const row = db.prepare(`SELECT count(*) as count FROM ${t}`).get() as any;
        tableCounts[t] = row?.count || 0;
      } catch (_e) {
        tableCounts[t] = 0;
      }
    }

    // 2. Real query execution against cloud providers
    const [supabaseResult, neonResult] = await Promise.all([
      SupabaseManager.testConnection(),
      NeonManager.testConnection(),
    ]);

    const remainingSetupSteps: string[] = [];

    if (!SupabaseManager.isConfigured()) {
      remainingSetupSteps.push(
        'Add SUPABASE_ANON_KEY (and optionally SUPABASE_SERVICE_ROLE_KEY) from the Supabase dashboard (Project Settings > API) to your backend environment.'
      );
      remainingSetupSteps.push(
        'Execute the Supabase SQL migration (server/db/migrations/01_supabase_schema.sql) in your Supabase SQL editor to enable RLS and tables.'
      );
    }

    if (!NeonManager.isConfigured()) {
      remainingSetupSteps.push(
        'For Neon REST Authorize: Add NEON_JWT_TOKEN containing valid PostgreSQL claims to your backend environment.'
      );
      remainingSetupSteps.push(
        'For Direct Neon PostgreSQL connection: Set NEON_DATABASE_URL or DATABASE_URL in your backend environment (connection string from Neon Console).'
      );
    }

    return {
      activePrimary: 'sqlite_local',
      sqlite: {
        status: 'connected',
        path: './data/kuronami.db',
        tableCounts,
      },
      supabase: supabaseResult,
      neon: neonResult,
      separationDefinition: {
        supabaseResponsibilities: [
          'User Profiles and authentication synchronization',
          'User Watchlist state (watching, plan-to-watch, completed, dropped)',
          'User Favorites and bookmark collections',
          'Row Level Security (RLS) policies for user data isolation',
        ],
        neonResponsibilities: [
          'High-throughput Anime catalog indexing and search caching',
          'Episode stream metadata and video source resolution metrics',
          'Real-time watch progress timestamps and streaming telemetry',
        ],
        localSqliteResponsibilities: [
          'Guaranteed zero-downtime local operational database',
          'Session and cache persistence during container lifecycle',
          'Zero external dependency fallback preserving all anime and news data',
        ],
      },
      remainingSetupSteps,
    };
  }
}
