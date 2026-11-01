import React, { useState, useEffect } from 'react';
import { AiringScheduleItem } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { CountdownTimer, formatAiringDate } from '../components/CountdownTimer.tsx';
import { Calendar, Clock, Star, ArrowUpDown, Loader2, Play } from 'lucide-react';

interface ScheduleViewProps {
  onSelectAnime: (animeId: number) => void;
  onWatchAnime: (animeId: number, episodeNumber?: number) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ onSelectAnime, onWatchAnime }) => {
  const [schedules, setSchedules] = useState<AiringScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay()); // 0 = Sun, 1 = Mon ...
  const [sortBy, setSortBy] = useState<'earliest' | 'latest' | 'popularity' | 'score'>('earliest');

  const daysOfWeek = [
    { index: 1, name: 'MONDAY' },
    { index: 2, name: 'TUESDAY' },
    { index: 3, name: 'WEDNESDAY' },
    { index: 4, name: 'THURSDAY' },
    { index: 5, name: 'FRIDAY' },
    { index: 6, name: 'SATURDAY' },
    { index: 0, name: 'SUNDAY' },
  ];

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const data = await ClientAnimeService.getAiringSchedule(7);
      setSchedules(data || []);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, []);

  // Filter items matching the selected day of week
  const dayItems = schedules.filter((item) => {
    const date = new Date(item.airingAt * 1000);
    return date.getDay() === selectedDay;
  });

  // Sort day items
  const sortedItems = [...dayItems].sort((a, b) => {
    if (sortBy === 'earliest') return a.airingAt - b.airingAt;
    if (sortBy === 'latest') return b.airingAt - a.airingAt;
    if (sortBy === 'popularity') return (b.media.popularity || 0) - (a.media.popularity || 0);
    if (sortBy === 'score') return (b.media.averageScore || 0) - (a.media.averageScore || 0);
    return 0;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">
            <Calendar className="w-3.5 h-3.5" /> Weekly Broadcast Grid
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Airing Schedule Calendar
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Weekly Japanese television airing timetable converted automatically to your local timezone.
          </p>
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2 text-xs">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-xl bg-slate-900 border border-white/10 px-3 py-1.5 text-white"
          >
            <option value="earliest">Earliest Airing</option>
            <option value="latest">Latest Airing</option>
            <option value="popularity">Most Popular</option>
            <option value="score">Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Weekday Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 p-1.5 rounded-2xl bg-slate-900/80 border border-white/5">
        {daysOfWeek.map((day) => {
          const isActive = selectedDay === day.index;
          // Count items on this day
          const count = schedules.filter((item) => new Date(item.airingAt * 1000).getDay() === day.index).length;

          return (
            <button
              key={day.name}
              onClick={() => setSelectedDay(day.index)}
              className={`flex-1 min-w-[100px] flex flex-col items-center justify-center py-2.5 px-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 font-semibold'
              }`}
            >
              <span className="text-xs uppercase tracking-wider">{day.name}</span>
              <span className={`text-[10px] mt-0.5 ${isActive ? 'text-rose-100' : 'text-slate-500'}`}>
                {count} shows
              </span>
            </button>
          );
        })}
      </div>

      {/* Day Schedule List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-rose-500 mb-2" />
          <span>Synchronizing weekly broadcast schedules...</span>
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="p-16 rounded-3xl bg-slate-900/40 border border-white/5 text-center text-slate-400 text-xs">
          No scheduled television broadcasts on this day for the current week.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedItems.map((item, idx) => {
            const media = item.media;
            const title = media.title.english || media.title.romaji;
            const airTime = new Date(item.airingAt * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const score = media.averageScore ? `${media.averageScore}%` : null;

            return (
              <div
                key={`sched_${item.id}_${item.airingAt || idx}`}
                onClick={() => onSelectAnime(media.id)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0e111a] border border-white/5 hover:border-rose-500/30 cursor-pointer transition-all hover:-translate-y-0.5 shadow-md"
              >
                {/* Left: Time + Poster + Info */}
                <div className="flex items-center gap-4">
                  {/* Airing Time Box */}
                  <div className="flex flex-col items-center justify-center rounded-xl bg-slate-900 border border-white/10 px-3 py-2 min-w-[70px] shrink-0 text-center">
                    <Clock className="w-3.5 h-3.5 text-rose-400 mb-0.5" />
                    <span className="mono-number text-xs font-bold text-white">{airTime}</span>
                  </div>

                  {/* Poster */}
                  <img
                    src={media.coverImage.medium || media.coverImage.large}
                    alt={title}
                    className="w-12 h-16 object-cover rounded-xl shrink-0 group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />

                  {/* Anime Titles and Details */}
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-white group-hover:text-rose-400 transition-colors line-clamp-1">
                      {title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-rose-400">
                        Episode {item.episode}
                      </span>
                      <span>·</span>
                      <span>{media.format || 'TV'}</span>
                      {score && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-amber-400 font-medium">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {score}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Live Countdown & Watch Trigger */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-white/5">
                  <div className="flex flex-col items-start sm:items-end text-xs">
                    <span className="text-[10px] uppercase font-semibold text-slate-500">
                      Broadcasting in:
                    </span>
                    <CountdownTimer targetTimestamp={item.airingAt} variant="compact" onExpire={loadSchedule} />
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onWatchAnime(media.id, item.episode);
                    }}
                    className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 text-rose-400 hover:text-white transition-all shadow-sm"
                    title="Watch Episode"
                  >
                    <Play className="w-4 h-4 fill-current" />
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
