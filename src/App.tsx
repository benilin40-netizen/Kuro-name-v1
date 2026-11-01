/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext.tsx';
import { ParticleCanvas } from './components/ParticleCanvas.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Footer } from './components/Footer.tsx';
import { SearchModal } from './components/SearchModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { VideoPlayerModal } from './components/VideoPlayerModal.tsx';
import { AnimeMedia } from './types/anime.ts';
import { ClientAnimeService } from './api/animeService.ts';

// Pages
import { HomeView } from './pages/HomeView.tsx';
import { AnimeBrowseView } from './pages/AnimeBrowseView.tsx';
import { AiringView } from './pages/AiringView.tsx';
import { ScheduleView } from './pages/ScheduleView.tsx';
import { CountdownView } from './pages/CountdownView.tsx';
import { NewsView } from './pages/NewsView.tsx';
import { GenresView } from './pages/GenresView.tsx';
import { RankingsView } from './pages/RankingsView.tsx';
import { AnimeDetailsView } from './pages/AnimeDetailsView.tsx';
import { UserProfileView } from './pages/UserProfileView.tsx';
import { WatchView } from './pages/WatchView.tsx';
import { AdminView } from './pages/AdminView.tsx';

import { getMedia } from './services/api.ts';
import { Search, Flame, Clock, Newspaper, User, AlertTriangle, RefreshCw } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [tabParam, setTabParam] = useState<any>(null);

  // Selected Anime for Details
  const [selectedAnimeId, setSelectedAnimeId] = useState<number | null>(null);

  // Watch Page Route State
  const [watchAnimeId, setWatchAnimeId] = useState<number | null>(null);
  const [watchEpisodeNumber, setWatchEpisodeNumber] = useState<number>(1);

  // Video Player Modal state
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [playingAnime, setPlayingAnime] = useState<AnimeMedia | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<number>(1);

  // Search Modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Public Catalog State & Functions
  const [catalogMedia, setCatalogMedia] = useState<AnimeMedia[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Ref to prevent overlapping refreshes
  const isRefreshingRef = React.useRef(false);

  const refreshPublicMedia = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsCatalogLoading(true);
    setCatalogError(null);

    try {
      const media = await getMedia();
      setCatalogMedia(media);
      setCatalogError(null);
    } catch (err: any) {
      console.error('refreshPublicMedia catalogue load error:', err);
      setCatalogError(err?.message || 'Failed to load catalogue');
    } finally {
      setIsCatalogLoading(false);
      isRefreshingRef.current = false;
    }
  };

  const initializeApp = async () => {
    await refreshPublicMedia();
  };

  useEffect(() => {
    initializeApp();
  }, []);

  // Synchronize route from browser location URL
  const syncRouteFromLocation = () => {
    const path = window.location.pathname;

    // Handle /watch/:animeId/:episodeNumber or /watch/:animeId or /watch?animeId=...
    if (path.startsWith('/watch')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const aId = parseInt(parts[1], 10);
        const epNum = parts[2] ? parseInt(parts[2], 10) : 1;
        if (!isNaN(aId) && aId > 0) {
          setWatchAnimeId(aId);
          setWatchEpisodeNumber(!isNaN(epNum) && epNum > 0 ? epNum : 1);
          setCurrentTab('watch');
          setSelectedAnimeId(null);
          return;
        }
      }
      const searchParams = new URLSearchParams(window.location.search);
      const qAnimeId = searchParams.get('animeId') || searchParams.get('id');
      const qEp = searchParams.get('ep') || searchParams.get('episode');
      if (qAnimeId) {
        const aId = parseInt(qAnimeId, 10);
        const epNum = qEp ? parseInt(qEp, 10) : 1;
        if (!isNaN(aId) && aId > 0) {
          setWatchAnimeId(aId);
          setWatchEpisodeNumber(!isNaN(epNum) && epNum > 0 ? epNum : 1);
          setCurrentTab('watch');
          setSelectedAnimeId(null);
          return;
        }
      }
    }

    // Handle /anime/:animeId
    if (path.startsWith('/anime/')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const aId = parseInt(parts[1], 10);
        if (!isNaN(aId) && aId > 0) {
          setSelectedAnimeId(aId);
          setWatchAnimeId(null);
          setCurrentTab('home');
          return;
        }
      }
    }

    // General tab paths
    const tabName = path.replace('/', '').toLowerCase();
    if (['home', 'anime', 'airing', 'schedule', 'countdown', 'news', 'genres', 'rankings', 'watchlist', 'profile', 'admin'].includes(tabName)) {
      setCurrentTab(tabName);
      setSelectedAnimeId(null);
      setWatchAnimeId(null);
    }
  };

  useEffect(() => {
    syncRouteFromLocation();
    const handlePopState = () => {
      syncRouteFromLocation();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Global keyboard shortcuts (Cmd+K for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigate = (tab: string, param?: any) => {
    if (tab === 'watch' && param) {
      const aId = typeof param === 'number' ? param : param.animeId;
      const epNum = typeof param === 'object' && param.episodeNumber ? param.episodeNumber : 1;
      if (aId) {
        handleWatchAnime(aId, epNum);
        return;
      }
    }

    setCurrentTab(tab);
    setTabParam(param || null);
    setSelectedAnimeId(null);
    setWatchAnimeId(null);

    const newPath = tab === 'home' ? '/' : `/${tab}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectAnime = (animeId: number) => {
    if (!animeId || isNaN(animeId)) return;
    setSelectedAnimeId(animeId);
    setWatchAnimeId(null);
    const newPath = `/anime/${animeId}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleWatchAnime = async (animeId: number, episodeNumber = 1) => {
    if (!animeId || isNaN(animeId) || animeId <= 0) return;
    const validEp = !episodeNumber || isNaN(episodeNumber) || episodeNumber <= 0 ? 1 : episodeNumber;

    setWatchAnimeId(animeId);
    setWatchEpisodeNumber(validEp);
    setCurrentTab('watch');
    setSelectedAnimeId(null);

    const newPath = `/watch/${animeId}/${validEp}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({ animeId, episodeNumber: validEp }, '', newPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const details = await ClientAnimeService.getAnimeDetails(animeId);
      setPlayingAnime(details);
      setPlayingEpisode(validEp);
    } catch (err) {
      console.error('Failed to prepare stream details:', err);
    }
  };

  return (
    <AuthProvider>
      <div className="relative min-h-screen bg-[#08090d] text-slate-100 flex flex-col selection:bg-rose-500/30 selection:text-rose-200">
        {/* Global Navigation Bar */}
        <Navbar
          currentTab={currentTab}
          onNavigate={handleNavigate}
          onOpenSearch={() => setIsSearchOpen(true)}
        />

        {/* Main Content Area */}
        <main className="relative z-10 flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-12">
          {/* Catalog Error Banner with Retry */}
          {catalogError && catalogMedia.length === 0 && !isCatalogLoading && (
            <div className="mb-8 p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center space-y-4 max-w-lg mx-auto">
              <div className="inline-flex p-3.5 rounded-2xl bg-rose-500/20 text-rose-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white">Catalogue Service Unreachable</h2>
                <p className="text-xs text-rose-300 leading-relaxed">{catalogError}</p>
              </div>
              <button
                onClick={() => refreshPublicMedia()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {/* Non-blocking refresh warning banner if existing data is visible */}
          {catalogError && catalogMedia.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-4">
              <span>Notice: Catalogue refresh failed ({catalogError}). Displaying cached catalogue.</span>
              <button
                onClick={() => refreshPublicMedia()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold transition-colors shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Honest Empty State if no catalogue items exist */}
          {!isCatalogLoading && !catalogError && catalogMedia.length === 0 && currentTab === 'home' && (
            <div className="mb-8 p-8 rounded-2xl bg-white/5 border border-white/10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-300">No catalogue entries found.</p>
              <p className="text-xs text-slate-400">The catalogue is currently empty.</p>
            </div>
          )}
          {/* Active View Routing */}
          {currentTab === 'watch' && watchAnimeId ? (
            <WatchView
              animeId={watchAnimeId}
              initialEpisodeNumber={watchEpisodeNumber}
              onBack={() => {
                setSelectedAnimeId(watchAnimeId);
                setWatchAnimeId(null);
                setCurrentTab('home');
                window.history.pushState({}, '', `/anime/${watchAnimeId}`);
              }}
              onSelectAnime={handleSelectAnime}
              onNavigate={handleNavigate}
            />
          ) : selectedAnimeId ? (
            <AnimeDetailsView
              animeId={selectedAnimeId}
              onBack={() => {
                setSelectedAnimeId(null);
                window.history.pushState({}, '', currentTab === 'home' ? '/' : `/${currentTab}`);
              }}
              onWatchAnime={handleWatchAnime}
              onSelectAnime={handleSelectAnime}
            />
          ) : (
            <>
              {currentTab === 'home' && (
                <HomeView
                  onSelectAnime={handleSelectAnime}
                  onWatchAnime={handleWatchAnime}
                  onNavigate={handleNavigate}
                />
              )}

              {currentTab === 'anime' && (
                <AnimeBrowseView
                  initialFilters={tabParam}
                  onSelectAnime={handleSelectAnime}
                />
              )}

              {currentTab === 'airing' && (
                <AiringView onSelectAnime={handleSelectAnime} />
              )}

              {currentTab === 'schedule' && (
                <ScheduleView
                  onSelectAnime={handleSelectAnime}
                  onWatchAnime={handleWatchAnime}
                />
              )}

              {currentTab === 'countdown' && (
                <CountdownView
                  onSelectAnime={handleSelectAnime}
                  onWatchAnime={handleWatchAnime}
                />
              )}

              {currentTab === 'news' && (
                <NewsView
                  initialArticleId={tabParam}
                  onSelectAnime={handleSelectAnime}
                />
              )}

              {currentTab === 'genres' && (
                <GenresView
                  initialGenre={tabParam}
                  onSelectAnime={handleSelectAnime}
                />
              )}

              {currentTab === 'rankings' && (
                <RankingsView
                  initialCategory={tabParam || 'AIRING'}
                  onSelectAnime={handleSelectAnime}
                  onWatchAnime={handleWatchAnime}
                />
              )}

              {(currentTab === 'watchlist' || currentTab === 'profile') && (
                <UserProfileView
                  userId={tabParam}
                  onSelectAnime={handleSelectAnime}
                  onWatchAnime={handleWatchAnime}
                />
              )}

              {currentTab === 'admin' && <AdminView />}
            </>
          )}
        </main>

        {/* Footer */}
        <Footer onNavigate={handleNavigate} />

        {/* Mobile Bottom Quick Bar */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#08090d]/90 backdrop-blur-xl border-t border-white/5 py-2 px-6 flex items-center justify-around">
          <button
            onClick={() => handleNavigate('home')}
            className={`flex flex-col items-center gap-1 ${
              currentTab === 'home' ? 'text-rose-500' : 'text-slate-400'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Home</span>
          </button>

          <button
            onClick={() => handleNavigate('airing')}
            className={`flex flex-col items-center gap-1 ${
              currentTab === 'airing' ? 'text-rose-500' : 'text-slate-400'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Airing</span>
          </button>

          {/* Floating center search button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center justify-center -mt-5 h-11 w-11 rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-500 transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={() => handleNavigate('news')}
            className={`flex flex-col items-center gap-1 ${
              currentTab === 'news' ? 'text-rose-500' : 'text-slate-400'
            }`}
          >
            <Newspaper className="w-4 h-4" />
            <span className="text-[10px] font-semibold">News</span>
          </button>

          <button
            onClick={() => handleNavigate('profile')}
            className={`flex flex-col items-center gap-1 ${
              currentTab === 'profile' || currentTab === 'watchlist'
                ? 'text-rose-500'
                : 'text-slate-400'
            }`}
          >
            <User className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Profile</span>
          </button>
        </div>

        {/* Global Modals */}
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectAnime={handleSelectAnime}
        />

        <AuthModal />

        <VideoPlayerModal
          anime={playingAnime}
          initialEpisodeNumber={playingEpisode}
          isOpen={isVideoModalOpen}
          onClose={() => {
            setIsVideoModalOpen(false);
            setPlayingAnime(null);
          }}
          onSelectAnime={handleSelectAnime}
        />
      </div>
    </AuthProvider>
  );
}
