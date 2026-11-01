import React, { useState, useEffect } from 'react';
import { UserProfileData, WatchlistItem, AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { AnimeCard } from '../components/AnimeCard.tsx';
import {
  User,
  Bookmark,
  Heart,
  CheckCircle,
  Clock,
  Tv,
  Edit,
  Sparkles,
  Calendar,
  Layers,
  Trash2,
} from 'lucide-react';

interface UserProfileViewProps {
  userId?: string;
  onSelectAnime: (animeId: number) => void;
  onWatchAnime: (animeId: number, episodeNumber?: number) => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  userId,
  onSelectAnime,
  onWatchAnime,
}) => {
  const { user: currentUser, watchlist, favouriteIds, removeFromWatchlist, updateWatchlistStatus, openAuthModal } = useAuth();
  const targetUserId = userId || currentUser?.id;

  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'WATCHING' | 'COMPLETED' | 'PLANNED' | 'ON_HOLD' | 'DROPPED' | 'FAVOURITES'>('ALL');
  const [watchlistDetails, setWatchlistDetails] = useState<Record<number, AnimeMedia>>({});
  const [loading, setLoading] = useState(true);

  // Profile Edit modal states
  const [isEditing, setIsEditing] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');

  useEffect(() => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await ClientAnimeService.getUserProfile(targetUserId);
        setProfileData(data);
        setBioInput(data.profile?.bio || '');
        setAvatarInput(data.user?.avatar || '');

        // Pre-fetch anime details for watchlist items to display rich cards
        const animeIds = watchlist.map((w) => w.anime_id);
        const detailsMap: Record<number, AnimeMedia> = {};

        // Fetch details for up to first 12 items
        for (const id of animeIds.slice(0, 12)) {
          try {
            const media = await ClientAnimeService.getAnimeDetails(id);
            if (media) detailsMap[id] = media;
          } catch (e) {
            console.warn(`Could not load media ${id}:`, e);
          }
        }
        setWatchlistDetails(detailsMap);
      } catch (err) {
        console.error('Failed to load user profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [targetUserId, watchlist.length]);

  if (!currentUser && !userId) {
    return (
      <div className="p-16 rounded-3xl bg-slate-900/40 border border-white/5 text-center space-y-4 max-w-md mx-auto">
        <User className="w-12 h-12 text-slate-500 mx-auto" />
        <h3 className="text-lg font-bold text-white">Sign In to View Watchlist</h3>
        <p className="text-xs text-slate-400">
          Track your anime progress, save favourites, and sync seasonal airing countdowns across all devices.
        </p>
        <button
          onClick={openAuthModal}
          className="rounded-xl bg-rose-500 hover:bg-rose-600 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-rose-500/25"
        >
          Sign In / Register
        </button>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.id}`,
        },
        body: JSON.stringify({
          bio: bioInput,
          avatar: avatarInput,
        }),
      });
      setIsEditing(false);
      const updated = await ClientAnimeService.getUserProfile(currentUser.id);
      setProfileData(updated);
    } catch (err) {
      console.error('Failed to save profile:', err);
    }
  };

  const filteredWatchlist = watchlist.filter((item) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'FAVOURITES') return favouriteIds.has(item.anime_id);
    return item.status === activeTab;
  });

  const stats = profileData?.stats || {
    anime_watched: watchlist.filter((w) => w.status === 'COMPLETED' || w.status === 'WATCHING').length,
    episodes_watched: watchlist.reduce((acc, curr) => acc + (curr.progress_episodes || 0), 0),
    currently_watching: watchlist.filter((w) => w.status === 'WATCHING').length,
    plan_to_watch: watchlist.filter((w) => w.status === 'PLANNED').length,
    completed: watchlist.filter((w) => w.status === 'COMPLETED').length,
    total_anime: watchlist.length,
  };

  return (
    <div className="space-y-10">
      {/* Profile Header Card */}
      <div className="relative rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <img
            src={profileData?.user.avatar || currentUser?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=KURO_NAMI'}
            alt="User Avatar"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover bg-slate-900 border-2 border-rose-500/40 shadow-xl"
          />

          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {profileData?.user.username || currentUser?.username}
                </h1>
                <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-slate-400 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Member since {new Date(profileData?.user.created_at || Date.now()).toLocaleDateString()}</span>
                  {profileData?.user.is_admin ? (
                    <span className="rounded bg-rose-500/20 text-rose-400 font-bold px-1.5 py-0.5 text-[10px] uppercase">
                      Administrator
                    </span>
                  ) : null}
                </div>
              </div>

              {currentUser && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-slate-200 self-center sm:self-auto transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              {profileData?.profile?.bio || 'Passionate anime enthusiast discovering seasonal broadcasts on KURO NAMI.'}
            </p>
          </div>
        </div>

        {/* Profile Edit Modal / Drawer */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="mt-6 pt-6 border-t border-white/10 space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Avatar Image URL</label>
                <input
                  type="url"
                  value={avatarInput}
                  onChange={(e) => setAvatarInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Bio</label>
                <input
                  type="text"
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="Tell others about your anime taste..."
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-rose-500 hover:bg-rose-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/20"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#0e111a] border border-white/5 shadow-md">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase mb-1">
            <CheckCircle className="w-4 h-4" /> Anime Watched
          </div>
          <div className="mono-number text-2xl sm:text-3xl font-extrabold text-white">
            {stats.anime_watched}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0e111a] border border-white/5 shadow-md">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase mb-1">
            <Tv className="w-4 h-4" /> Episodes Watched
          </div>
          <div className="mono-number text-2xl sm:text-3xl font-extrabold text-white">
            {stats.episodes_watched}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0e111a] border border-white/5 shadow-md">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase mb-1">
            <Clock className="w-4 h-4" /> Currently Watching
          </div>
          <div className="mono-number text-2xl sm:text-3xl font-extrabold text-white">
            {stats.currently_watching}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0e111a] border border-white/5 shadow-md">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase mb-1">
            <Bookmark className="w-4 h-4" /> Plan to Watch
          </div>
          <div className="mono-number text-2xl sm:text-3xl font-extrabold text-white">
            {stats.plan_to_watch}
          </div>
        </div>
      </div>

      {/* Watchlist Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              My Watchlist & Library
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage your personal watchlist entries, episode progress, and favorites.
            </p>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'WATCHING', label: 'Watching' },
              { id: 'COMPLETED', label: 'Completed' },
              { id: 'PLANNED', label: 'Plan to Watch' },
              { id: 'ON_HOLD', label: 'On Hold' },
              { id: 'DROPPED', label: 'Dropped' },
              { id: 'FAVOURITES', label: 'Favourites' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Watchlist Items */}
        {filteredWatchlist.length === 0 ? (
          <div className="p-16 rounded-3xl bg-slate-900/40 border border-white/5 text-center text-slate-400 text-xs">
            No anime in this watchlist category.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredWatchlist.map((item) => {
              const media = watchlistDetails[item.anime_id];
              const title = media?.title.english || media?.title.romaji || `Anime #${item.anime_id}`;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-[#0e111a] border border-white/5 hover:border-rose-500/30 transition-all shadow-md group"
                >
                  <div
                    onClick={() => onSelectAnime(item.anime_id)}
                    className="flex items-center gap-4 cursor-pointer min-w-0"
                  >
                    {media ? (
                      <img
                        src={media.coverImage.medium || media.coverImage.large}
                        alt={title}
                        className="w-12 h-16 object-cover rounded-xl shrink-0 group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 font-bold text-xs">
                        #{item.anime_id}
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <h4 className="font-bold text-sm text-white group-hover:text-rose-400 transition-colors truncate">
                        {title}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="rounded bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 text-[10px]">
                          {item.status}
                        </span>
                        <span>·</span>
                        <span>Ep {item.progress_episodes || 0} watched</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onWatchAnime(item.anime_id, (item.progress_episodes || 0) + 1)}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-colors"
                      title="Watch Next Episode"
                    >
                      <Tv className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeFromWatchlist(item.anime_id)}
                      className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors"
                      title="Remove from Watchlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
