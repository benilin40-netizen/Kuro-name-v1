import React, { useState, useEffect } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { CountdownTimer, formatAiringDate } from '../components/CountdownTimer.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { findTMDBByTitle, TMDBMediaDetails, TMDBCastMember } from '../services/tmdbService.ts';
import {
  Star,
  Bookmark,
  Heart,
  Play,
  Clock,
  Tv,
  Calendar,
  Layers,
  Users,
  Film,
  Sparkles,
  ChevronLeft,
  Share2,
  ExternalLink,
  Check,
  Building,
  Clapperboard,
} from 'lucide-react';

interface AnimeDetailsViewProps {
  animeId: number;
  onBack: () => void;
  onWatchAnime: (animeId: number, episodeNumber?: number) => void;
  onSelectAnime: (animeId: number) => void;
}

export const AnimeDetailsView: React.FC<AnimeDetailsViewProps> = ({
  animeId,
  onBack,
  onWatchAnime,
  onSelectAnime,
}) => {
  const { user, watchlist, favouriteIds, toggleFavourite, updateWatchlistStatus, openAuthModal } = useAuth();
  const [anime, setAnime] = useState<AnimeMedia | null>(null);
  const [tmdbData, setTmdbData] = useState<TMDBMediaDetails | null>(null);
  const [availableSources, setAvailableSources] = useState<number[]>([]);
  const [airedEpisodes, setAiredEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'episodes' | 'cast' | 'characters' | 'staff' | 'relations'>('overview');

  useEffect(() => {
    let cancelled = false;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const [data, qwishEps] = await Promise.all([
          ClientAnimeService.getAnimeDetails(animeId),
          fetch(`/api/anime/${animeId}/episodes`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ]);
        if (cancelled) return;
        setAnime(data);

        const validEpisodeNumbers = Array.isArray(qwishEps)
          ? qwishEps
              .filter((e: any) => Boolean(e.cloudflare_video_id))
              .map((e: any) => e.episode_number)
          : [];
        setAvailableSources(validEpisodeNumbers);
        setAiredEpisodes(Array.isArray(qwishEps) ? qwishEps : []);

        // Fetch TMDB metadata using title
        if (data) {
          const mainTitle = data.title?.english || data.title?.romaji || (data.title as any)?.userPreferred || '';
          const year = data.seasonYear || data.startDate?.year;
          const isMovie = data.format === 'MOVIE';

          findTMDBByTitle(mainTitle, year, isMovie ? 'movie' : 'tv')
            .then((tmdbRes) => {
              if (!cancelled && tmdbRes) {
                setTmdbData(tmdbRes);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load anime details:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDetails();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    return () => {
      cancelled = true;
    };
  }, [animeId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-medium">Loading anime & TMDB metadata...</span>
      </div>
    );
  }

  if (!anime) {
    return (
      <div className="p-16 rounded-xl bg-[#0e1017] border border-white/5 text-center space-y-3">
        <h3 className="text-base font-bold text-white">Anime Not Found</h3>
        <p className="text-xs text-slate-400">Unable to retrieve media record from catalog index.</p>
        <button
          onClick={onBack}
          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
        >
          Return to Browse
        </button>
      </div>
    );
  }

  const isFav = favouriteIds.has(anime.id);
  const watchlistItem = watchlist.find((w) => w.anime_id === anime.id);

  const englishTitle = anime.title.english;
  const romajiTitle = anime.title.romaji;
  const nativeTitle = anime.title.native;
  const mainTitle = englishTitle || romajiTitle;
  const secondaryTitle = englishTitle ? romajiTitle : nativeTitle;

  const score = anime.averageScore ? `${anime.averageScore}%` : null;
  const tmdbScore = tmdbData?.vote_average ? `${tmdbData.vote_average}/10` : null;
  const isAiring = anime.status === 'RELEASING';
  const nextEp = anime.nextAiringEpisode;

  const airedEpNumbers = airedEpisodes.map((e) => e.episode_number).filter(Boolean);
  const episodesList = airedEpNumbers.length > 0
    ? Array.from(new Set(airedEpNumbers)).sort((a, b) => a - b)
    : Array.from({ length: anime.episodes || 12 }, (_, i) => i + 1);

  const cleanDescription = (tmdbData?.overview || anime.description || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();

  const studioName = anime.studios?.nodes?.[0]?.name || 'Unknown Studio';

  const posterImg = tmdbData?.poster_url || anime.coverImage.extraLarge || anime.coverImage.large;
  const backdropImg = tmdbData?.backdrop_url || anime.bannerImage || anime.coverImage.extraLarge;

  const handleStatusChange = (status: string) => {
    if (!user) {
      openAuthModal();
      return;
    }
    updateWatchlistStatus(anime.id, status);
  };

  return (
    <div className="space-y-10">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-all"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Hero Banner Section */}
      <div className="relative rounded-xl overflow-hidden bg-[#090b12] border border-white/5 shadow-md">
        {/* Banner image with cinematic gradient */}
        <div className="relative h-64 sm:h-80 lg:h-96 w-full overflow-hidden">
          <img
            src={backdropImg}
            alt={mainTitle}
            className="w-full h-full object-cover filter brightness-50 contrast-125 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090b12] via-[#090b12]/60 to-transparent" />
        </div>

        {/* Content overlaid on hero bottom */}
        <div className="relative px-6 pb-8 sm:px-10 -mt-28 sm:-mt-36 flex flex-col md:flex-row gap-6 sm:gap-8 items-start">
          {/* Poster Box */}
          <div className="relative aspect-[3/4.2] w-40 sm:w-56 shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-md bg-slate-900 group">
            <img
              src={posterImg}
              alt={mainTitle}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Quick Watch Floating Play Button */}
            <button
              onClick={() => onWatchAnime(anime.id, 1)}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-500/40">
                <Play className="w-5 h-5 fill-white ml-0.5" />
              </div>
            </button>
          </div>

          {/* Details & Actions */}
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 text-[10px] uppercase font-bold">
                {anime.status?.replace('_', ' ')}
              </span>

              {/* TMDB Rating */}
              {tmdbScore && (
                <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold">
                  <Star className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                  <span>TMDB {tmdbScore} ({tmdbData?.vote_count} votes)</span>
                </span>
              )}

              {score && (
                <span className="flex items-center gap-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {score}
                </span>
              )}

              <span className="flex items-center gap-1 text-slate-300 text-xs">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                {studioName}
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                {mainTitle}
              </h1>
              {secondaryTitle && (
                <div className="text-xs sm:text-sm font-medium text-slate-400 mt-1">
                  {secondaryTitle} {nativeTitle && nativeTitle !== secondaryTitle ? `· ${nativeTitle}` : ''}
                </div>
              )}
            </div>

            {/* Quick action buttons & Watchlist Selector */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onWatchAnime(anime.id, 1)}
                className="flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white transition-colors shadow-lg shadow-rose-950/40"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Watch Stream</span>
              </button>

              <button
                onClick={() => toggleFavourite(anime.id)}
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
                  isFav
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-black/40 border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-400 text-rose-400' : ''}`} />
                <span>{isFav ? 'Favorited' : 'Favorite'}</span>
              </button>

              {/* Watchlist status selector dropdown */}
              <div className="relative">
                <select
                  value={watchlistItem?.status || ''}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="rounded-lg bg-slate-900 border border-white/15 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="" disabled>
                    + Add to Watchlist
                  </option>
                  <option value="WATCHING">Watching</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PLANNED">Plan to Watch</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="DROPPED">Dropped</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Currently Airing Live Countdown Banner (if releasing) */}
      {isAiring && nextEp && (
        <div className="rounded-xl bg-[#0e1017] border border-white/5 p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 uppercase tracking-wider">
              <Clock className="w-4 h-4" /> Next Episode Broadcast
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-white">
              Episode {nextEp.episode}
            </div>
            <div className="text-xs text-slate-400">
              Broadcasting on {formatAiringDate(nextEp.airingAt)} (converted to your timezone)
            </div>
          </div>

          <div className="flex flex-col items-center">
            <CountdownTimer targetTimestamp={nextEp.airingAt} variant="blocks" />
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto text-xs font-semibold">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'episodes', label: `Episodes (${episodesList.length})` },
          { id: 'cast', label: `TMDB Cast (${tmdbData?.cast?.length || 0})` },
          { id: 'characters', label: `AniList Characters (${anime.characters?.edges?.length || 0})` },
          { id: 'staff', label: `Staff & Studios (${anime.staff?.edges?.length || 0})` },
          { id: 'relations', label: 'Relations & Recommendations' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl transition-all shrink-0 ${
              activeTab === tab.id
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Synopsis & Details */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
                Synopsis & About
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {cleanDescription || 'No description available.'}
              </p>
            </div>

            {/* Genres */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
                Genres
              </h3>
              <div className="flex flex-wrap gap-2">
                {(tmdbData?.genres?.map((g) => g.name) || anime.genres).map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1.5 rounded-xl bg-[#0e111a] border border-white/5 text-xs font-semibold text-slate-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar: TMDB & Production Facts */}
          <div className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 space-y-4 h-fit text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider pb-2 border-b border-white/5 flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-rose-500" />
              <span>Database Information</span>
            </h3>

            {tmdbData && (
              <>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">TMDB ID</span>
                  <span className="font-mono font-bold text-emerald-400">#{tmdbData.tmdb_id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">TMDB Rating</span>
                  <span className="font-bold text-amber-300">⭐ {tmdbData.vote_average}/10 ({tmdbData.vote_count})</span>
                </div>
              </>
            )}

            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Format</span>
              <span className="font-semibold text-white">{anime.format || 'TV'}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Status</span>
              <span className="font-semibold text-white capitalize">{anime.status?.toLowerCase().replace('_', ' ')}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Episodes</span>
              <span className="font-semibold text-white">{anime.episodes || tmdbData?.number_of_episodes || 'Ongoing'}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Main Studio</span>
              <span className="font-semibold text-rose-400">{studioName}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB: EPISODES */}
      {activeTab === 'episodes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-2">
            <span>Select an episode to launch the stream player.</span>
            <span>Total {episodesList.length} episodes</span>
          </div>

          <div className="border border-white/5 rounded-lg bg-[#0e1017] divide-y divide-white/5 overflow-hidden">
            {episodesList.map((epNum) => {
              return (
                <div
                  key={epNum}
                  className="flex items-center justify-between px-4 py-3.5 text-xs hover:bg-white/[0.01] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-500 w-6">{epNum}</span>
                    <span className="font-semibold text-white">Episode {epNum}</span>
                  </div>

                  <div className="flex items-center gap-5">
                    <span className="text-[10px] text-slate-400 font-bold tracking-widest">
                      SUB DUB
                    </span>
                    <button
                      onClick={() => onWatchAnime(anime.id, epNum)}
                      className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 font-bold text-white transition-colors"
                    >
                      Watch now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: TMDB CAST */}
      {activeTab === 'cast' && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Cast & Voice Actors from The Movie Database (TMDB)
          </h3>
          {tmdbData?.cast && tmdbData.cast.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tmdbData.cast.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 p-3 rounded-2xl bg-[#0e111a] border border-white/5 shadow-md"
                >
                  {member.profile_url ? (
                    <img
                      src={member.profile_url}
                      alt={member.name}
                      className="w-14 h-14 rounded-2xl object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                      No Pic
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <div className="text-xs font-extrabold text-white line-clamp-1">{member.name}</div>
                    <div className="text-[11px] text-rose-400 font-medium line-clamp-1">as {member.character}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 bg-[#0e1017] rounded-xl border border-white/5">
              No cast data indexed for this entry on TMDB yet.
            </div>
          )}
        </div>
      )}

      {/* TAB: ANILIST CHARACTERS */}
      {activeTab === 'characters' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {anime.characters?.edges?.map((edge, i) => {
            const char = edge.node;
            const va = edge.voiceActors?.[0];
            return (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#0e111a] border border-white/5 shadow-md"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={char.image?.medium || char.image?.large}
                    alt={char.name.full}
                    className="w-12 h-12 rounded-xl object-cover"
                    loading="lazy"
                  />
                  <div>
                    <div className="text-xs font-bold text-white line-clamp-1">{char.name.full}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{edge.role.toLowerCase()}</div>
                  </div>
                </div>

                {va && (
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className="text-xs font-semibold text-slate-300 line-clamp-1">{va.name.full}</div>
                      <div className="text-[10px] text-rose-400">Japanese VA</div>
                    </div>
                    <img
                      src={va.image?.medium}
                      alt={va.name.full}
                      className="w-12 h-12 rounded-xl object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB: STAFF */}
      {activeTab === 'staff' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {anime.staff?.edges?.map((edge, i) => {
            const member = edge.node;
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-2xl bg-[#0e111a] border border-white/5 shadow-md"
              >
                <img
                  src={member.image?.medium}
                  alt={member.name.full}
                  className="w-12 h-12 rounded-xl object-cover"
                  loading="lazy"
                />
                <div>
                  <div className="text-xs font-bold text-white line-clamp-1">{member.name.full}</div>
                  <div className="text-[10px] text-slate-400 line-clamp-1">{edge.role}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB: RELATIONS & RECOMMENDATIONS */}
      {activeTab === 'relations' && (
        <div className="space-y-8">
          {anime.relations?.edges && anime.relations.edges.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                Franchise Relations
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {anime.relations.edges.map((rel, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectAnime(rel.node.id)}
                    className="p-2.5 rounded-2xl bg-[#0e111a] border border-white/5 hover:border-rose-500/30 cursor-pointer transition-all hover:-translate-y-1 group"
                  >
                    <img
                      src={rel.node.coverImage.medium || rel.node.coverImage.large}
                      alt={rel.node.title.romaji}
                      className="aspect-[3/4.2] w-full object-cover rounded-xl mb-2"
                      loading="lazy"
                    />
                    <div className="text-[10px] font-bold uppercase text-rose-400">{rel.relationType}</div>
                    <div className="text-xs font-semibold text-white group-hover:text-rose-400 truncate">
                      {rel.node.title.english || rel.node.title.romaji}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
