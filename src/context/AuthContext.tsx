import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserProfile, WatchlistItem } from '../types/anime.ts';
import { ClientAnimeService, setStoredToken, getStoredToken } from '../api/animeService.ts';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  watchlist: WatchlistItem[];
  favouriteIds: Set<number>;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUserData: () => Promise<void>;
  toggleFavourite: (animeId: number) => Promise<boolean>;
  updateWatchlistStatus: (animeId: number, status: string, progress?: number, score?: number) => Promise<void>;
  removeFromWatchlist: (animeId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const refreshUserData = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setProfile(null);
      setWatchlist([]);
      setFavouriteIds(new Set());
      setIsLoading(false);
      return;
    }

    try {
      const meData = await ClientAnimeService.getMe();
      if (meData?.user) {
        setUser(meData.user);
        setProfile(meData.profile);

        // Fetch watchlist and favourites in parallel
        const [wl, favs] = await Promise.all([
          ClientAnimeService.getWatchlist(),
          ClientAnimeService.getFavourites(),
        ]);
        setWatchlist(wl);
        setFavouriteIds(new Set(favs));
      } else {
        setUser(null);
        setProfile(null);
      }
    } catch (err) {
      console.error('Failed to restore user session:', err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUserData();
  }, []);

  const login = async (username: string, password: string) => {
    const data = await ClientAnimeService.login(username, password);
    setUser(data.user);
    await refreshUserData();
    setIsAuthModalOpen(false);
  };

  const register = async (username: string, email: string, password: string) => {
    const data = await ClientAnimeService.register(username, email, password);
    setUser(data.user);
    await refreshUserData();
    setIsAuthModalOpen(false);
  };

  const logout = () => {
    ClientAnimeService.logout();
    setUser(null);
    setProfile(null);
    setWatchlist([]);
    setFavouriteIds(new Set());
  };

  const toggleFavourite = async (animeId: number): Promise<boolean> => {
    if (!user) {
      setIsAuthModalOpen(true);
      return false;
    }

    try {
      const isFav = await ClientAnimeService.toggleFavourite(animeId);
      setFavouriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) {
          next.add(animeId);
        } else {
          next.delete(animeId);
        }
        return next;
      });
      return isFav;
    } catch (err) {
      console.error('Failed to toggle favourite:', err);
      return false;
    }
  };

  const updateWatchlistStatus = async (animeId: number, status: string, progress = 0, score = 0) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    try {
      const item = await ClientAnimeService.updateWatchlist({
        anime_id: animeId,
        status,
        progress_episodes: progress,
        score,
      });

      setWatchlist((prev) => {
        const existingIdx = prev.findIndex((w) => w.anime_id === animeId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = item;
          return updated;
        }
        return [item, ...prev];
      });
    } catch (err) {
      console.error('Failed to update watchlist:', err);
    }
  };

  const removeFromWatchlist = async (animeId: number) => {
    if (!user) return;
    try {
      await ClientAnimeService.removeFromWatchlist(animeId);
      setWatchlist((prev) => prev.filter((w) => w.anime_id !== animeId));
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAdmin: !!user?.is_admin,
        watchlist,
        favouriteIds,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        login,
        register,
        logout,
        refreshUserData,
        toggleFavourite,
        updateWatchlistStatus,
        removeFromWatchlist,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
