import React, { useState, useEffect } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { AnimeCard } from '../components/AnimeCard.tsx';
import { Compass, Sparkles, Loader2 } from 'lucide-react';

interface GenresViewProps {
  onSelectAnime: (animeId: number) => void;
  initialGenre?: string;
}

export const GenresView: React.FC<GenresViewProps> = ({ onSelectAnime, initialGenre = 'Action' }) => {
  const [currentGenre, setCurrentGenre] = useState(initialGenre);
  const [animeList, setAnimeList] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(true);

  const genreList = [
    { name: 'Action', desc: 'High adrenaline fights, martial arts, and epic battles' },
    { name: 'Adventure', desc: 'Expeditions across unknown realms and epic journeys' },
    { name: 'Comedy', desc: 'Laugh-out-loud moments, slapstick, and parody' },
    { name: 'Drama', desc: 'Deep emotional narratives and gripping interpersonal conflict' },
    { name: 'Fantasy', desc: 'Magic systems, mythical beasts, and supernatural lore' },
    { name: 'Romance', desc: 'Heartfelt relationships, confessions, and romantic tension' },
    { name: 'Sci-Fi', desc: 'Cyberpunk futures, space exploration, and futuristic tech' },
    { name: 'Horror', desc: 'Spine-chilling terror, psychological scares, and the occult' },
    { name: 'Mystery', desc: 'Detective investigations, enigmatic puzzles, and plot twists' },
    { name: 'Sports', desc: 'Intense competition, athletic drive, and team camaraderie' },
    { name: 'Supernatural', desc: 'Spirits, curses, yokai, and otherworldly powers' },
    { name: 'Slice of Life', desc: 'Heartwarming everyday experiences and realistic stories' },
    { name: 'Thriller', desc: 'Suspenseful cat-and-mouse games and high-stakes tension' },
    { name: 'Music', desc: 'Idol stages, band rehearsals, and acoustic passions' },
    { name: 'Historical', desc: 'Feudal eras, historical recreations, and bygone centuries' },
  ];

  useEffect(() => {
    const fetchGenreAnime = async () => {
      try {
        setLoading(true);
        const data = await ClientAnimeService.searchAnime({
          genre: currentGenre,
          sort: 'POPULARITY_DESC',
          perPage: 24,
        });
        setAnimeList(data.media || []);
      } catch (err) {
        console.error('Failed to fetch genre anime:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGenreAnime();
  }, [currentGenre]);

  const activeGenreObj = genreList.find((g) => g.name === currentGenre) || genreList[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-lg bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 text-xs font-bold text-teal-400 uppercase tracking-wider mb-2">
          <Compass className="w-3.5 h-3.5" /> Genre Spectrum
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Browse by Category: {currentGenre}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {activeGenreObj.desc}
        </p>
      </div>

      {/* Genre Grid Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
        {genreList.map((g) => {
          const isActive = currentGenre === g.name;
          return (
            <button
              key={g.name}
              onClick={() => setCurrentGenre(g.name)}
              className={`p-3.5 rounded-lg text-left border transition-colors ${
                isActive
                  ? 'bg-rose-600 text-white border-rose-600 font-bold'
                  : 'bg-[#0e111a] text-slate-300 border-white/5 hover:border-white/15 hover:bg-white/5'
              }`}
            >
              <div className="font-bold text-xs">{g.name}</div>
              <div className={`text-[10px] line-clamp-1 mt-0.5 ${isActive ? 'text-rose-100' : 'text-slate-400'}`}>
                {g.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Genre Anime Results */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4.2] rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : animeList.length === 0 ? (
        <div className="p-16 rounded-lg bg-[#0e1017] border border-white/5 text-center text-slate-400 text-xs">
          No anime found for {currentGenre}.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
          {animeList.map((anime, idx) => (
            <AnimeCard
              key={`${anime.id}_${idx}`}
              anime={anime}
              onSelect={onSelectAnime}
              showCountdown={true}
            />
          ))}
        </div>
      )}
    </div>
  );
};
