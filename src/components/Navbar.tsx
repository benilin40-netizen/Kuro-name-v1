import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { APP_NAME } from '../constants/brand.ts';
import {
  Flame,
  Search,
  Bookmark,
  Calendar,
  Clock,
  Newspaper,
  Compass,
  Trophy,
  Shield,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  Tv,
  Waves,
  Camera,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onNavigate: (tab: string, param?: any) => void;
  onOpenSearch: () => void;
  onOpenTraceMoe?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onNavigate, onOpenSearch, onOpenTraceMoe }) => {
  const { user, isAdmin, watchlist, logout, openAuthModal } = useAuth();
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'home', label: 'Home', icon: Flame },
    { id: 'anime', label: 'Anime', icon: Tv },
    { id: 'airing', label: 'Airing', icon: Clock },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'countdown', label: 'Countdown', icon: Clock },
    { id: 'news', label: 'News', icon: Newspaper },
    { id: 'genres', label: 'Genres', icon: Compass },
    { id: 'rankings', label: 'Rankings', icon: Trophy },
  ];

  const watchlistCount = watchlist.length;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#08090d]/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-400 flex items-center justify-center shadow-lg shadow-rose-950/50">
              <span className="text-white font-black text-sm tracking-wider">KN</span>
            </div>
            <span className="text-xl font-black tracking-tight text-white group-hover:text-rose-400 transition-colors">
              KURO <span className="text-rose-500">NAMI</span>
            </span>
          </button>

          {/* Desktop Navigation links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'text-white bg-white/10 font-bold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-rose-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2.5">
          {/* Scene Finder Button (Trace.moe) */}
          {onOpenTraceMoe && (
            <button
              onClick={onOpenTraceMoe}
              className="flex items-center gap-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 px-2.5 py-1.5 text-xs font-bold text-rose-300 transition-all shadow-sm"
              title="Trace.moe AI Screenshot Scene Finder"
            >
              <Camera className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Scene Finder</span>
            </button>
          )}

          {/* Search Trigger Button */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-xl bg-slate-900/90 border border-white/10 hover:border-rose-500/30 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-all shadow-sm group"
          >
            <Search className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Search anime...</span>
            <kbd className="hidden sm:inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Watchlist Quick Button */}
          <button
            onClick={() => {
              if (!user) openAuthModal();
              else onNavigate('watchlist');
            }}
            className={`relative flex items-center gap-1.5 rounded-xl border p-2 text-xs font-medium transition-all ${
              currentTab === 'watchlist'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-slate-900/80 border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title="My Watchlist"
          >
            <Bookmark className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Watchlist</span>
            {watchlistCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white leading-tight">
                {watchlistCount}
              </span>
            )}
          </button>

          {/* User Profile / Auth */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-white/10 p-1.5 hover:border-white/20 transition-all"
              >
                <img
                  src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`}
                  alt={user.username}
                  className="h-7 w-7 rounded-lg object-cover bg-slate-800"
                />
                <span className="hidden md:inline text-xs font-semibold text-slate-200 max-w-[100px] truncate">
                  {user.username}
                </span>
              </button>

              {/* User Dropdown Menu */}
              {isUserDropdownOpen && (
                <div
                  onMouseLeave={() => setIsUserDropdownOpen(false)}
                  className="absolute right-0 mt-2 w-52 rounded-2xl bg-[#0e111a] border border-white/10 p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="px-3 py-2 border-b border-white/5 mb-1">
                    <div className="text-xs font-bold text-white truncate">{user.username}</div>
                    <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                  </div>

                  <button
                    onClick={() => {
                      setIsUserDropdownOpen(false);
                      onNavigate('profile', user.id);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    <span>My Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsUserDropdownOpen(false);
                      onNavigate('watchlist');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <Bookmark className="w-4 h-4 text-amber-400" />
                    <span>Watchlist ({watchlistCount})</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsUserDropdownOpen(false);
                      onNavigate('admin');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Shield className="w-4 h-4 text-rose-400" />
                    <span>Admin Dashboard</span>
                  </button>

                  <div className="my-1 border-t border-white/5" />

                  <button
                    onClick={() => {
                      setIsUserDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={openAuthModal}
                className="flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-all shadow-sm"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            </div>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Toggle Navigation"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer navigation */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-white/5 bg-[#08090d]/95 px-4 py-4 space-y-1 animate-in fade-in duration-200">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-rose-500 text-white font-semibold'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
