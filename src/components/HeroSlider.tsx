import React, { useState, useEffect } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { CountdownTimer } from './CountdownTimer.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { Bookmark, Star, ChevronLeft, ChevronRight, Clock, Tv, Calendar, ArrowRight } from 'lucide-react';
import { getAnimeImage, handleImageError } from '../services/animeApi.ts';

interface HeroSliderProps {
  animeList: AnimeMedia[];
  onSelectAnime: (animeId: number) => void;
  onWatchAnime?: (animeId: number, episodeNumber?: number) => void;
}

export const HeroSlider: React.FC<HeroSliderProps> = ({
  animeList,
  onSelectAnime,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { watchlist, updateWatchlistStatus, openAuthModal, user } = useAuth();

  const activeAnime = animeList[currentIndex] || animeList[0];

  useEffect(() => {
    if (!animeList || animeList.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % animeList.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [animeList]);

  if (!activeAnime) return null;

  const englishTitle = activeAnime.title.english;
  const romajiTitle = activeAnime.title.romaji;
  const nativeTitle = activeAnime.title.native;
  const mainTitle = englishTitle || romajiTitle;
  const secondaryTitle = englishTitle ? romajiTitle : nativeTitle;

  const score = activeAnime.averageScore ? `${activeAnime.averageScore}%` : null;
  const isAiring = activeAnime.status === 'RELEASING';
  const nextEp = activeAnime.nextAiringEpisode;

  const watchlistItem = watchlist.find((w) => w.anime_id === activeAnime.id);

  const cleanDescription = (activeAnime.description || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[#0e1017] border border-white/5 mb-8">
      {/* Background Hero Banner */}
      <div className="relative h-[380px] sm:h-[440px] w-full overflow-hidden">
        <img
          src={getAnimeImage(activeAnime, 'banner')}
          alt={mainTitle}
          onError={handleImageError}
          className="h-full w-full object-cover object-center filter brightness-[0.38] contrast-110 transition-all duration-700 ease-out"
        />

        {/* Clean Vignette Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090a0f] via-[#090a0f]/75 to-transparent" />

        {/* Content container */}
        <div className="absolute inset-0 flex items-center p-6 sm:p-10">
          <div className="max-w-2xl space-y-3.5">
            {/* Top metadata */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 uppercase tracking-wider text-[10px]">
                {activeAnime.status?.replace('_', ' ') || 'FEATURED'}
              </span>

              {score && (
                <span className="flex items-center gap-1 text-amber-400 text-xs font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  {score}
                </span>
              )}

              <span className="text-slate-400 text-xs">
                {activeAnime.format || 'TV'}
              </span>

              {activeAnime.seasonYear && (
                <span className="text-slate-400 text-xs">
                  · {activeAnime.season ? `${activeAnime.season} ` : ''}{activeAnime.seasonYear}
                </span>
              )}
            </div>

            {/* Anime Title */}
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                {mainTitle}
              </h1>
              {secondaryTitle && (
                <div className="text-xs font-medium text-slate-400 mt-0.5 truncate">
                  {secondaryTitle}
                </div>
              )}
            </div>

            {/* Synopsis */}
            {cleanDescription && (
              <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed max-w-xl">
                {cleanDescription}
              </p>
            )}

            {/* Genres */}
            {activeAnime.genres && activeAnime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-xs text-slate-400">
                {activeAnime.genres.slice(0, 4).map((g) => (
                  <span key={g} className="px-2 py-0.5 rounded bg-white/5 text-[11px] text-slate-300">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Airing countdown info in hero */}
            {isAiring && nextEp && (
              <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs">
                <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="text-slate-400">Episode {nextEp.episode}: </span>
                <CountdownTimer targetTimestamp={nextEp.airingAt} variant="inline" />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => onSelectAnime(activeAnime.id)}
                className="flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 px-5 py-2.5 text-xs font-bold text-white transition-colors"
              >
                <span>View Anime</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  if (!user) openAuthModal();
                  else updateWatchlistStatus(activeAnime.id, watchlistItem ? 'COMPLETED' : 'WATCHING');
                }}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors ${
                  watchlistItem
                    ? 'bg-amber-600/10 border-amber-500/30 text-amber-400'
                    : 'bg-black/40 border-white/10 text-slate-200 hover:text-white hover:bg-black/60'
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${watchlistItem ? 'fill-amber-400' : ''}`} />
                <span>{watchlistItem ? 'In Watchlist' : 'Add to Watchlist'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation arrows */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
          <button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + animeList.length) % animeList.length)}
            aria-label="Previous featured anime"
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 border border-white/10 text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 px-1">
            {animeList.slice(0, 6).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex ? 'w-5 bg-rose-500' : 'w-1.5 bg-white/30 hover:bg-white/60'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % animeList.length)}
            aria-label="Next featured anime"
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 border border-white/10 text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
