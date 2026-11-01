import React from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { CountdownTimer, formatAiringDate } from './CountdownTimer.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { Star, Bookmark, Heart, Play, Clock, Check, Sparkles } from 'lucide-react';
import { getAnimeImage, handleImageError } from '../services/animeApi.ts';

interface AnimeCardProps {
  anime: AnimeMedia;
  onSelect: (animeId: number) => void;
  onWatch?: (animeId: number) => void;
  showCountdown?: boolean;
  priorityAiring?: boolean;
  matchPercentage?: number;
  recommendationReason?: string;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({
  anime,
  onSelect,
  onWatch,
  showCountdown = true,
  priorityAiring = false,
  matchPercentage,
  recommendationReason,
}) => {
  const { watchlist, favouriteIds, toggleFavourite, updateWatchlistStatus, openAuthModal, user } = useAuth();

  const title = anime.title.english || anime.title.romaji;
  const isAiring = anime.status === 'RELEASING';
  const nextEp = anime.nextAiringEpisode;
  const score = anime.averageScore ? `${Math.round(anime.averageScore)}%` : null;

  const isFav = favouriteIds.has(anime.id);
  const watchlistItem = watchlist.find((w) => w.anime_id === anime.id);

  const handleFavClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavourite(anime.id);
  };

  const handleWatchlistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      openAuthModal();
      return;
    }
    if (watchlistItem) {
      // Toggle to completed or cycle
      const nextStatus = watchlistItem.status === 'WATCHING' ? 'COMPLETED' : 'WATCHING';
      updateWatchlistStatus(anime.id, nextStatus);
    } else {
      updateWatchlistStatus(anime.id, 'PLANNED');
    }
  };

  return (
    <div
      onClick={() => onSelect(anime.id)}
      className="group relative flex flex-col rounded-xl bg-[#0e1017]/40 border border-white/5 hover:border-white/15 overflow-hidden cursor-pointer transition-colors"
    >
      {/* Poster image container */}
      <div className="relative aspect-[3/4.2] w-full overflow-hidden bg-slate-900">
        <img
          src={getAnimeImage(anime)}
          alt={title}
          loading="lazy"
          onError={handleImageError}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f121a] via-transparent to-black/30 opacity-80" />

        {/* Top actions: Favorite & Watchlist buttons */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={handleFavClick}
            aria-label="Toggle favourite"
            className={`p-2 rounded-xl backdrop-blur-md transition-all ${
              isFav
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                : 'bg-black/50 text-slate-300 hover:text-white hover:bg-black/70'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
          </button>
          <button
            onClick={handleWatchlistClick}
            aria-label="Toggle watchlist"
            className={`p-2 rounded-xl backdrop-blur-md transition-all ${
              watchlistItem
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                : 'bg-black/50 text-slate-300 hover:text-white hover:bg-black/70'
            }`}
            title={watchlistItem ? `Status: ${watchlistItem.status}` : 'Add to Watchlist'}
          >
            {watchlistItem ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Top Left: Score, Match %, or Airing indicator */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
          {matchPercentage ? (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/90 text-black text-[11px] font-black tracking-wider shadow-md backdrop-blur-md">
              <Sparkles className="w-3 h-3" />
              <span>{matchPercentage}% Match</span>
            </div>
          ) : score ? (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-amber-400 text-xs font-semibold border border-white/10">
              <Star className="w-3 h-3 fill-amber-400" />
              <span>{score}</span>
            </div>
          ) : null}
        </div>

        {/* Bottom overlay: Airing countdown badge if releasing */}
        {showCountdown && isAiring && nextEp && (
          <div className="absolute bottom-2.5 inset-x-2.5 p-2 rounded-xl bg-black/75 backdrop-blur-md border border-rose-500/20 text-xs text-white">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
              <span className="font-medium text-slate-300">Ep {nextEp.episode}</span>
              <span className="text-[10px] text-slate-400">{formatAiringDate(nextEp.airingAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-rose-400 font-semibold tracking-wider flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Next:
              </span>
              <CountdownTimer targetTimestamp={nextEp.airingAt} variant="compact" />
            </div>
          </div>
        )}

        {/* Quick Play Hover Indicator */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md">
            <Play className="w-4 h-4 fill-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* Anime Info */}
      <div className="flex-1 p-3.5 flex flex-col justify-between">
        <div>
          <h3 className="font-semibold text-sm text-slate-100 line-clamp-1 group-hover:text-rose-400 transition-colors">
            {title}
          </h3>

          {/* Clean unboxed metadata with separators */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <span>{anime.format || 'TV'}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{anime.seasonYear || 'Ongoing'}</span>
            {anime.episodes && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>{anime.episodes} eps</span>
              </>
            )}
          </div>
        </div>

        {/* Recommendation Reason or Genres inline text */}
        {recommendationReason ? (
          <div className="text-[11px] text-rose-400 font-medium line-clamp-1 mt-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">{recommendationReason}</span>
          </div>
        ) : anime.genres && anime.genres.length > 0 ? (
          <div className="text-[11px] text-slate-400 truncate mt-2">
            {anime.genres.slice(0, 3).join(' · ')}
          </div>
        ) : null}
      </div>
    </div>
  );
};
