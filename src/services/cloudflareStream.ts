/**
 * Cloudflare Stream Client Service
 * Interacts with QWISH backend to resolve video playback, statuses, and upload URLs.
 */

export interface PlaybackResponse {
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

export interface CloudflareStatusResponse {
  uid: string;
  readyToStream: boolean;
  status: {
    state: 'inprogress' | 'ready' | 'error' | 'queued';
    pctComplete?: string;
  };
}

export class CloudflareStreamClient {
  /**
   * Resolves playback stream for an episode
   */
  static async getEpisodePlayback(episodeId: string): Promise<PlaybackResponse> {
    try {
      const res = await fetch(`/api/videos/${encodeURIComponent(episodeId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          return {
            available: false,
            status: 'UNAVAILABLE',
            message: 'Episode video not available yet.',
          };
        }
        return {
          available: false,
          status: 'ERROR',
          message: 'This episode is temporarily unavailable. Please try again later.',
        };
      }
      return await res.json();
    } catch (_err) {
      return {
        available: false,
        status: 'ERROR',
        message: 'Network error connecting to video stream.',
      };
    }
  }

  /**
   * Check status of a video ID directly from backend Cloudflare adapter
   */
  static async checkVideoStatus(videoId: string): Promise<PlaybackResponse> {
    try {
      const res = await fetch(`/api/cloudflare/status/${encodeURIComponent(videoId)}`);
      if (!res.ok) {
        return {
          available: false,
          status: 'UNAVAILABLE',
          message: 'Video ID status check failed',
        };
      }
      return await res.json();
    } catch (_err) {
      return {
        available: false,
        status: 'ERROR',
        message: 'Network timeout checking video status',
      };
    }
  }
}
