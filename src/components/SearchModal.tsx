import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Star, Calendar, Tv } from 'lucide-react';
import { AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAnime: (animeId: number) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectAnime }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string>('ALL');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setHasSearched(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setHasSearched(true);
      try {
        const data = await ClientAnimeService.searchAnime({
          query: query.trim(),
          format: selectedFormat !== 'ALL' ? selectedFormat : undefined,
          perPage: 12,
        });
        setResults(data.media || []);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedFormat]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#0d1018] border border-white/10 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <Search className="w-5 h-5 text-rose-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anime by title, Japanese name (e.g. Solo Leveling, Jujutsu, Frieren)..."
            className="flex-1 bg-transparent text-white placeholder-slate-500 text-base focus:outline-none"
          />
          {loading && <Loader2 className="w-5 h-5 text-rose-400 animate-spin shrink-0" />}
          {query && !loading && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-xs font-medium"
          >
            ESC
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5 overflow-x-auto text-xs">
          <span className="text-slate-500 mr-1 shrink-0">Format:</span>
          {['ALL', 'TV', 'MOVIE', 'OVA', 'ONA'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSelectedFormat(fmt)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                selectedFormat === fmt
                  ? 'bg-rose-500 text-white'
                  : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>

        {/* Search Results list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!hasSearched && (
            <div className="py-12 text-center text-slate-500 text-sm">
              Type an anime title to search across the entire AniList index with real-time metadata.
            </div>
          )}

          {hasSearched && !loading && results.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">
              No anime found matching <span className="text-white font-medium">"{query}"</span>.
            </div>
          )}

          {results.map((anime) => {
            const title = anime.title.english || anime.title.romaji;
            const subTitle = anime.title.native || anime.title.romaji;
            const score = anime.averageScore ? `${anime.averageScore}%` : null;

            return (
              <button
                key={anime.id}
                onClick={() => {
                  onSelectAnime(anime.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 p-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left group"
              >
                <img
                  src={anime.coverImage.medium || anime.coverImage.large}
                  alt={title}
                  className="w-12 h-16 object-cover rounded-lg shrink-0 shadow-md group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate group-hover:text-rose-400 transition-colors">
                    {title}
                  </div>
                  {subTitle && subTitle !== title && (
                    <div className="text-xs text-slate-400 truncate mt-0.5">{subTitle}</div>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Tv className="w-3 h-3 text-slate-400" />
                      {anime.format || 'TV'}
                    </span>
                    {anime.seasonYear && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {anime.seasonYear}
                      </span>
                    )}
                    {score && (
                      <span className="flex items-center gap-1 text-amber-400 font-medium">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {score}
                      </span>
                    )}
                    <span className="capitalize text-slate-400">
                      {anime.status?.toLowerCase().replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
