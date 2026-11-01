/**
 * Cloudflare Stream Backend Service
 * Secure server-side interface to Cloudflare Stream API for licensed video management and playback.
 * 
 * Never exposes Cloudflare API tokens to the client.
 */

export interface CloudflareStreamVideoDetails {
  uid: string;
  creator?: string;
  thumbnail: string;
  readyToStream: boolean;
  status: {
    state: 'inprogress' | 'ready' | 'error' | 'queued';
    pctComplete?: string;
    errorReasonCode?: string;
    errorReasonText?: string;
  };
  meta?: Record<string, any>;
  created: string;
  modified: string;
  size: number;
  preview: string;
  duration: number;
  playback: {
    hls: string;
    dash: string;
  };
}

export interface PlaybackResolution {
  available: boolean;
  isDemo?: boolean;
  hlsUrl?: string;
  embedUrl?: string;
  dashUrl?: string;
  thumbnail?: string;
  duration?: number;
  status: 'READY' | 'PROCESSING' | 'ERROR' | 'UNAVAILABLE' | 'UPLOADING';
  message?: string;
}

// Publicly licensed high-quality open-source demo videos for development mode
const DEMO_VIDEOS: Record<string, { hls: string; mp4: string; title: string; duration: number }> = {
  default: {
    hls: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'Public Creative Commons Licensed Test Stream',
    duration: 596,
  },
  sintel: {
    hls: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    title: 'Sintel - Blender Open Movie (CC-BY 3.0)',
    duration: 888,
  },
  tears: {
    hls: 'https://test-streams.mux.dev/test_001/stream.m3u8',
    mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    title: 'Tears of Steel - Blender Open VFX (CC-BY 3.0)',
    duration: 734,
  },
};

export class CloudflareStreamServerService {
  private static getCredentials() {
    return {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || '',
    };
  }

  /**
   * Resolves playback stream URLs for a given Cloudflare Video ID.
   * Handles demo IDs, real Cloudflare IDs, and unavailable states.
   */
  public static async getPlaybackInfo(videoId?: string | null): Promise<PlaybackResolution> {
    if (!videoId || !videoId.trim()) {
      return {
        available: false,
        status: 'UNAVAILABLE',
        message: 'Episode video not available.',
      };
    }

    const cleanId = videoId.trim();

    // 1. Development Mode / Public Licensed Demo Videos
    if (cleanId.startsWith('demo-') || cleanId === 'demo' || cleanId.includes('sample')) {
      const demoKey = cleanId.includes('op') || cleanId.includes('01') ? 'default' : cleanId.includes('02') ? 'sintel' : 'tears';
      const demo = DEMO_VIDEOS[demoKey] || DEMO_VIDEOS.default;
      return {
        available: true,
        isDemo: true,
        hlsUrl: demo.hls,
        embedUrl: undefined,
        dashUrl: undefined,
        thumbnail: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
        duration: demo.duration,
        status: 'READY',
        message: 'DEMO VIDEO: Licensed development test video.',
      };
    }

    // 2. Real Cloudflare Stream Video ID
    const { accountId, apiToken } = this.getCredentials();

    // Standard Cloudflare Stream public delivery URLs (domain: videodelivery.net)
    const standardHls = `https://videodelivery.net/${cleanId}/manifest/video.m3u8`;
    const standardDash = `https://videodelivery.net/${cleanId}/manifest/video.mpd`;
    const standardEmbed = `https://iframe.videodelivery.net/${cleanId}`;
    const standardThumb = `https://videodelivery.net/${cleanId}/thumbnails/thumbnail.jpg`;

    // If Cloudflare API credentials are configured, query live status
    if (accountId && apiToken) {
      try {
        const details = await this.getVideo(cleanId);
        if (details) {
          if (!details.readyToStream) {
            return {
              available: false,
              status: details.status?.state === 'error' ? 'ERROR' : 'PROCESSING',
              message: details.status?.state === 'error'
                ? 'Cloudflare Stream error processing this video.'
                : 'Video is currently processing on Cloudflare Stream. Please check back shortly.',
            };
          }

          return {
            available: true,
            isDemo: false,
            hlsUrl: details.playback?.hls || standardHls,
            dashUrl: details.playback?.dash || standardDash,
            embedUrl: standardEmbed,
            thumbnail: details.thumbnail || standardThumb,
            duration: Math.round(details.duration || 0),
            status: 'READY',
          };
        }
      } catch (err: any) {
        console.warn(`[CLOUDFLARE STREAM] Live query failed for ${cleanId}, using standard delivery URL:`, err.message);
      }
    }

    // Return standard Cloudflare Stream endpoints
    return {
      available: true,
      isDemo: false,
      hlsUrl: standardHls,
      dashUrl: standardDash,
      embedUrl: standardEmbed,
      thumbnail: standardThumb,
      status: 'READY',
    };
  }

  /**
   * Fetches metadata for a video directly from Cloudflare Stream API
   */
  public static async getVideo(videoId: string): Promise<CloudflareStreamVideoDetails | null> {
    const { accountId, apiToken } = this.getCredentials();
    if (!accountId || !apiToken) return null;

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoId}`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Cloudflare API responded with status ${response.status}`);
      }

      const json = await response.json();
      return json?.result || null;
    } catch (err: any) {
      console.error(`[CLOUDFLARE STREAM] getVideo(${videoId}) error:`, err.message);
      return null;
    }
  }

  /**
   * Deletes a video from Cloudflare Stream
   */
  public static async deleteVideo(videoId: string): Promise<boolean> {
    const { accountId, apiToken } = this.getCredentials();
    if (!accountId || !apiToken) return false;

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
      });
      return response.ok;
    } catch (err: any) {
      console.error(`[CLOUDFLARE STREAM] deleteVideo(${videoId}) error:`, err.message);
      return false;
    }
  }

  /**
   * Generates a signed Cloudflare Stream token for restricted playback
   */
  public static async createSignedToken(videoId: string, expiresInSeconds = 7200): Promise<string | null> {
    const { accountId, apiToken } = this.getCredentials();
    if (!accountId || !apiToken) return null;

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoId}/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.result?.token || null;
    } catch (err: any) {
      console.error(`[CLOUDFLARE STREAM] createSignedToken error:`, err.message);
      return null;
    }
  }

  /**
   * Generates a Direct Upload URL for uploading video directly from admin dashboard
   */
  public static async createDirectUploadUrl(maxDurationSeconds = 7200): Promise<{ uploadURL: string; uid: string } | null> {
    const { accountId, apiToken } = this.getCredentials();
    if (!accountId || !apiToken) return null;

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds,
          requireSignedURLs: false,
        }),
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.result || null;
    } catch (err: any) {
      console.error(`[CLOUDFLARE STREAM] createDirectUploadUrl error:`, err.message);
      return null;
    }
  }
}
