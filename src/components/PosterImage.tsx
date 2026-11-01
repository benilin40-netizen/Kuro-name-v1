import React, { useState, useEffect } from 'react';
import { Film } from 'lucide-react';

interface PosterImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  badge?: string;
}

export const PosterImage: React.FC<PosterImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackClassName = 'w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-rose-950/30 to-black text-slate-400 p-2 text-center',
  badge,
}) => {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  if (!src || error) {
    return (
      <div className={fallbackClassName}>
        <Film className="w-5 h-5 text-rose-500/50 mb-1 shrink-0" />
        <span className="text-[10px] font-bold text-slate-300 line-clamp-2 px-1">
          {alt || 'Anime Poster'}
        </span>
        {badge && (
          <span className="mt-1 text-[8px] font-mono text-rose-400/80 bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-500/20">
            {badge}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setError(true)}
      className={className}
    />
  );
};
