import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Loader2, AlertCircle } from 'lucide-react';
import { NewsVideo } from '../../types/news';

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

    if (video.type === 'hls' && videoRef.current) {
      const videoElement = videoRef.current;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(video.url);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          videoElement.play().catch(e => console.error('Auto-play failed', e));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            setError('HLS playback error');
            setLoading(false);
          }
        });
        return () => hls.destroy();
      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = video.url;
        videoElement.addEventListener('loadedmetadata', () => {
            setLoading(false);
            videoElement.play();
        });
      } else {
        setError('HLS not supported');
        setLoading(false);
      }
    } else if (video.type === 'mp4' && videoRef.current) {
        setLoading(false);
    }
  }, [video.url, video.type]);

  if (video.type === 'embed') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-rose-500">Close</button>
        <iframe
          src={video.url}
          className="w-full max-w-4xl aspect-video rounded-lg"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-rose-500">Close</button>
      <div className="relative w-full max-w-4xl aspect-video bg-black flex items-center justify-center rounded-lg overflow-hidden">
        {loading && <Loader2 className="animate-spin w-12 h-12 text-rose-500" />}
        {error && <div className="text-rose-500 flex items-center gap-2"><AlertCircle /> {error}</div>}
        <video
          ref={videoRef}
          src={video.type === 'mp4' ? video.url : undefined}
          className={`w-full h-full ${loading ? 'hidden' : 'block'}`}
          controls
          onLoadedData={() => setLoading(false)}
          onError={() => { setLoading(false); setError('Failed to load video'); }}
        />
      </div>
    </div>
  );
}
