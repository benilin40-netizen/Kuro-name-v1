/**
 * KURO NAMI Playback Source Manager
 * 
 * Coordinates multi-provider episode video sources (VCDN, media.cm, Cloudflare Stream)
 * Synchronizes between local SQLite operational store and Supabase public.playback_sources.
 * 
 * Rules:
 * 1. Strict anime and episode association (never mixes up episode identities).
 * 2. Primary source attempted first, secondary source used as fallback for the same episode.
 * 3. Supports VCDN REST / embed and validated media.cm embeds.
 * 4. Supports 'sub' and 'dub' audio language.
 * 5. Supports processing, ready, and failed states.
 */

import crypto from 'node:crypto';
import { db } from '../db.ts';
import { SupabaseManager } from '../db/supabaseClient.ts';
import { vcdnService } from './vcdnService.ts';
import { mediaCmService } from './mediaCmService.ts';
import { validateEmbedUrl, validateSafeDestinationUrl } from './streamProviders.ts';

export type VideoProviderType =
  | 'vcdn'
  | 'media_cm'
  | 'cloudflare_stream'
  | 'animepahe'
  | 'toonstream'
  | 'external_embed'
  | 'direct_hls'
  | 'direct_mp4'
  | 'custom_provider'
  | 'authorized_partner';
export type VideoProcessingStatus = 'processing' | 'ready' | 'failed';
export type AudioLanguage = 'sub' | 'dub';

export interface PlaybackSourceRecord {
  id: string;
  anime_id: number;
  episode_number: number;
  season_number: number;
  language: AudioLanguage;
  provider: VideoProviderType;
  provider_video_id?: string;
  embed_url?: string;
  playback_url?: string;
  quality?: string;
  is_published: boolean | number;
  processing_status: VideoProcessingStatus;
  is_primary: boolean | number;
  title?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientPlaybackSourceItem {
  id: string;
  url: string; // iframe embed URL or HLS / MP4 playback URL
  embedUrl?: string;
  type: 'iframe' | 'hls' | 'mp4';
  provider: string;
  providerKey: VideoProviderType;
  language: string;
  quality: string;
  isPrimary: boolean;
  status: VideoProcessingStatus;
  title: string;
  isOfficial: boolean;
}

export class PlaybackSourceManager {
  private static instance: PlaybackSourceManager;

  public static getInstance(): PlaybackSourceManager {
    if (!PlaybackSourceManager.instance) {
      PlaybackSourceManager.instance = new PlaybackSourceManager();
    }
    return PlaybackSourceManager.instance;
  }

  /**
   * Queries published, ready playback sources for a specific anime and episode
   * Sorted with primary source first, then secondary sources.
   */
  public async getPublishedSourcesForEpisode(
    animeId: number,
    episodeNumber: number,
    season = 1,
    preferredLanguage: AudioLanguage = 'sub'
  ): Promise<ClientPlaybackSourceItem[]> {
    if (!animeId || !episodeNumber) return [];

    let rows: PlaybackSourceRecord[] = [];

    // 1. Query local SQLite
    try {
      rows = db.prepare(`
        SELECT * FROM playback_sources
        WHERE anime_id = ? 
          AND episode_number = ? 
          AND season_number = ?
          AND is_published = 1
          AND processing_status = 'ready'
        ORDER BY is_primary DESC, created_at ASC
      `).all(animeId, episodeNumber, season) as any[];
    } catch (err: any) {
      console.warn('[PLAYBACK MANAGER] SQLite query warning:', err.message);
    }

    // 2. If SQLite returned rows, sort preferred language first if matching
    if (rows && rows.length > 0) {
      return this.formatClientSources(rows, preferredLanguage);
    }

    // 3. Fallback check Supabase if available
    try {
      const supabase = SupabaseManager.getClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('playback_sources')
          .select('*')
          .eq('anime_id', animeId)
          .eq('episode_number', episodeNumber)
          .eq('season_number', season)
          .eq('is_published', true)
          .eq('processing_status', 'ready')
          .order('is_primary', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          // Sync into SQLite cache for speed
          for (const s of data) {
            this.upsertToSqlite(s);
          }
          return this.formatClientSources(data, preferredLanguage);
        }
      }
    } catch (err: any) {
      console.warn('[PLAYBACK MANAGER] Supabase query notice:', err.message);
    }

