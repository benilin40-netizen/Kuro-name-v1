/**
 * media.cm Video Provider Service
 * Official Website: https://media.cm/?op=my_account
 * 
 * Integration Verification:
 * - Public API: None documented.
 * - Platform Protection: Cloudflare Turnstile anti-bot challenge active (HTTP 403 on automated requests).
 * - Supported Embedding: Manual Administrator Embed URL / Video Code Entry with strict domain validation.
 * 
 * Validation:
 * - Allowed domains: media.cm, www.media.cm, *.media.cm
 * - Allowed embed patterns:
 *   - https://media.cm/embed-{code}.html
 *   - https://media.cm/e/{code}
 *   - https://www.media.cm/embed-{code}.html
 */

export interface MediaCmValidationResult {
  isValid: boolean;
  normalizedEmbedUrl: string | null;
  videoCode: string | null;
  errorMessage?: string;
}

export class MediaCmService {
  private static instance: MediaCmService;

  public static getInstance(): MediaCmService {
    if (!MediaCmService.instance) {
      MediaCmService.instance = new MediaCmService();
    }
    return MediaCmService.instance;
  }

  /**
   * Strictly validates and normalizes an administrator-supplied media.cm URL or video code
   */
  public validateEmbedUrl(input: string): MediaCmValidationResult {
    if (!input || typeof input !== 'string') {
      return {
        isValid: false,
        normalizedEmbedUrl: null,
        videoCode: null,
        errorMessage: 'Empty media.cm input provided.',
      };
    }

    const trimmed = input.trim();

    // 1. If an iframe snippet was pasted: extract src="..."
    if (trimmed.includes('<iframe') && trimmed.includes('src=')) {
      const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
      if (srcMatch && srcMatch[1]) {
        return this.validateEmbedUrl(srcMatch[1]);
      }
    }

    // 2. If just a video code was entered (e.g. "abc123xyz")
    if (/^[a-zA-Z0-9_-]{4,32}$/.test(trimmed) && !trimmed.includes('.') && !trimmed.includes('/')) {
      const normalizedEmbedUrl = `https://media.cm/embed-${trimmed}.html`;
      return {
        isValid: true,
        normalizedEmbedUrl,
        videoCode: trimmed,
      };
    }

    // 3. Must be a valid HTTPS URL
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return {
        isValid: false,
        normalizedEmbedUrl: null,
        videoCode: null,
        errorMessage: 'Invalid URL format. Must be a valid https:// URL.',
      };
    }

    if (url.protocol !== 'https:') {
      return {
        isValid: false,
        normalizedEmbedUrl: null,
        videoCode: null,
        errorMessage: 'media.cm embed must use secure https:// protocol.',
      };
    }

    // 4. Validate domain is media.cm or a subdomain of media.cm
    const hostname = url.hostname.toLowerCase();
    const isMediaCmDomain = hostname === 'media.cm' || hostname.endsWith('.media.cm');
    if (!isMediaCmDomain) {
      return {
        isValid: false,
        normalizedEmbedUrl: null,
        videoCode: null,
        errorMessage: `Forbidden domain "${hostname}". Only official media.cm domains are authorized.`,
      };
    }

    const pathname = url.pathname;

    // Pattern A: /embed-{code}.html
    const embedHtmlMatch = pathname.match(/\/embed-([a-zA-Z0-9_-]+)\.html/i);
    if (embedHtmlMatch && embedHtmlMatch[1]) {
      return {
        isValid: true,
        normalizedEmbedUrl: `https://media.cm/embed-${embedHtmlMatch[1]}.html`,
        videoCode: embedHtmlMatch[1],
      };
    }

    // Pattern B: /e/{code}
    const eMatch = pathname.match(/\/e\/([a-zA-Z0-9_-]+)/i);
    if (eMatch && eMatch[1]) {
      return {
        isValid: true,
        normalizedEmbedUrl: `https://media.cm/embed-${eMatch[1]}.html`,
        videoCode: eMatch[1],
      };
    }

    // Pattern C: direct file code link: /{code} (e.g. https://media.cm/abc123xyz)
    const directCodeMatch = pathname.match(/^\/([a-zA-Z0-9_-]{5,32})$/);
    if (directCodeMatch && directCodeMatch[1] && !pathname.includes('.')) {
      return {
        isValid: true,
        normalizedEmbedUrl: `https://media.cm/embed-${directCodeMatch[1]}.html`,
        videoCode: directCodeMatch[1],
      };
    }

    return {
      isValid: false,
      normalizedEmbedUrl: null,
      videoCode: null,
      errorMessage: 'Unrecognized media.cm URL format. Expected https://media.cm/embed-{code}.html or video code.',
    };
  }

  /**
   * Tests media.cm host status and reports live diagnostics
   */
  public async probeHostStatus(): Promise<{
    reachable: boolean;
    cloudflareProtected: boolean;
    hasPublicApi: boolean;
    message: string;
  }> {
    try {
      const res = await fetch('https://media.cm/?op=my_account', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KURO-NAMI/1.0',
        },
      });

      const bodyText = await res.text();
      const isCloudflare =
        res.status === 403 ||
        bodyText.includes('challenges.cloudflare.com') ||
        bodyText.includes('Just a moment...');

      return {
        reachable: true,
        cloudflareProtected: isCloudflare,
        hasPublicApi: false,
        message: isCloudflare
          ? 'media.cm is protected by Cloudflare Turnstile (HTTP 403). Automated API queries are blocked; manual official embed URLs are supported.'
          : `media.cm responded with HTTP ${res.status}. Manual embed URLs supported.`,
      };
    } catch (err: any) {
      return {
        reachable: false,
        cloudflareProtected: false,
        hasPublicApi: false,
        message: `Network error reaching media.cm: ${err.message}`,
      };
    }
  }
}

export const mediaCmService = MediaCmService.getInstance();
