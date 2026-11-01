import React, { useState, useEffect, useRef } from 'react';
import { AiringScheduleItem } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { CountdownTimer, formatAiringDate } from '../components/CountdownTimer.tsx';
import { Clock, RefreshCw, Calendar, ChevronLeft, ChevronRight, Play, Sparkles, Tv } from 'lucide-react';

interface CountdownViewProps {
  onSelectAnime: (animeId: number) => void;
  onWatchAnime?: (animeId: number, episodeNumber?: number) => void;
  onOpenSchedule?: () => void;
}

export const CountdownView: React.FC<CountdownViewProps> = ({
  onSelectAnime,
  onOpenSchedule,
}) => {
  const [schedules, setSchedules] = useState<AiringScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  const loadCountdownData = async () => {
    try {
      setLoading(true);
      const data = await ClientAnimeService.getAiringSchedule(7);
      const nowSecs = Math.floor(Date.now() / 1000);
      
      // Strict chronological filtering and sorting: ONLY future episodes (airingAt > nowSecs)
      const futureOnly = (data || []).filter((item) => {
        const itemSecs = item.airingAt < 10000000000 ? item.airingAt : Math.floor(item.airingAt / 1000);
        return itemSecs > nowSecs;
      });

      futureOnly.sort((a, b) => a.airingAt - b.airingAt);
      setSchedules(futureOnly);
    } catch (err) {
      console.error('[KURO NAMI] Failed to load upcoming countdowns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCountdownData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCountdownData();
    setRefreshing(false);
  };

  const scrollRail = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const amount = direction === 'left' ? -360 : 360;
    railRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  // Featured anime is automatically the closest upcoming broadcast
  const featuredItem = schedules.length > 0 ? schedules[0] : null;
  const upcomingList = schedules.slice(1);

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* 1. MAIN SECTION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            NEXT EPISODES
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">
            Stay up to date with the next episodes of your favorite anime. All broadcast timestamps automatically convert to your local timezone.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg bg-[#0e1017] border border-white/5 hover:bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-rose-500 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Airing Times'}</span>
        </button>
      </div>

      {/* 2. FEATURED COUNTDOWN CARD */}
      {loading ? (
        <div className="h-80 rounded-xl bg-white/5 animate-pulse border border-white/5" />
      ) : featuredItem ? (
        <div className="relative rounded-xl bg-[#0e1017] border border-white/5 p-6 sm:p-8 lg:p-10 overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
            {/* Anime Poster Artwork */}
            <div
              onClick={() => onSelectAnime(featuredItem.media.id)}
              className="relative aspect-[3/4.2] w-36 sm:w-48 lg:w-52 shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-lg bg-slate-900 cursor-pointer group/poster"
            >
              <img
                src={featuredItem.media.coverImage.extraLarge || featuredItem.media.coverImage.large}
                alt={featuredItem.media.title.english || featuredItem.media.title.romaji}
                className="w-full h-full object-cover group-hover/poster:scale-105 transition-transform duration-500"
              />
            </div>

            {/* Featured Information & Countdown Timer */}
            <div className="flex-1 space-y-4 text-center md:text-left min-w-0">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs text-slate-400">
                <span className="font-bold text-rose-500 uppercase tracking-wider">
                  Episode {featuredItem.episode}
                </span>
                <span>·</span>
                <span className="font-medium">
                  Airs {formatAiringDate(featuredItem.airingAt)} (Local Time)
                </span>
              </div>

              <div>
                <h2
                  onClick={() => onSelectAnime(featuredItem.media.id)}
                  className="text-xl sm:text-3xl font-black text-white tracking-tight leading-tight hover:text-rose-400 cursor-pointer transition-colors line-clamp-2"
                >
                  {featuredItem.media.title.english || featuredItem.media.title.romaji}
                </h2>
                {featuredItem.media.title.native && (
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {featuredItem.media.title.native}
                  </p>
                )}
              </div>

              {/* 4-Box Featured Countdown Timer */}
              <div className="pt-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  COUNTDOWN
                </div>
                <CountdownTimer
                  targetTimestamp={featuredItem.airingAt}
                  variant="featured"
                  onExpire={loadCountdownData}
                />
              </div>

              {/* Featured Actions */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                <button
                  onClick={() => onSelectAnime(featuredItem.media.id)}
                  className="flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 px-5 py-2 text-xs font-bold text-white transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>View Anime</span>
                </button>

                {onOpenSchedule && (
                  <button
                    onClick={onOpenSchedule}
                    className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                  >
                    <span>Full Schedule</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 rounded-xl bg-[#0e1017] border border-white/5 text-center text-slate-400 text-xs">
          No episodes available yet.
        </div>
      )}

      {/* 3. UPCOMING EPISODES RAIL / CARDS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight uppercase">
              Upcoming Episodes
            </h2>
          </div>

          {/* Desktop Rail Navigation Arrows */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => scrollRail('left')}
              className="p-1.5 rounded-lg bg-[#0e1017] border border-white/5 text-slate-400 hover:text-white transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => scrollRail('right')}
              className="p-1.5 rounded-lg bg-[#0e1017] border border-white/5 text-slate-400 hover:text-white transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-80 h-36 rounded-xl bg-white/5 animate-pulse shrink-0" />
            ))}
          </div>
        ) : upcomingList.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#0e1017] border border-white/5 text-center text-slate-400 text-xs">
            Nothing here yet.
          </div>
        ) : (
          <div
            ref={railRef}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-none scroll-smooth"
          >
            {upcomingList.map((item, idx) => {
              const media = item.media;
              const title = media.title.english || media.title.romaji;
              const airDateStr = formatAiringDate(item.airingAt);

              return (
                <div
                  key={`${item.id}_${item.airingAt}_${idx}`}
                  onClick={() => onSelectAnime(media.id)}
                  className="group flex gap-3.5 p-3.5 rounded-xl bg-[#0e1017] border border-white/5 hover:border-white/15 cursor-pointer transition-colors shrink-0 w-80"
                >
                  {/* Poster Left */}
                  <div className="relative aspect-[3/4.2] w-16 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-slate-900">
                    <img
                      src={media.coverImage.large || media.coverImage.medium}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>

                  {/* Info Right */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 space-y-1">
                    <div>
                      <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-0.5">
                        Episode {item.episode}
                      </div>
                      <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-rose-400 transition-colors line-clamp-1">
                        {title}
                      </h3>
                      <div className="text-[11px] text-slate-400 truncate">
                        {airDateStr}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5">
                      <CountdownTimer
                        targetTimestamp={item.airingAt}
                        variant="blocks"
                        onExpire={loadCountdownData}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