    return [];
  }

  /**
   * Retrieves all playback sources for an episode (for admin editing)
   */
  public async getAllSourcesForEpisode(
    animeId: number,
    episodeNumber: number,
    season = 1
  ): Promise<PlaybackSourceRecord[]> {
    try {
      const rows = db.prepare(`
        SELECT * FROM playback_sources
        WHERE anime_id = ? AND episode_number = ? AND season_number = ?
        ORDER BY is_primary DESC, created_at ASC
      `).all(animeId, episodeNumber, season) as any[];
      return rows;
    } catch (err: any) {
      console.error('[PLAYBACK MANAGER] Failed to fetch sources:', err.message);
      return [];
    }
  }

  /**
   * Saves or updates a playback source (Admin only)
   * Validates URLs and coordinates storage in SQLite and Supabase
   */
  public async saveSource(input: {
    id?: string;
    anime_id: number;
    episode_number: number;
    season_number?: number;
    language?: AudioLanguage;
    provider: VideoProviderType;
    provider_video_id?: string;
    embed_url?: string;
    playback_url?: string;
    quality?: string;
    is_published?: boolean;
    processing_status?: VideoProcessingStatus;
    is_primary?: boolean;
    title?: string;
  }): Promise<{ success: boolean; source?: PlaybackSourceRecord; error?: string }> {
    const animeId = parseInt(String(input.anime_id), 10);
    const epNum = parseInt(String(input.episode_number), 10);
    const season = parseInt(String(input.season_number || 1), 10);
    const language: AudioLanguage = input.language === 'dub' ? 'dub' : 'sub';
    const provider = input.provider;

    if (!animeId || animeId <= 0 || !epNum || epNum <= 0) {
      return { success: false, error: 'Invalid anime ID or episode number.' };
    }

    let providerVideoId = (input.provider_video_id || '').trim();
    let embedUrl = (input.embed_url || '').trim();
    let playbackUrl = (input.playback_url || '').trim();
    let processingStatus: VideoProcessingStatus = input.processing_status || 'ready';

    // Provider Specific Validation & Normalization
    if (provider === 'vcdn') {
      if (!providerVideoId && !embedUrl) {
        return { success: false, error: 'VCDN Video ID or embed URL is required.' };
      }
      if (!providerVideoId && embedUrl) {
        const parts = embedUrl.split('/');
        providerVideoId = parts[parts.length - 1];
      }
      if (!vcdnService.isValidVideoId(providerVideoId)) {
        return { success: false, error: 'Invalid VCDN Video ID. Must be at least 3 alphanumeric characters.' };
      }

      embedUrl = vcdnService.buildEmbedUrl(providerVideoId);
      playbackUrl = vcdnService.buildHlsUrl(providerVideoId);
    } else if (provider === 'media_cm') {
      const validation = mediaCmService.validateEmbedUrl(embedUrl || providerVideoId);
      if (!validation.isValid || !validation.normalizedEmbedUrl) {
        return { success: false, error: validation.errorMessage || 'Invalid media.cm URL or video code.' };
      }
      embedUrl = validation.normalizedEmbedUrl;
      providerVideoId = validation.videoCode || providerVideoId;
      playbackUrl = ''; // media.cm does not provide authorized direct HLS
    } else if (provider === 'cloudflare_stream') {
      if (!providerVideoId) {
        return { success: false, error: 'Cloudflare Stream Video ID is required.' };
      }
      if (providerVideoId === 'demo') {
        playbackUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
      } else {
        playbackUrl = `https://customer-video.cloudflarestream.com/${providerVideoId}/manifest/video.m3u8`;
        embedUrl = `https://iframe.videodelivery.net/${providerVideoId}`;
      }
    } else if (provider === 'animepahe' || provider === 'toonstream') {
      if (!embedUrl && !playbackUrl && !providerVideoId) {
        return { success: false, error: 'Stream URL, embed link, or episode session ID is required.' };
      }
      if (embedUrl) {
        const val = validateEmbedUrl(embedUrl);
        if (!val.valid) return { success: false, error: val.error };
      }
    } else if (provider === 'direct_hls' || provider === 'direct_mp4') {
      const mediaUrl = playbackUrl || embedUrl;
      if (!mediaUrl) {
        return { success: false, error: 'Direct media URL is required.' };
      }
      const safe = validateSafeDestinationUrl(mediaUrl);
      if (!safe.safe) {
        return { success: false, error: safe.error || 'Prohibited or unsafe destination URL.' };
      }
      playbackUrl = mediaUrl;
      embedUrl = '';
    } else if (provider === 'external_embed' || provider === 'custom_provider') {
      const target = embedUrl || playbackUrl;
      if (!target) {
        return { success: false, error: 'Authorized embed URL is required.' };
      }
      const val = validateEmbedUrl(target);
      if (!val.valid) return { success: false, error: val.error };
      embedUrl = target;
    }

    const nowIso = new Date().toISOString();
    const id = input.id || `ps_${animeId}_s${season}_e${epNum}_${provider}_${language}_${Date.now().toString(36)}`;
    const isPrimary = input.is_primary ? 1 : 0;
    const isPublished = input.is_published !== false ? 1 : 0;

    // If marked as primary, unmark any other sources for this exact anime & episode
    if (isPrimary === 1) {
      db.prepare(`
        UPDATE playback_sources
        SET is_primary = 0
        WHERE anime_id = ? AND episode_number = ? AND season_number = ?
      `).run(animeId, epNum, season);
    }

    // Upsert into SQLite
    db.prepare(`
      INSERT INTO playback_sources (
        id, anime_id, episode_number, season_number, language, provider,
        provider_video_id, embed_url, playback_url, quality,
        is_published, processing_status, is_primary, title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(anime_id, season_number, episode_number, provider, language) DO UPDATE SET
        provider_video_id = excluded.provider_video_id,
        embed_url = excluded.embed_url,
        playback_url = excluded.playback_url,
        quality = excluded.quality,
        is_published = excluded.is_published,
        processing_status = excluded.processing_status,
        is_primary = excluded.is_primary,
        title = excluded.title,
        updated_at = excluded.updated_at
    `).run(
      id,
      animeId,
      epNum,
      season,
      language,
      provider,
      providerVideoId,
      embedUrl,
      playbackUrl,
      input.quality || '1080p',
      isPublished,
      processingStatus,
      isPrimary,
      input.title || `Episode ${epNum}`,
      nowIso,
      nowIso
    );

    // Ensure qwish_episodes record exists and is marked READY so it is displayed in episode lists
    try {
      const qwishEpId = `ep_${animeId}_${epNum}`;
      db.prepare(`
        INSERT INTO qwish_episodes (
          id, anime_id, episode_number, title, cloudflare_video_id, duration, thumbnail, description, is_published, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '', 1420, '', '', ?, 'READY', ?, ?)
        ON CONFLICT(anime_id, episode_number) DO UPDATE SET
          title = COALESCE(NULLIF(excluded.title, ''), qwish_episodes.title),
          status = 'READY',
          is_published = 1,
          updated_at = excluded.updated_at
      `).run(
        qwishEpId,
        String(animeId),
        epNum,
        input.title || `Episode ${epNum}`,
        isPublished,
        nowIso,
        nowIso
      );
    } catch (e: any) {
      console.warn('[PLAYBACK MANAGER] Notice syncing qwish_episodes:', e.message);
    }

    const savedRecord = db.prepare('SELECT * FROM playback_sources WHERE anime_id = ? AND episode_number = ? AND season_number = ? AND provider = ? AND language = ?').get(
      animeId, epNum, season, provider, language
    ) as unknown as PlaybackSourceRecord;

    // Asynchronously synchronize to Supabase
    this.syncToSupabase(savedRecord).catch((err) => {
      console.warn('[PLAYBACK MANAGER] Supabase background sync notice:', err.message);
    });

    return { success: true, source: savedRecord };
  }

