import React, { useState, useEffect } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { AnimeCard } from '../components/AnimeCard.tsx';
import { Search, Filter, RotateCcw, Loader2, Sparkles } from 'lucide-react';

interface AnimeBrowseViewProps {
  initialFilters?: {
    query?: string;
    genre?: string;
    format?: string;
    status?: string;
    year?: number;
    season?: string;
  };
  onSelectAnime: (animeId: number) => void;
}

export const AnimeBrowseView: React.FC<AnimeBrowseViewProps> = ({
  initialFilters = {},
  onSelectAnime,
}) => {
  const [query, setQuery] = useState(initialFilters?.query || '');
  const [selectedGenre, setSelectedGenre] = useState(initialFilters?.genre || 'ALL');
  const [selectedFormat, setSelectedFormat] = useState(initialFilters?.format || 'ALL');
  const [selectedStatus, setSelectedStatus] = useState(initialFilters?.status || 'ALL');
  const [selectedSeason, setSelectedSeason] = useState(initialFilters?.season || 'ALL');
  const [selectedSort, setSelectedSort] = useState('POPULARITY_DESC');
  const [selectedYear, setSelectedYear] = useState<number | undefined>(initialFilters?.year);

  const [animeList, setAnimeList] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  const genres = [
    'ALL', 'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance',
    'Horror', 'Mystery', 'Sports', 'Supernatural', 'Sci-Fi', 'Thriller',
    'Slice of Life', 'Music', 'Historical'
  ];

  const formats = ['ALL', 'TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'];
  const statuses = ['ALL', 'RELEASING', 'FINISHED', 'NOT_YET_RELEASED'];
  const seasons = ['ALL', 'WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const sorts = [
    { value: 'POPULARITY_DESC', label: 'Most Popular' },
    { value: 'SCORE_DESC', label: 'Highest Rated' },
    { value: 'TRENDING_DESC', label: 'Trending' },
    { value: 'START_DATE_DESC', label: 'Newest Release' },
    { value: 'FAVOURITES_DESC', label: 'Most Favorited' },
  ];

  const fetchAnime = async (pageNum = 1) => {
    try {
      setLoading(true);
      const data = await ClientAnimeService.searchAnime({
        query: query.trim() || undefined,
        genre: selectedGenre !== 'ALL' ? selectedGenre : undefined,
        format: selectedFormat !== 'ALL' ? selectedFormat : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        season: selectedSeason !== 'ALL' ? selectedSeason : undefined,
        year: selectedYear,
        sort: selectedSort,
        page: pageNum,
        perPage: 24,
      });

      if (pageNum === 1) {
        setAnimeList(data.media || []);
      } else {
        setAnimeList((prev) => [...prev, ...(data.media || [])]);
      }
      setHasNextPage(data.pageInfo?.hasNextPage || false);
    } catch (err) {
      console.error('Error fetching browse anime:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchAnime(1);
  }, [query, selectedGenre, selectedFormat, selectedStatus, selectedSeason, selectedSort, selectedYear]);

  const handleResetFilters = () => {
    setQuery('');
    setSelectedGenre('ALL');
    setSelectedFormat('ALL');
    setSelectedStatus('ALL');
    setSelectedSeason('ALL');
    setSelectedSort('POPULARITY_DESC');
    setSelectedYear(undefined);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Anime Discovery & Index
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Explore over 15,000 anime productions with real-time filters and live broadcasting metadata.
        </p>
      </div>

      {/* Filter Control Box */}
      <div className="rounded-3xl bg-[#0e111a] border border-white/10 p-5 sm:p-6 space-y-4 shadow-xl">
        {/* Top Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, Japanese name (e.g. Demon Slayer, Attack on Titan)..."
            className="w-full rounded-2xl bg-black/40 border border-white/10 pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
          />
        </div>

        {/* Dropdown filters row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Format */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Format</label>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
            >
              {formats.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Season */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Season</label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
            >
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Year</label>
            <select
              value={selectedYear || ''}
              onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
            >
              <option value="">ALL YEARS</option>
              {[2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2018, 2015, 2010, 2005, 2000, 1995].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Sort By</label>
            <select
              value={selectedSort}
              onChange={(e) => setSelectedSort(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
            >
              {sorts.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Reset button */}
          <div className="flex items-end">
            <button
              onClick={handleResetFilters}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 py-2 text-slate-300 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Genre buttons row */}
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-semibold mr-1 shrink-0">Genre:</span>
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={`px-3 py-1 rounded-xl shrink-0 font-semibold transition-all ${
                  selectedGenre === g
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {loading && page === 1 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4.2] rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : animeList.length === 0 ? (
        <div className="p-16 rounded-xl bg-[#0e1017] border border-white/5 text-center space-y-3">
          <Search className="w-8 h-8 text-slate-500 mx-auto opacity-40" />
          <h3 className="text-base font-bold text-white">No Anime Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try adjusting your search criteria or resetting filters to explore other titles.
          </p>
          <button
            onClick={handleResetFilters}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {animeList.map((anime, idx) => (
              <AnimeCard
                key={`${anime.id}_${idx}`}
                anime={anime}
                onSelect={onSelectAnime}
                showCountdown={true}
              />
            ))}
          </div>

          {/* Load More Pagination */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  fetchAnime(nextPage);
                }}
                disabled={loading}
                className="flex items-center gap-2 rounded-2xl bg-slate-900 border border-white/10 hover:border-rose-500/40 px-8 py-3 text-xs font-bold text-white shadow-lg transition-all hover:scale-105"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                    <span>Loading more anime...</span>
                  </>
                ) : (
                  <span>Load More Anime</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
