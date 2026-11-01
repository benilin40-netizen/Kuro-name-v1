/**
 * Real Anime News Client API
 * Fetches real, verified anime news articles from QWISH /api/news backend ingestion.
 * 
 * Sources: Anime News Network, Crunchyroll News
 */

import { NewsVideo } from '../types/news';

export interface NewsArticle {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  source: string;
  publishedAt: string;
  image?: string | null;
  category?: string | null;
  author?: string | null;
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

export class NewsApiClient {
  /**
   * Fetches latest aggregated news articles from backend
   */
  static async getNews(forceRefresh = false): Promise<NewsApiResponse> {
    try {
      const url = forceRefresh ? '/api/news?refresh=true' : '/api/news';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data: NewsApiResponse = await res.json();
      if (Array.isArray(data?.articles)) {
        const seenIds = new Set<string>();
        data.articles = data.articles.map((item, idx) => {
          let id = item.id;
          if (!id || seenIds.has(id)) {
            id = `${id || 'article'}_${idx}_${Date.now().toString(36)}`;
          }
          seenIds.add(id);
          return { ...item, id };
        });
      }
      return data;
    } catch (err: any) {
      console.warn('[NEWS API] Failed to fetch news:', err.message);
      return {
        articles: [],
        sources: {
          animeNewsNetwork: { status: 'error', lastUpdated: new Date().toISOString() },
          crunchyroll: { status: 'error', lastUpdated: new Date().toISOString() },
        },
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Triggers manual backend refresh of all news feeds
   */
  static async refreshNews(): Promise<NewsApiResponse> {
    try {
      const res = await fetch('/api/news/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err: any) {
      console.error('[NEWS API] Refresh failed:', err);
      return this.getNews(true);
    }
  }
}
