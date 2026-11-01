import React, { useState, useEffect } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { CountdownTimer, formatAiringDate } from '../components/CountdownTimer.tsx';
import { Clock, RefreshCw, Star, ArrowUpDown, Tv, ArrowRight } from 'lucide-react';

interface AiringViewProps {
  onSelectAnime: (animeId: number) => void;
}

export const AiringView: React.FC<AiringViewProps> = ({ onSelectAnime }) => {
  const [airingAnime, setAiringAnime] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterGenre, setFilterGenre] = useState('ALL');
  const [sortBy, setSortBy] = useState<'next_airing' | 'latest_ep' | 'popularity' | 'rating'>('next_airing');
  const [refreshing, setRefreshing] = useState(false);

  const loadAiringData = async () => {
    try {
      setLoading(true);
      const data = await ClientAnimeService.getAiring(1, 30);
      setAiringAnime(data.media || []);
    } catch (err) {
      console.error('Error loading airing anime:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAiringData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAiringData();
    setRefreshing(false);
  };

  const filtered = filterGenre === 'ALL'
    ? airingAnime
    : airingAnime.filter((a) => a.genres?.includes(filterGenre));

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'next_airing') {
      const aTime = a.nextAiringEpisode?.airingAt || Infinity;
      const bTime = b.nextAiringEpisode?.airingAt || Infinity;
      return aTime - bTime;
    }
    if (sortBy === 'latest_ep') {
      const aEp = a.nextAiringEpisode?.episode || 0;
      const bEp = b.nextAiringEpisode?.episode || 0;
      return bEp - aEp;
    }
    if (sortBy === 'popularity') {
      return (b.popularity || 0) - (a.popularity || 0);
    }
    if (sortBy === 'rating') {
      return (b.averageScore || 0) - (a.averageScore || 0);
    }
    return 0;
  });

  const genres = ['ALL', 'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi', 'Supernatural'];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-400 uppercase tracking-wider mb-1.5">
            <Clock className="w-3.5 h-3.5" /> Broadcast Ticker
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Currently Airing Anime
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Television and streaming broadcasts airing now with exact live episode countdowns.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-xl bg-[#0e1017] border border-white/10 px-3 py-2 text-white text-xs font-semibold"
            >
              <option value="next_airing">Sort: Next Airing</option>
              <option value="latest_ep">Sort: Latest Episode</option>
              <option value="popularity">Sort: Most Popular</option>
              <option value="rating">Sort: Highest Rating</option>
            </select>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl bg-[#0e1017] border border-white/10 hover:border-rose-500/30 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Genre Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {genres.map((g) => (
          <button
            key={g}
            onClick={() => setFilterGenre(g)}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all shrink-0 ${
              filterGenre === g
                ? 'bg-rose-500 text-white'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Airing List View */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="p-16 rounded-2xl bg-[#0e1017] text-center text-slate-400 text-xs">
          No currently airing anime found.
        </div>
      ) : (
        <div className="space-y-3.5">
          {sorted.map((anime, idx) => {
            const title = anime.title.english || anime.title.romaji;
            const nextEp = anime.nextAiringEpisode;
            const score = anime.averageScore ? `${anime.averageScore}%` : null;

            return (
              <div
                key={`${anime.id}_${idx}`}
                onClick={() => onSelectAnime(anime.id)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0e1017] border border-white/5 hover:border-rose-500/30 cursor-pointer transition-all hover:-translate-y-0.5 shadow-sm"
              >
                {/* Left: Poster + Titles + Synopsis */}
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  <img
                    src={anime.coverImage.medium || anime.coverImage.large}
                    alt={title}
                    className="w-14 h-20 object-cover rounded-xl shrink-0 group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />

                  <div className="space-y-1 min-w-0">
                    <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-rose-400 transition-colors truncate">
                      {title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                      <span className="font-semibold text-rose-400">
                        {nextEp ? `Episode ${nextEp.episode}` : 'Currently Airing'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Tv className="w-3 h-3 text-slate-500" />
                        {anime.format || 'TV'}
                      </span>
                      {score && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-amber-400 font-bold">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {score}
                          </span>
                        </>
                      )}
                    </div>

                    {anime.description && (
                      <p className="text-xs text-slate-400 line-clamp-1 max-w-xl">
                        {anime.description.replace(/<[^>]*>/g, '')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Next Airing + Countdown + Action */}
                <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-0 border-white/5 shrink-0">
                  {nextEp ? (
                    <div className="flex flex-col items-start sm:items-end text-xs">
                      <span className="text-[10px] uppercase font-semibold text-slate-500">
                        {formatAiringDate(nextEp.airingAt)}
                      </span>
                      <CountdownTimer targetTimestamp={nextEp.airingAt} variant="compact" onExpire={loadAiringData} />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Airing info unavailable</span>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectAnime(anime.id);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-rose-500 hover:text-white px-3 py-2 text-xs font-semibold text-slate-300 transition-colors"
                  >
                    <span>Details</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
