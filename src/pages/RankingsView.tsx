import React, { useState, useEffect } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import {
  Trophy,
  Star,
  Flame,
  Calendar,
  Film,
  TrendingUp,
  Loader2,
  Clock,
  Tv,
} from 'lucide-react';

interface RankingsViewProps {
  initialCategory?: string;
  onSelectAnime: (animeId: number) => void;
  onWatchAnime: (animeId: number, episodeNumber?: number) => void;
}

export const RankingsView: React.FC<RankingsViewProps> = ({
  initialCategory = 'AIRING',
  onSelectAnime,
  onWatchAnime,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [animeList, setAnimeList] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(true);

  const categories = [
    { id: 'AIRING', label: 'Top Airing', icon: Clock },
    { id: 'RATED', label: 'Highest Rated', icon: Star },
    { id: 'POPULAR', label: 'Most Popular', icon: Flame },
    { id: 'UPCOMING', label: 'Top Upcoming', icon: Calendar },
    { id: 'MOVIES', label: 'Top Movies', icon: Film },
  ];

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        setLoading(true);
        const data = await ClientAnimeService.getRankings(activeCategory as any, 1, 25);
        setAnimeList(data.media || []);
      } catch (err) {
        console.error('Failed to load rankings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRankings();
  }, [activeCategory]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
          <Trophy className="w-3.5 h-3.5" /> Official Global Hall of Fame
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Anime Rankings & Charts
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Authentic scores and rankings computed across millions of community ratings.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors shrink-0 ${
                isActive
                  ? 'bg-rose-600 text-white'
                  : 'bg-[#0e111a] text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Rankings List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : animeList.length === 0 ? (
        <div className="p-16 rounded-lg bg-[#0e1017] border border-white/5 text-center text-slate-400 text-xs">
          No rankings found for this category.
        </div>
      ) : (
        <div className="space-y-3">
          {animeList.map((anime, index) => {
            const rank = index + 1;
            const title = anime.title.english || anime.title.romaji;
            const subTitle = anime.title.native || anime.title.romaji;
            const score = anime.averageScore ? `${anime.averageScore}%` : null;

            return (
              <div
                key={`${anime.id}_${index}`}
                onClick={() => onSelectAnime(anime.id)}
                className="group flex items-center justify-between p-3.5 sm:p-4 rounded-lg bg-[#0e111a] border border-white/5 hover:border-white/10 cursor-pointer transition-colors shadow-sm"
              >
                {/* Left: Rank Number + Poster + Titles */}
                <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                  {/* Rank badge */}
                  <div
                    className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-2xl font-black text-sm sm:text-base shrink-0 ${
                      rank === 1
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                        : rank === 2
                        ? 'bg-slate-300 text-black shadow-md'
                        : rank === 3
                        ? 'bg-amber-700 text-white shadow-md'
                        : 'bg-slate-900 text-slate-400 border border-white/5'
                    }`}
                  >
                    #{rank}
                  </div>

                  {/* Poster */}
                  <img
                    src={anime.coverImage.medium || anime.coverImage.large}
                    alt={title}
                    className="w-12 h-16 sm:w-14 sm:h-20 object-cover rounded-xl shrink-0 group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />

                  {/* Info */}
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-rose-400 transition-colors truncate">
                      {title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                      <span className="flex items-center gap-1">
                        <Tv className="w-3 h-3 text-slate-500" />
                        {anime.format || 'TV'}
                      </span>
                      <span>·</span>
                      <span>{anime.seasonYear || 'Ongoing'}</span>
                      {anime.episodes && (
                        <>
                          <span>·</span>
                          <span>{anime.episodes} eps</span>
                        </>
                      )}
                    </div>
                    {anime.genres && (
                      <div className="hidden sm:block text-[11px] text-slate-400 truncate">
                        {anime.genres.slice(0, 3).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Score & Popularity Metrics */}
                <div className="flex items-center gap-4 shrink-0 pl-3">
                  {score && (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1 text-amber-400 font-extrabold text-sm sm:text-base">
                        <Star className="w-4 h-4 fill-amber-400" />
                        <span>{score}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Score
                      </span>
                    </div>
                  )}

                  <div className="hidden md:flex flex-col items-end">
                    <div className="flex items-center gap-1 text-slate-200 font-bold text-sm">
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                      <span>{anime.popularity ? anime.popularity.toLocaleString() : 'N/A'}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      Members
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
