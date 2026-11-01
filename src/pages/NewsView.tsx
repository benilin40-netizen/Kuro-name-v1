import React, { useState, useEffect, useMemo } from 'react';
import { NewsArticle, NewsApiClient, NewsApiResponse } from '../services/newsApi.ts';
import { NewsVideo } from '../../server/newsService';
import { NewsVideoPlayer } from '../components/news/NewsVideoPlayer';
import {
  Newspaper,
  Calendar,
  ExternalLink,
  Search,
  RefreshCw,
  X,
  Tv,
  User,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface NewsViewProps {
  initialArticleId?: string;
  onSelectAnime?: (animeId: number) => void;
}

export function formatRelativeTime(dateIso?: string | null): string {
  if (!dateIso) return '';
  const ts = Date.parse(dateIso);
  if (isNaN(ts)) return dateIso;

  const now = Date.now();
  const diffSecs = Math.floor((now - ts) / 1000);

  if (diffSecs < 60) return 'Just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) {
    const hrs = Math.floor(diffSecs / 3600);
    return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diffSecs < 172800) return 'Yesterday';
  if (diffSecs < 604800) {
    const days = Math.floor(diffSecs / 86400);
    return `${days} days ago`;
  }

  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Clean neutral "Image unavailable" container when no legitimate image exists
 */
const ArticleImage: React.FC<{
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}> = ({ src, alt, className = '', eager = false }) => {
  const [loadError, setLoadError] = useState(!src);

  if (!src || loadError) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-[#10121a] text-slate-500 border border-white/5`}>
        <Newspaper className="w-8 h-8 opacity-30 mb-1" />
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
          Image unavailable
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${className} object-cover transition-transform duration-500 group-hover:scale-102`}
      onError={() => setLoadError(true)}
      loading={eager ? 'eager' : 'lazy'}
    />
  );
};

export const NewsView: React.FC<NewsViewProps> = ({
  initialArticleId,
  onSelectAnime,
}) => {
  const [newsData, setNewsData] = useState<NewsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'relevant'>('latest');
  const [activeArticle, setActiveArticle] = useState<NewsArticle | null>(null);

  const [activeVideo, setActiveVideo] = useState<NewsVideo | null>(null);

  const categories = [
    'ALL',
    'LATEST',
    'ANIME',
    'MANGA',
    'INDUSTRY',
    'ANNOUNCEMENTS',
    'TRAILERS',
    'GAMES',
  ];

  const loadNews = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = forceRefresh
        ? await NewsApiClient.refreshNews()
        : await NewsApiClient.getNews();

      setNewsData(data);

      if (initialArticleId && data.articles.length > 0) {
        const found = data.articles.find((a) => a.id === initialArticleId);
        if (found) setActiveArticle(found);
      }
    } catch (err: any) {
      console.error('[NEWS VIEW] Load error:', err);
      setError('News is temporarily unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNews();

    // Auto-refresh periodically every 12 minutes
    const interval = setInterval(() => {
      loadNews(false);
    }, 12 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Filter & Search articles
  const filteredArticles = useMemo(() => {
    if (!newsData?.articles) return [];
    let list = [...newsData.articles];

    // Category Filter
    if (selectedCategory !== 'ALL' && selectedCategory !== 'LATEST') {
      list = list.filter((a) => (a.category || '').toUpperCase() === selectedCategory);
    }

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          a.source.toLowerCase().includes(q) ||
          (a.author && a.author.toLowerCase().includes(q))
      );
    }

    // Sorting
    if (sortBy === 'oldest') {
      list.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    } else if (sortBy === 'relevant' && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list.sort((a, b) => {
        const aTitleMatch = a.title.toLowerCase().includes(q) ? 2 : 0;
        const bTitleMatch = b.title.toLowerCase().includes(q) ? 2 : 0;
        return bTitleMatch - aTitleMatch;
      });
    } else {
      list.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    }

    return list;
  }, [newsData, selectedCategory, searchQuery, sortBy]);

  const featuredArticle = useMemo(() => {
    if (selectedCategory !== 'ALL' || searchQuery.trim()) return null;
    return filteredArticles.length > 0 ? filteredArticles[0] : null;
  }, [filteredArticles, selectedCategory, searchQuery]);

  const regularArticles = useMemo(() => {
    if (featuredArticle && selectedCategory === 'ALL' && !searchQuery.trim()) {
      return filteredArticles.slice(1);
    }
    return filteredArticles;
  }, [filteredArticles, featuredArticle, selectedCategory, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* 1. Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-[11px] font-bold uppercase tracking-wider">
              Verified RSS Ingestion
            </span>
            {newsData?.updatedAt && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Clock className="w-3 h-3 text-slate-500" />
                Updated {formatRelativeTime(newsData.updatedAt)}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
            Latest Anime News
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Directly ingested from Anime News Network and Crunchyroll News. No fictional headlines or generated images.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadNews(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-lg bg-[#0e1017] border border-white/5 hover:bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-500 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Filters, Search & Sort */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shrink-0 ${
                selectedCategory === cat
                  ? 'bg-rose-600 text-white'
                  : 'bg-white/5 border border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search news..."
              className="w-full rounded-lg bg-[#0e1017] border border-white/5 pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg bg-[#0e1017] border border-white/5 px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-rose-500/50"
          >
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
            <option value="relevant">Most Relevant</option>
          </select>
        </div>
      </div>

      {/* 3. Error Banner */}
      {error && !loading && (
        <div className="p-8 rounded-xl bg-[#0e1017] border border-rose-500/20 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto opacity-75" />
          <h3 className="text-base font-bold text-white">News is temporarily unavailable.</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Unable to connect to external anime news feeds right now.
          </p>
          <button
            onClick={() => loadNews(true)}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* 4. Loading Skeletons */}
      {loading && (
        <div className="space-y-6">
          <div className="h-72 rounded-xl bg-white/5 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[16/10] rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* 5. Featured Article Hero (Real article only) */}
      {!loading && !error && featuredArticle && (
        <div className="group relative rounded-xl bg-[#0e1017] border border-white/5 overflow-hidden transition-colors hover:border-white/15">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            <div className="lg:col-span-7 relative aspect-video lg:aspect-auto h-full min-h-[260px] lg:min-h-[340px] overflow-hidden bg-slate-950">
              <ArticleImage
                src={featuredArticle.image}
                alt={featuredArticle.title}
                className="w-full h-full"
                eager
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e1017] via-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#0e1017]" />
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider">
                  FEATURED
                </span>
                {featuredArticle.category && (
                  <span className="px-2.5 py-1 rounded bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-300 border border-white/5 uppercase tracking-wider">
                    {featuredArticle.category}
                  </span>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-rose-400 font-bold uppercase tracking-wider">
                  <span>{featuredArticle.source}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(featuredArticle.publishedAt)}</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white group-hover:text-rose-400 transition-colors leading-snug">
                  {featuredArticle.title}
                </h2>
                {featuredArticle.description && (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-3">
                    {featuredArticle.description}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                {featuredArticle.anime_id && onSelectAnime ? (
                  <button
                    onClick={() => onSelectAnime(featuredArticle.anime_id!)}
                    className="inline-flex items-center gap-1.5 font-bold text-rose-400 hover:text-rose-300 hover:underline"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>{featuredArticle.anime_title || 'View Anime'}</span>
                  </button>
                ) : (
                  <span className="text-slate-500 text-[11px] font-medium">Official Publisher Story</span>
                )}

                <a
                  href={featuredArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-white hover:text-rose-400 transition-colors"
                >
                  <span>Read original</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {featuredArticle.video && (
                  <button
                    onClick={() => setActiveVideo(featuredArticle.video || null)}
                    className="inline-flex items-center gap-1.5 font-bold text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    <span>Watch Video</span>
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Empty State */}
      {!loading && !error && filteredArticles.length === 0 && (
        <div className="p-16 rounded-xl bg-[#0e1017] border border-white/5 text-center text-slate-400 space-y-3">
          <Newspaper className="w-8 h-8 text-rose-500 mx-auto opacity-50" />
          <h3 className="text-sm font-bold text-white">No matching news found.</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `No articles found matching "${searchQuery}".`
              : 'No articles currently available in this category.'}
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('ALL');
            }}
            className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-500 transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* 7. Articles Grid */}
      {!loading && !error && regularArticles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {searchQuery ? `Search Results (${regularArticles.length})` : 'Recent Headlines'}
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              {regularArticles.length} stories
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regularArticles.map((article, idx) => (
              <div
                key={`${article.id}_${idx}`}
                className="group flex flex-col rounded-xl bg-[#0e1017] border border-white/5 hover:border-white/15 overflow-hidden transition-colors"
              >
                {/* Article Image */}
                <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                  <ArticleImage
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full"
                  />
                  {article.category && (
                    <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/80 text-[10px] font-bold text-rose-400 border border-white/5 uppercase tracking-wider">
                      {article.category}
                    </div>
                  )}
                  {article.anime_title && (
                    <div className="absolute bottom-3 left-3 right-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-black/80 text-[10px] font-semibold text-slate-200 border border-white/5 truncate max-w-full">
                        <Tv className="w-3 h-3 inline mr-1 text-rose-400" /> {article.anime_title}
                      </span>
                    </div>
                  )}
                </div>

                {/* Article Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-rose-400 transition-colors line-clamp-2 leading-snug">
                      {article.title}
                    </h3>
                    {article.description && (
                      <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                        {article.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="space-y-0.5 truncate max-w-[150px]">
                      <span className="font-bold text-slate-300 block truncate">
                        {article.source}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatRelativeTime(article.publishedAt)}
                      </span>
                    </div>

                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-rose-400 hover:text-rose-300 text-xs shrink-0"
                    >
                      <span>Read original</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {article.video && (
                      <button
                        onClick={() => setActiveVideo(article.video || null)}
                        className="inline-flex items-center gap-1 font-bold text-slate-300 hover:text-rose-400 text-xs shrink-0"
                      >
                        <span>Watch Video</span>
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. Video Player Modal */}
      {activeVideo && (
        <NewsVideoPlayer video={activeVideo} onClose={() => setActiveVideo(null)} />
      )}

      {/* 8. Active Article Modal (Optional quick reader) */}
      {activeArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-xl bg-[#0e1017] border border-white/10 overflow-hidden flex flex-col max-h-[85vh]">
            <button
              onClick={() => setActiveArticle(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/70 text-slate-400 hover:text-white backdrop-blur-md transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-y-auto">
              <div className="relative aspect-video w-full">
                <ArticleImage
                  src={activeArticle.image}
                  alt={activeArticle.title}
                  className="w-full h-full"
                />
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-xs text-rose-400 font-bold uppercase">
                  <span>{activeArticle.source}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(activeArticle.publishedAt)}</span>
                </div>

                <h2 className="text-lg font-black text-white leading-snug">
                  {activeArticle.title}
                </h2>

                {activeArticle.description && (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {activeArticle.description}
                  </p>
                )}

                <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Publisher: <strong className="text-slate-300">{activeArticle.source}</strong>
                  </span>

                  <a
                    href={activeArticle.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors"
                  >
                    <span>Read original article</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