  /**
   * Deletes a playback source
   */
  public async deleteSource(sourceId: string): Promise<boolean> {
    try {
      const record = db.prepare('SELECT * FROM playback_sources WHERE id = ?').get(sourceId) as unknown as PlaybackSourceRecord;
      if (!record) return false;

      db.prepare('DELETE FROM playback_sources WHERE id = ?').run(sourceId);

      // Delete from Supabase if configured
      try {
        const supabase = SupabaseManager.getClient();
        if (supabase) {
          await supabase.from('playback_sources').delete().eq('id', sourceId);
        }
      } catch {}

      return true;
    } catch (err: any) {
      console.error('[PLAYBACK MANAGER] Delete error:', err.message);
      return false;
    }
  }

  /**
   * Sets a specific source as primary for its episode
   */
  public async setPrimarySource(sourceId: string): Promise<boolean> {
    try {
      const record = db.prepare('SELECT * FROM playback_sources WHERE id = ?').get(sourceId) as unknown as PlaybackSourceRecord;
      if (!record) return false;

      db.prepare(`
        UPDATE playback_sources
        SET is_primary = 0
        WHERE anime_id = ? AND episode_number = ? AND season_number = ?
      `).run(record.anime_id, record.episode_number, record.season_number);

      db.prepare('UPDATE playback_sources SET is_primary = 1, updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        sourceId
      );

      return true;
    } catch (err: any) {
      console.error('[PLAYBACK MANAGER] Set primary error:', err.message);
      return false;
    }
  }

