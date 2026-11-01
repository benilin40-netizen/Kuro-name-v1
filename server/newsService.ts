import { XMLParser } from 'fast-xml-parser';
import crypto from 'node:crypto';
import { db } from './db.ts';

export interface NewsVideo {
  type: 'embed' | 'mp4' | 'hls';
  url: string;
  thumbnail?: string;
  provider?: string;
  title?: string;
  duration?: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  image: string | null;
  category: string | null;
  author: string | null;
  anime_id?: number | null;
  anime_title?: string | null;
  video?: NewsVideo | null;
}

export interface NewsSourceStatus {
  status: 'ok' | 'error';
  lastUpdated: string;
  lastError?: string | null;
}

export interface NewsApiResponse {
  articles: NewsArticle[];
  sources: {
    animeNewsNetwork: NewsSourceStatus;
    crunchyroll: NewsSourceStatus;
  };
  updatedAt: string;
}

// In-memory article image cache (URL -> og:image)
const ogImageCache = new Map<string, string | null>();

// Server-side news cache
let cachedNewsResponse: NewsApiResponse | null = null;
let lastCacheTime = 0;
const NEWS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

export class NewsService {
  private static annStatus: NewsSourceStatus = {
    status: 'ok',
    lastUpdated: new Date().toISOString(),
  };

  private static crunchyrollStatus: NewsSourceStatus = {
    status: 'ok',
    lastUpdated: new Date().toISOString(),
  };

  private static cleanText(html: string): string {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static detectVideo(item: any): NewsVideo | null {
    if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('video/')) {
        return {
            type: item.enclosure.type.includes('mp4') ? 'mp4' : 'hls',
            url: item.enclosure.url,
            provider: 'rss-enclosure'
        };
    }
    const mediaContent = item['media:content'];
    if (mediaContent && mediaContent.url && mediaContent.type && mediaContent.type.startsWith('video/')) {
         return {
            type: mediaContent.type.includes('mp4') ? 'mp4' : 'hls',
            url: mediaContent.url,
            provider: 'media-content'
        };
    }
    return null;
  }

