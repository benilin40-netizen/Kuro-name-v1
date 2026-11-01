import React, { useState, useEffect, useMemo } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { AniListAPI } from '../services/anilistApi.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { MiruroAPI } from '../services/miruroApi.ts';
import { CountdownTimer } from '../components/CountdownTimer.tsx';
import { HeroSlider } from '../components/HeroSlider.tsx';
import { AnimeCard } from '../components/AnimeCard.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Clock,
  ArrowRight,
  Play,
  TrendingUp,
  Flame,
  Tv,
  Sparkles,
} from 'lucide-react';

interface HomeViewProps {
  onSelectAnime: (animeId: number) => void;
  onWatchAnime: (animeId: number, episodeNumber?: number) => void;
  onNavigate: (tab: string, param?: any) => void;
}

interface WatchProgressItem {
  id: string;
  anime_id: number | string;
  episode_id: string;
  episode_number: number;
  current_time: number;
  duration: number;
  last_watched: string;
  title?: string;
  title_english?: string;
  cover_image?: string;
  banner_image?: string;
}

function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onSelectAnime,
  onWatchAnime,
  onNavigate,
}) => {
  const { user } = useAuth();

  const [spotlight, setSpotlight] = useState<AnimeMedia[]>([]);
  const [trending, setTrending] = useState<AnimeMedia[]>([]);
  const [popular, setPopular] = useState<AnimeMedia[]>([]);
  const [latest, setLatest] = useState<AnimeMedia[]>([]);
  const [upcoming, setUpcoming] = useState<AnimeMedia[]>([]);
  const [continueWatching, setContinueWatching] = useState<WatchProgressItem[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Load real API data from Miruro API & fallbacks
  const loadHomeData = async () => {
    try {
      setLoading(true);

      const [spotlightRes, trendingRes, popularRes, latestRes, upcomingRes, scheduleData] = await Promise.all([
        MiruroAPI.getSpotlight().catch(() => []),
        MiruroAPI.getTrending(1, 12).catch(() => []),
        MiruroAPI.getPopular(1, 12).catch(() => []),
        MiruroAPI.getRecent(1, 12).catch(() => []),
        MiruroAPI.getUpcoming(1, 12).catch(() => []),
        MiruroAPI.getSchedule().catch(() => []),
      ]);

      if (spotlightRes && spotlightRes.length > 0) setSpotlight(spotlightRes);
      if (trendingRes && trendingRes.length > 0) setTrending(trendingRes);
      if (popularRes && popularRes.length > 0) setPopular(popularRes);
      if (latestRes && latestRes.length > 0) setLatest(latestRes);
      if (upcomingRes && upcomingRes.length > 0) setUpcoming(upcomingRes);

      const nowSecs = Math.floor(Date.now() / 1000);
      const future = (scheduleData || []).filter((item: any) => {
        const t = item.airingAt < 10000000000 ? item.airingAt : Math.floor(item.airingAt / 1000);
        return t > nowSecs;
      });
      future.sort((a, b) => a.airingAt - b.airingAt);
      setSchedules(future);

      // Fetch continue watching progress
      try {
        const progRes = await fetch('/api/watch-progress', {
          headers: user ? { Authorization: `Bearer ${user.id}` } : {},
        });
        if (progRes.ok) {
          const list = await progRes.json();
          if (Array.isArray(list)) {
            setContinueWatching(list);
          }
        }
      } catch (_e) {}
    } catch (err) {
      console.error('Error loading home data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHomeData();

    // 60-second periodic sync of featured/spotlight collections
    const interval = setInterval(() => {
      loadHomeData();
    }, 60 * 1000);

    // Refresh when user returns to tab
    const handleFocus = () => {
      loadHomeData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const genresList = [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance',
    'Horror', 'Mystery', 'Sports', 'Supernatural', 'Sci-Fi', 'Thriller',
    'Slice of Life', 'Music', 'Historical'
  ];

  const heroList = spotlight.length > 0 ? spotlight : (trending.length > 0 ? trending : popular);

  return (
    <div className="space-y-12 animate-in fade-in duration-200">
      {/* 1. HERO SLIDER */}
      {heroList.length > 0 && (
        <HeroSlider
          animeList={heroList}
          onSelectAnime={onSelectAnime}
          onWatchAnime={onWatchAnime}
        />
      )}

      {/* ANIME HEAVEN INSPIRED LIVE COUNTDOWN SECTION */}
      {schedules.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Clock className="w-4 h-4" />
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  AnimeHeaven Schedule & Live Countdown
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                  Live Timestamps
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Next upcoming episode broadcasts ordered by release time in your local time zone.
              </p>
            </div>
            <button
              onClick={() => onNavigate('countdown')}
              className="flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              <span>Full Countdown Board</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {schedules.slice(0, 4).map((item, idx) => {
              const anime = item.media;
              if (!anime) return null;
              const title = anime.title.english || anime.title.romaji || 'Upcoming Anime';
              const poster = anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium;

              return (
                <div
                  key={`sched_${item.id}_${item.airingAt || idx}`}
                  onClick={() => onSelectAnime(anime.id)}
                  className="group relative flex flex-col rounded-2xl bg-[#0e1017] border border-white/5 hover:border-amber-500/40 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 shadow-lg shadow-black/40 p-3.5 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative aspect-[3/4] w-20 shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-white/10">
                      <img
                        src={poster}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono font-bold text-amber-400">
                        Ep {item.episode}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest">
                        Upcoming Release
                      </span>
                      <h3 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-2">
                        {title}
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        {anime.format || 'TV'} {anime.genres?.[0] ? `• ${anime.genres[0]}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-400">Time Until Airing:</span>
                    <CountdownTimer
                      targetTimestamp={item.airingAt}
                      variant="compact"
                      onExpire={() => {
                        loadHomeData();
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. CONTINUE WATCHING (Tracked via Cloudflare Player & Database) */}
      {continueWatching.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Play className="w-4 h-4 text-rose-500 fill-rose-500" />
                Continue Watching
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Resume right where you left off
              </p>
            </div>
            <button
              onClick={() => onNavigate('watchlist')}
              className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {continueWatching.slice(0, 4).map((item, idx) => {
              const numId = parseInt(String(item.anime_id), 10);
              const progressPct =
                item.duration > 0
                  ? Math.min(100, Math.round((item.current_time / item.duration) * 100))
                  : 0;
              const displayTitle = item.title_english || item.title || `Anime #${item.anime_id}`;

              return (
                <div
                  key={`cw_${item.anime_id}_${item.episode_number}_${item.id || idx}`}
                  onClick={() => onWatchAnime(numId, item.episode_number)}
                  className="group relative flex flex-col rounded-2xl bg-[#0e1017] border border-white/5 hover:border-rose-500/30 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 shadow-lg shadow-black/40"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
                    <img
                      src={
                        item.banner_image ||
                        item.cover_image ||
                        'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80'
                      }
                      alt={displayTitle}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-103"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e1017] via-transparent to-transparent" />

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                      <div className="w-10 h-10 rounded-full bg-rose-600 flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                      </div>
                    </div>

                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-white">
                      <span className="font-bold">Ep {item.episode_number}</span>
                      <span className="text-amber-300">
                        Continue at {formatSeconds(item.current_time)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-rose-500 transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 space-y-1">
                    <h3 className="text-xs font-bold text-white group-hover:text-rose-400 transition-colors truncate">
                      {displayTitle}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Episode {item.episode_number}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. TRENDING ANIME (AniList GraphQL) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Flame className="w-5 h-5 text-rose-500" />
              Trending Anime
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Top trending series this week on AniList
            </p>
          </div>
          <button
            onClick={() => onNavigate('anime')}
            className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-[3/4.2] rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {trending.slice(0, 10).map((item, idx) => (
              <AnimeCard
                key={`tr_${item.id}_${idx}`}
                anime={item}
                onSelect={() => onSelectAnime(item.id)}
                onWatch={() => onWatchAnime(item.id, 1)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. ALL-TIME POPULAR ANIME */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-rose-500" />
              All-Time Popular
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Highest community rated and most watched series
            </p>
          </div>
          <button
            onClick={() => onNavigate('rankings')}
            className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
          >
            <span>Rankings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-[3/4.2] rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {popular.slice(0, 10).map((item, idx) => (
              <AnimeCard
                key={`pop_${item.id}_${idx}`}
                anime={item}
                onSelect={() => onSelectAnime(item.id)}
                onWatch={() => onWatchAnime(item.id, 1)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 6. LATEST RELEASES */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Clock className="w-5 h-5 text-rose-500" />
              Latest Releases
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Newly aired and scheduled television broadcasts
            </p>
          </div>
          <button
            onClick={() => onNavigate('airing')}
            className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
          >
            <span>Airing Calendar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {latest.slice(0, 10).map((item, idx) => (
            <AnimeCard
              key={`lat_${item.id}_${idx}`}
              anime={item}
              onSelect={() => onSelectAnime(item.id)}
              onWatch={() => onWatchAnime(item.id, 1)}
            />
          ))}
        </div>
      </section>

      {/* 6.5. UPCOMING ANIME (Miruro API) */}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-rose-500" />
                Upcoming Anime
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Most anticipated upcoming anime series and movies
              </p>
            </div>
            <button
              onClick={() => onNavigate('countdown')}
              className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
            >
              <span>View Countdown</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {upcoming.slice(0, 10).map((item, idx) => (
              <AnimeCard
                key={`upc_${item.id}_${idx}`}
                anime={item}
                onSelect={() => onSelectAnime(item.id)}
                onWatch={() => onWatchAnime(item.id, 1)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 7. GENRES SECTION */}
      <section className="space-y-4 pt-4 border-t border-white/5">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Explore by Genre
        </h2>
        <div className="flex flex-wrap gap-2">
          {genresList.map((genre) => (
            <button
              key={genre}
              onClick={() => onNavigate('genres', genre)}
              className="px-4 py-2 rounded-xl bg-[#0e1017] border border-white/5 hover:border-rose-500/30 hover:bg-white/5 text-xs font-semibold text-slate-300 hover:text-white transition-all"
            >
              {genre}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