  /**
   * Refreshes VCDN processing status from the official VCDN REST API
   */
  public async refreshVcdnStatus(sourceId: string): Promise<{ status: VideoProcessingStatus; message?: string }> {
    const record = db.prepare("SELECT * FROM playback_sources WHERE id = ? AND provider = 'vcdn'").get(sourceId) as unknown as PlaybackSourceRecord;
    if (!record || !record.provider_video_id) {
      return { status: 'failed', message: 'VCDN source not found or missing video ID.' };
    }

    try {
      const vcdnInfo = await vcdnService.getVideo(record.provider_video_id);
      if (vcdnInfo) {
        const newStatus = vcdnInfo.status === 'uploaded' ? 'ready' : vcdnInfo.status;
        db.prepare(`
          UPDATE playback_sources
          SET processing_status = ?,
              updated_at = ?
          WHERE id = ?
        `).run(newStatus, new Date().toISOString(), sourceId);

        return { status: newStatus };
      }
      return { status: record.processing_status };
    } catch (err: any) {
      return { status: record.processing_status, message: err.message };
    }
  }

  private formatClientSources(rows: PlaybackSourceRecord[], preferredLanguage: AudioLanguage): ClientPlaybackSourceItem[] {
    const items: ClientPlaybackSourceItem[] = [];

    // Sort: preferred language matches first
    const sorted = [...rows].sort((a, b) => {
      const aLangMatch = a.language === preferredLanguage ? 1 : 0;
      const bLangMatch = b.language === preferredLanguage ? 1 : 0;
      if (bLangMatch !== aLangMatch) return bLangMatch - aLangMatch;
      const aPri = a.is_primary ? 1 : 0;
      const bPri = b.is_primary ? 1 : 0;
      return bPri - aPri;
    });

    for (const r of sorted) {
      const isVcdn = r.provider === 'vcdn';
      const isMediaCm = r.provider === 'media_cm';
      const isCf = r.provider === 'cloudflare_stream';

      const providerLabel = isVcdn
        ? 'VCDN (Official CDN Player)'
        : isMediaCm
        ? 'media.cm (Mirror Player)'
        : isCf
        ? 'Cloudflare Stream'
        : r.provider === 'animepahe'
        ? 'AnimePahe (CoorenLabs)'
        : r.provider === 'toonstream'
        ? 'ToonStream (CoorenLabs)'
        : r.provider === 'direct_hls'
        ? 'Direct HLS Stream'
        : r.provider === 'direct_mp4'
        ? 'Direct MP4 Stream'
        : r.provider === 'external_embed'
        ? 'External Embed'
        : 'Authorized Stream';

      // Determine preferred playback URL and type
      let url = '';
      let type: 'iframe' | 'hls' | 'mp4' = 'iframe';

      if (r.provider === 'direct_hls' || (r.playback_url && r.playback_url.includes('.m3u8'))) {
        url = r.playback_url || r.embed_url || '';
        type = 'hls';
      } else if (r.provider === 'direct_mp4' || (r.playback_url && r.playback_url.match(/\.(mp4|webm)($|\?)/i))) {
        url = r.playback_url || r.embed_url || '';
        type = 'mp4';
      } else if (r.embed_url && r.embed_url.trim().startsWith('http')) {
        url = r.embed_url.trim();
        type = 'iframe';
      } else if (r.playback_url && r.playback_url.trim().startsWith('http')) {
        url = r.playback_url.trim();
        type = url.includes('.m3u8') ? 'hls' : 'mp4';
      }

      if (!url) continue;

      items.push({
        id: r.id,
        url,
        embedUrl: r.embed_url || undefined,
        type,
        provider: providerLabel,
        providerKey: r.provider,
        language: r.language === 'dub' ? 'English (Dub)' : 'Japanese (Sub)',
        quality: r.quality || '1080p',
        isPrimary: Boolean(r.is_primary),
        status: r.processing_status,
        title: r.title || `Episode ${r.episode_number}`,
        isOfficial: true,
      });
    }

    return items;
  }