  private static detectVideo(item: any): NewsVideo | null {
    if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('video/')) {
        return {
            type: item.enclosure.type.includes('mp4') ? 'mp4' : 'hls',
            url: item.enclosure.url,
            provider: 'rss-enclosure'
        };
    }
    const mediaContent = item['media:content'];
    if (mediaContent && mediaContent.url && mediaContent.type && mediaContent.type.startsWith('video/')) {
         return {
            type: mediaContent.type.includes('mp4') ? 'mp4' : 'hls',
            url: mediaContent.url,
            provider: 'media-content'
        };
    }
    return null;
  }

  /**
   * Safely fetches server-side open graph image for an article if not included in RSS
   */
  private static async fetchOgImage(articleUrl: string): Promise<string | null> {
    if (!articleUrl || !articleUrl.startsWith('http')) return null;
    if (ogImageCache.has(articleUrl)) {
      return ogImageCache.get(articleUrl) || null;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(articleUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        ogImageCache.set(articleUrl, null);
        return null;
      }

      const html = await res.text();
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

      if (ogMatch && ogMatch[1] && ogMatch[1].startsWith('http')) {
        const found = ogMatch[1].trim();
        ogImageCache.set(articleUrl, found);
        return found;
      }
    } catch (_e) {
      // Non-blocking timeout or network error
    }

    ogImageCache.set(articleUrl, null);
    return null;
  }

  /**
   * Categorizes article using keywords into requested tabs:
   * ALL, LATEST, ANIME, MANGA, INDUSTRY, ANNOUNCEMENTS, TRAILERS, GAMES
   */
  private static categorizeArticle(title: string, desc: string): string {
    const combined = `${title} ${desc}`.toLowerCase();

    if (combined.includes('manga') || combined.includes('manhwa') || combined.includes('light novel') || combined.includes('serialization')) {
      return 'MANGA';
    }
    if (combined.includes('game') || combined.includes('playstation') || combined.includes('nintendo') || combined.includes('steam') || combined.includes('rpg')) {
      return 'GAMES';
    }
    if (combined.includes('trailer') || combined.includes('teaser') || combined.includes('promo video') || combined.includes('pv ') || combined.includes('main visual')) {
      return 'TRAILERS';
    }
    if (combined.includes('announces') || combined.includes('reveals') || combined.includes('confirmed') || combined.includes('season ') || combined.includes('greenlit')) {
      return 'ANNOUNCEMENTS';
    }
    if (combined.includes('industry') || combined.includes('sales') || combined.includes('box office') || combined.includes('award') || combined.includes('studio')) {
      return 'INDUSTRY';
    }
    return 'ANIME';
  }

  /**
   * Matches article to database anime if title matches
   */
  private static matchAnime(title: string): { animeId: number | null; animeTitle: string | null } {
    const t = title.toLowerCase();
    try {
      const animeRows = db.prepare('SELECT id, anilist_id, title, title_english, title_romaji FROM qwish_anime LIMIT 50').all() as any[];
      for (const row of animeRows) {
        const title1 = (row.title || '').toLowerCase();
        const title2 = (row.title_english || '').toLowerCase();
        const title3 = (row.title_romaji || '').toLowerCase();

        if (title1 && title1.length > 3 && t.includes(title1)) {
          return { animeId: row.anilist_id || row.id, animeTitle: row.title };
        }
        if (title2 && title2.length > 3 && t.includes(title2)) {
          return { animeId: row.anilist_id || row.id, animeTitle: row.title_english };
        }
        if (title3 && title3.length > 3 && t.includes(title3)) {
          return { animeId: row.anilist_id || row.id, animeTitle: row.title_romaji };
        }
      }
    } catch (_e) {}
    return { animeId: null, animeTitle: null };
  }

  /**
   * Ingests Anime News Network RSS
   */
  private static async fetchAnimeNewsNetwork(): Promise<NewsArticle[]> {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const urls = [
      'https://www.animenewsnetwork.com/news/rss.xml?ann-edition=us',
      'https://news.google.com/rss/search?q=site:animenewsnetwork.com+when:7d&hl=en-US&gl=US&ceid=US:en',
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
        });

        if (!res.ok) {
          console.warn(`[NEWS] Anime News Network (${url}) status: ${res.status}`);
          continue;
        }

        const xml = await res.text();
        const parsed = parser.parse(xml);
        const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        const itemArray = Array.isArray(items) ? items : [items];

        const articles: NewsArticle[] = [];
        for (const item of itemArray) {
          const rawTitle = item.title || '';
          const title = NewsService.cleanText(rawTitle);
          if (!title || title.length < 5) continue;

          let link = (item.link?.href || item.link || item.guid || '').trim();
          if (typeof link === 'object') link = link['#text'] || '';
          if (!link || !link.startsWith('http')) continue;

          // If Google News redirect link, extract real URL if present
          if (link.includes('news.google.com') && item.source?.url) {
            link = item.source.url;
          }

          const rawDesc = item.description || item['content:encoded'] || item.summary || '';
          const description = NewsService.cleanText(rawDesc).slice(0, 300) || null;

          let image: string | null = null;
          if (item.enclosure?.url) {
            image = item.enclosure.url;
          } else if (item['media:content']?.url) {
            image = item['media:content'].url;
          } else if (item['media:thumbnail']?.url) {
            image = item['media:thumbnail'].url;
          }

          // If no image in enclosure, check <img> in description HTML
          if (!image && typeof rawDesc === 'string') {
            const imgMatch = rawDesc.match(/<img[^>]+src=["'](https?:\/\/[^"'\s]+)["']/i);
            if (imgMatch && imgMatch[1] && !imgMatch[1].includes('pixel')) {
              image = imgMatch[1];
            }
          }

          let publishedAt = new Date().toISOString();
          const pubDate = item.pubDate || item.published || item.updated;
          if (pubDate) {
            const parsedTs = Date.parse(pubDate);
            if (!isNaN(parsedTs)) publishedAt = new Date(parsedTs).toISOString();
          }

          const author = item['dc:creator'] || item.author?.name || null;
          const category = NewsService.categorizeArticle(title, description || '');
          const match = NewsService.matchAnime(title);

          const hash = crypto.createHash('sha256').update(link || title).digest('hex').slice(0, 16);
          const id = `ann_${hash}`;
          const video = NewsService.detectVideo(item);

          articles.push({
            id,
            title,
            description,
            url: link,
            source: 'Anime News Network',
            publishedAt,
            image,
            category,
            author,
            anime_id: match.animeId,
            anime_title: match.animeTitle,
            video,
          });
        }

        if (articles.length > 0) {
          NewsService.annStatus = {
            status: 'ok',
            lastUpdated: new Date().toISOString(),
          };
          console.log(`[NEWS] Anime News Network: OK (${articles.length} articles)`);
          return articles;
        }
      } catch (e: any) {
        console.warn(`[NEWS] ANN fetch error for ${url}:`, e.message);
      }
    }

    NewsService.annStatus = {
      status: 'error',
      lastUpdated: new Date().toISOString(),
      lastError: 'Feed unavailable',
    };
    console.warn('[NEWS] Anime News Network: Unavailable');
    return [];
  }

  /**
   * Ingests Crunchyroll News RSS
   */
  private static async fetchCrunchyrollNews(): Promise<NewsArticle[]> {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const urls = [
      'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss',
      'https://www.crunchyroll.com/news/rss',
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
        });

        if (!res.ok) {
          console.warn(`[NEWS] Crunchyroll (${url}) status: ${res.status}`);
          continue;
        }

        const xml = await res.text();
        const parsed = parser.parse(xml);
        const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        const itemArray = Array.isArray(items) ? items : [items];

        const articles: NewsArticle[] = [];
        for (const item of itemArray) {
          const rawTitle = item.title || '';
          const title = NewsService.cleanText(rawTitle);
          if (!title || title.length < 5) continue;

          let link = (item.link?.href || item.link || item.guid || '').trim();
          if (typeof link === 'object') link = link['#text'] || '';
          if (!link || !link.startsWith('http')) continue;

          const rawDesc = item.description || item['content:encoded'] || item.summary || '';
          const description = NewsService.cleanText(rawDesc).slice(0, 300) || null;

          let image: string | null = null;
          if (item.enclosure?.url) {
            image = item.enclosure.url;
          } else if (item['media:content']?.url) {
            image = item['media:content'].url;
          } else if (item['media:thumbnail']?.url) {
            image = item['media:thumbnail'].url;
          }

          if (!image && typeof rawDesc === 'string') {
            const imgMatch = rawDesc.match(/<img[^>]+src=["'](https?:\/\/[^"'\s]+)["']/i);
            if (imgMatch && imgMatch[1] && !imgMatch[1].includes('pixel')) {
              image = imgMatch[1];
            }
          }

          let publishedAt = new Date().toISOString();
          const pubDate = item.pubDate || item.published || item.updated;
          if (pubDate) {
            const parsedTs = Date.parse(pubDate);
            if (!isNaN(parsedTs)) publishedAt = new Date(parsedTs).toISOString();
          }

          const author = item['dc:creator'] || item.author?.name || 'Crunchyroll Staff';
          const category = NewsService.categorizeArticle(title, description || '');
          const match = NewsService.matchAnime(title);

          const hash = crypto.createHash('sha256').update(link || title).digest('hex').slice(0, 16);
          const id = `cr_${hash}`;
          const video = NewsService.detectVideo(item);

          articles.push({
            id,
            title,
            description,
            url: link,
            source: 'Crunchyroll News',
            publishedAt,
            image,
            category,
            author,
            anime_id: match.animeId,
            anime_title: match.animeTitle,
            video,
          });
        }

        if (articles.length > 0) {
          NewsService.crunchyrollStatus = {
            status: 'ok',
            lastUpdated: new Date().toISOString(),
          };
          console.log(`[NEWS] Crunchyroll: OK (${articles.length} articles)`);
          return articles;
        }
      } catch (e: any) {
        console.warn(`[NEWS] Crunchyroll fetch error for ${url}:`, e.message);
      }
    }

    NewsService.crunchyrollStatus = {
      status: 'error',
      lastUpdated: new Date().toISOString(),
      lastError: 'Feed unavailable',
    };
    console.warn('[NEWS] Crunchyroll: Unavailable');
    return [];
  }

  /**
   * Deduplicates articles by normalized URL and title
   */
  private static deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const unique: NewsArticle[] = [];

    for (const item of articles) {
      const normUrl = item.url.replace(/\/+$/, '').toLowerCase();
      const normTitle = item.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

      if (seenIds.has(item.id) || seenUrls.has(normUrl) || (normTitle && seenTitles.has(normTitle))) {
        continue;
      }

      seenIds.add(item.id);
      seenUrls.add(normUrl);
      if (normTitle) seenTitles.add(normTitle);
      unique.push(item);
    }

    return unique;
  }

  /**
   * Main news retrieval with multi-source ingestion, real og:image enrichment, and deduplication
   */
  public static async getNews(forceRefresh = false): Promise<NewsApiResponse> {
    const now = Date.now();
    if (!forceRefresh && cachedNewsResponse && now - lastCacheTime < NEWS_CACHE_TTL_MS) {
      return cachedNewsResponse;
    }

    // Fetch in parallel so failure of one does not crash the other
    const [annResult, crResult] = await Promise.allSettled([
      NewsService.fetchAnimeNewsNetwork(),
      NewsService.fetchCrunchyrollNews(),
    ]);

    const annArticles = annResult.status === 'fulfilled' ? annResult.value : [];
    const crArticles = crResult.status === 'fulfilled' ? crResult.value : [];

    const combined = [...annArticles, ...crArticles];
    const deduplicated = NewsService.deduplicateArticles(combined);

    // Sort newest first
    deduplicated.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

    // Server-side og:image resolution for top articles that don't have an RSS enclosure image
    const imagePromises = deduplicated.slice(0, 15).map(async (article) => {
      if (!article.image && article.url) {
        try {
          const ogImg = await NewsService.fetchOgImage(article.url);
          if (ogImg) article.image = ogImg;
        } catch (_e) {}
      }
    });

    await Promise.allSettled(imagePromises);

    const response: NewsApiResponse = {
      articles: deduplicated,
      sources: {
        animeNewsNetwork: NewsService.annStatus,
        crunchyroll: NewsService.crunchyrollStatus,
      },
      updatedAt: new Date().toISOString(),
    };

    cachedNewsResponse = response;
    lastCacheTime = now;
    return response;
  }

  /**
   * Manual refresh trigger
   */
  public static async refresh(): Promise<NewsApiResponse> {
    return NewsService.getNews(true);
  }

  /**
   * Background ingestion helper for server startup
   */
  public static async fetchAndIngestRealNews(): Promise<{ totalInDb: number; ingested: number }> {
    const res = await NewsService.getNews(true);
    return { totalInDb: res.articles.length, ingested: res.articles.length };
  }
}
