import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { NewsVideo } from '../../../server/newsService';

interface Props {
  video: NewsVideo;
  onClose: () => void;
}

export function NewsVideoPlayer({ video, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
  }, [video.url]);

  if (video.type === 'embed') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-rose-500">Close</button>
        <iframe
          src={video.url}
          className="w-full max-w-4xl aspect-video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-rose-500">Close</button>
      <div className="relative w-full max-w-4xl aspect-video bg-black flex items-center justify-center">
        {loading && <Loader2 className="animate-spin w-12 h-12 text-rose-500" />}
        {error && <div className="text-rose-500 flex items-center gap-2"><AlertCircle /> {error}</div>}
        <video
          ref={videoRef}
          src={video.url}
          className={`w-full h-full ${loading ? 'hidden' : 'block'}`}
          controls
          onLoadedData={() => setLoading(false)}
          onError={() => { setLoading(false); setError('Failed to load video'); }}
        />
      </div>
    </div>
  );
}