  private upsertToSqlite(s: any) {
    try {
      db.prepare(`
        INSERT INTO playback_sources (
          id, anime_id, episode_number, season_number, language, provider,
          provider_video_id, embed_url, playback_url, quality,
          is_published, processing_status, is_primary, title, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(anime_id, season_number, episode_number, provider, language) DO UPDATE SET
          provider_video_id = excluded.provider_video_id,
          embed_url = excluded.embed_url,
          playback_url = excluded.playback_url,
          quality = excluded.quality,
          is_published = excluded.is_published,
          processing_status = excluded.processing_status,
          is_primary = excluded.is_primary,
          title = excluded.title,
          updated_at = excluded.updated_at
      `).run(
        s.id,
        s.anime_id,
        s.episode_number,
        s.season_number || 1,
        s.language || 'sub',
        s.provider,
        s.provider_video_id || null,
        s.embed_url || null,
        s.playback_url || null,
        s.quality || '1080p',
        s.is_published ? 1 : 0,
        s.processing_status || 'ready',
        s.is_primary ? 1 : 0,
        s.title || '',
        s.created_at || new Date().toISOString(),
        s.updated_at || new Date().toISOString()
      );
    } catch {}
  }

  private async syncToSupabase(record: PlaybackSourceRecord) {
    const supabase = SupabaseManager.getClient();
    if (!supabase) return;

    try {
      await supabase.from('playback_sources').upsert(
        {
          anime_id: record.anime_id,
          episode_number: record.episode_number,
          season_number: record.season_number,
          language: record.language,
          provider: record.provider,
          provider_video_id: record.provider_video_id || null,
          embed_url: record.embed_url || null,
          playback_url: record.playback_url || null,
          quality: record.quality || '1080p',
          is_published: Boolean(record.is_published),
          processing_status: record.processing_status,
          is_primary: Boolean(record.is_primary),
          title: record.title || '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'anime_id, season_number, episode_number, provider, language' }
      );
    } catch (err: any) {
      console.warn('[PLAYBACK MANAGER] Supabase upsert error:', err.message);
    }
  }
}

export const playbackSourceManager = PlaybackSourceManager.getInstance();
