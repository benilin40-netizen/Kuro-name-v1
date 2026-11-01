import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import { AnimeMedia } from '../types/anime.ts';
import { ClientAnimeService } from '../api/animeService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { collectEpisodeSources, AggregatedStreamSource } from '../services/streamingAggregator.ts';
import {
  X,
  Tv,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Server,
  Radio,
} from 'lucide-react';

type PlayerState = 'IDLE' | 'LOADING' | 'READY' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR' | 'UNAVAILABLE';

interface AnikotoEmbedPlayerProps {
  anime: AnimeMedia | null;
  initialEpisodeNumber?: number;
  initialSeasonNumber?: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectAnime?: (animeId: number) => void;
}

export type PlaybackType = 'DIRECT_MP4' | 'HLS' | 'EMBED' | 'EXTERNAL' | 'INVALID';

export interface StreamSourceItem {
  id: string;
  name: string;
  provider: 'sanka' | 'aniwixi' | 'justalk' | 'anikoto' | 'server' | 'custom' | string;
  sourceName: string;
  url: string;
  type: 'mp4' | 'hls' | 'embed' | 'external';
  episode: number;
  isOfficial?: boolean;
}

export function classifyVideoUrl(url: string | null | undefined): {
  url: string | null;
  type: PlaybackType;
} {
  if (!url || typeof url !== 'string') {
    return { url: null, type: 'INVALID' };
  }

  const clean = url.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return { url: null, type: 'INVALID' };
  }

  const lower = clean.toLowerCase();

  // 1. Direct MP4 or WEBM file
  if (lower.includes('.mp4') || lower.includes('.webm')) {
    return { url: clean, type: 'DIRECT_MP4' };
  }

  // 2. HLS Manifest (.m3u8)
  if (lower.includes('.m3u8')) {
    return { url: clean, type: 'HLS' };
  }

  // 3. Embedded Player URL
  if (lower.includes('embed') || lower.includes('/e/') || lower.includes('player')) {
    return { url: clean, type: 'EMBED' };
  }

  return { url: clean, type: 'EXTERNAL' };
}

export const VideoPlayerModal: React.FC<AnikotoEmbedPlayerProps> = ({
  anime,
  initialEpisodeNumber = 1,
  initialSeasonNumber = 1,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [currentEpisode, setCurrentEpisode] = useState<number>(initialEpisodeNumber);
  const [currentSeason, setCurrentSeason] = useState<number>(initialSeasonNumber);
  const [selectedLanguage, setSelectedLanguage] = useState<'sub' | 'dub'>(() => {
    return (localStorage.getItem('kuronami_pref_language') as 'sub' | 'dub') || 'sub';
  });

  const [episodesList, setEpisodesList] = useState<any[]>([]);
  const [currentEpisodeObj, setCurrentEpisodeObj] = useState<any | null>(null);

  // Multi-Source State (Sanka + Aniwixi + Justalk + Server)
  const [sources, setSources] = useState<StreamSourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);

  const [playerState, setPlayerState] = useState<PlayerState>('LOADING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showEpisodeEndedOverlay, setShowEpisodeEndedOverlay] = useState(false);

  // Sync initial episode & season props
  useEffect(() => {
    if (initialEpisodeNumber) setCurrentEpisode(initialEpisodeNumber);
    if (initialSeasonNumber) setCurrentSeason(initialSeasonNumber);
  }, [initialEpisodeNumber, initialSeasonNumber]);

  // Load episodes list
  useEffect(() => {
    if (!isOpen || !anime) return;

    let isCancelled = false;

    ClientAnimeService.getEpisodes(anime.id)
      .then((eps) => {
        if (isCancelled) return;
        const list = Array.isArray(eps) ? eps : [];
        setEpisodesList(list);
        const match = list.find((e: any) => e.number === currentEpisode) || list[0] || null;
        setCurrentEpisodeObj(match);
      })
      .catch((err) => {
        console.error('[VIDEO PLAYER MODAL] Failed to load episodes:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, anime, currentEpisode, currentSeason]);

  // Gather Multi-Sources using collectEpisodeSources
  useEffect(() => {
    if (!isOpen || !anime) return;

    let isCancelled = false;
    setLoadingSources(true);
    setPlayerState('LOADING');
    setErrorMessage(null);

    collectEpisodeSources(anime, anime.id, currentEpisode)
      .then((res) => {
        if (isCancelled) return;
        const mapped: StreamSourceItem[] = res.allSources.map((s) => ({
          id: s.id,
          name: s.sourceName,
          provider: s.provider,
          sourceName: s.sourceName,
          url: s.url,
          type:
            s.playbackMode === 'direct-video'
              ? 'mp4'
              : s.playbackMode === 'hls'
              ? 'hls'
              : s.playbackMode === 'embed'
              ? 'embed'
              : 'external',
          episode: currentEpisode,
          isOfficial: s.isOfficial,
        }));

        setSources(mapped);
        setSelectedSourceId(res.bestPermittedSource?.id || (mapped.length > 0 ? mapped[0].id : null));
        setLoadingSources(false);
        if (mapped.length > 0) setPlayerState('READY');
        else setPlayerState('ERROR');
      })
      .catch((err) => {
        console.error('[VIDEO PLAYER MODAL] Error collecting sources:', err);
        if (!isCancelled) {
          setLoadingSources(false);
          setPlayerState('ERROR');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, anime, currentEpisode, selectedLanguage]);

  // Active Selected Source
  const activeSource = useMemo(() => {
    return sources.find((s) => s.id === selectedSourceId) || sources[0] || null;
  }, [sources, selectedSourceId]);

  // Attach HLS if applicable
  useEffect(() => {
    if (!activeSource || activeSource.type !== 'hls' || !activeSource.url || !videoRef.current) return;

    const video = videoRef.current;
    let hls: Hls | null = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeSource.url;
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(activeSource.url);
      hls.attachMedia(video);
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [activeSource]);

  // Handle iframe load event
  const handleIframeLoad = () => {
    setPlayerState('PLAYING');
  };

  // Handle iframe error / refusal
  const handleIframeError = () => {
    setPlayerState('ERROR');
    setErrorMessage('Streaming source is restricted in this frame context.');
  };

  const openSourceUrl = (url?: string) => {
    const targetUrl = url || activeSource?.url;
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const totalEpisodes = anime?.episodes || episodesList.length || 24;

  const handlePrevEpisode = () => {
    if (currentEpisode > 1) {
      setCurrentEpisode((prev) => prev - 1);
      setShowEpisodeEndedOverlay(false);
    }
  };

  const handleNextEpisode = () => {
    if (currentEpisode < totalEpisodes) {
      setCurrentEpisode((prev) => prev + 1);
      setShowEpisodeEndedOverlay(false);
    }
  };

  if (!isOpen || !anime) return null;

  const animeTitle = anime.title.english || anime.title.romaji || (anime.title as any).userPreferred || 'Anime Streaming';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl rounded-2xl bg-[#08090d] border border-white/10 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh]">
        
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0e1017]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Tv className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white line-clamp-1">
                {animeTitle}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-rose-400 font-semibold">Episode {currentEpisode}</span>
                <span>·</span>
                <span className="uppercase text-[10px] bg-white/5 px-2 py-0.5 rounded font-bold text-slate-300">
                  {activeSource ? activeSource.name : 'Multi-Provider Player'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* SUB / DUB toggle */}
            <div className="flex items-center rounded-xl bg-[#08090d] border border-white/10 p-1 text-xs">
              <button
                onClick={() => {
                  setSelectedLanguage('sub');
                  localStorage.setItem('kuronami_pref_language', 'sub');
                }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  selectedLanguage === 'sub'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                SUB
              </button>
              <button
                onClick={() => {
                  setSelectedLanguage('dub');
                  localStorage.setItem('kuronami_pref_language', 'dub');
                }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  selectedLanguage === 'dub'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                DUB
              </button>
            </div>

            {activeSource && (
              <button
                onClick={() => openSourceUrl(activeSource.url)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-colors shadow-sm"
                title="Open stream source in top-level window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open source</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white p-2 transition-colors"
              aria-label="Close player modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Player Container */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {(playerState === 'LOADING' || loadingSources) && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/90 text-slate-300 text-xs">
              <div className="w-9 h-9 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
              <span className="font-semibold">Discovering streaming sources from Sanka, Aniwixi & Justalk...</span>
            </div>
          )}

          {playerState === 'ERROR' || !activeSource ? (
            /* Fallback Screen */
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/95 p-6 text-center animate-in fade-in duration-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-1">
                <Tv className="w-6 h-6" />
              </div>
              <div className="text-white font-extrabold text-base sm:text-lg">
                {sources.length === 0 ? 'Streaming sources unavailable right now' : 'External stream source'}
              </div>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                {sources.length === 0
                  ? 'We could not load active stream sources for this episode right now.'
                  : 'Open the stream source directly in a top-level window.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                {activeSource && (
                  <button
                    onClick={() => openSourceUrl(activeSource.url)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-all shadow-lg shadow-rose-600/30"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open video player</span>
                  </button>
                )}
                <button
                  onClick={handlePrevEpisode}
                  disabled={currentEpisode <= 1}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors disabled:opacity-40"
                >
                  Previous Episode
                </button>
                <button
                  onClick={handleNextEpisode}
                  disabled={currentEpisode >= totalEpisodes}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors disabled:opacity-40"
                >
                  Next Episode
                </button>
              </div>
            </div>
          ) : activeSource.type === 'mp4' ? (
            /* PLAYER DECISION 1: Direct MP4 */
            <video
              key={activeSource.url}
              src={activeSource.url}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full object-contain bg-black"
              onError={handleIframeError}
            />
          ) : activeSource.type === 'hls' ? (
            /* PLAYER DECISION 2: HLS Stream */
            <video
              ref={videoRef}
              key={activeSource.url}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full object-contain bg-black"
              onError={handleIframeError}
            />
          ) : activeSource.type === 'embed' ? (
            /* PLAYER DECISION 3: Permitted iframe without sandbox */
            <iframe
              key={activeSource.url}
              src={activeSource.url}
              title="Video Player"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              style={{
                width: '100%',
                height: '100%',
                border: 0,
              }}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          ) : (
            /* PLAYER DECISION 4: External Webpage/Player Card */
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/95 p-6 text-center animate-in fade-in duration-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-1">
                <Radio className="w-6 h-6" />
              </div>
              <div className="text-white font-extrabold text-base sm:text-lg">
                External Stream Source ({activeSource.name})
              </div>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                Click "Open source" to view this stream in a new top-level tab.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <button
                  onClick={() => openSourceUrl(activeSource.url)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-all shadow-lg shadow-rose-600/30"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open source</span>
                </button>
              </div>
            </div>
          )}

          {/* Episode Completed Overlay */}
          {showEpisodeEndedOverlay && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-black/90 text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Episode {currentEpisode} Completed!</h3>
                <p className="text-xs text-slate-300 mt-1">Ready for the next episode?</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleNextEpisode}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors"
                >
                  Play Episode {currentEpisode + 1}
                </button>
                <button
                  onClick={() => setShowEpisodeEndedOverlay(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Multi-Source & Navigation Bar */}
        <div className="p-4 bg-[#0e1017] border-t border-white/5 space-y-3">
          {/* STREAM SOURCES */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 uppercase shrink-0 mr-1">
              <Server className="w-3.5 h-3.5 text-rose-500" />
              <span>Sources:</span>
            </span>
            {sources.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No stream sources found</span>
            ) : (
              sources.map((srcOption) => {
                const isSelected = srcOption.id === selectedSourceId;
                return (
                  <button
                    key={srcOption.id}
                    onClick={() => {
                      setSelectedSourceId(srcOption.id);
                      setPlayerState('READY');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                      isSelected
                        ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400'}`} />
                    <span>{srcOption.name}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-3">
            <button
              onClick={handlePrevEpisode}
              disabled={currentEpisode <= 1}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-semibold text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev Episode</span>
            </button>

            <div className="flex items-center gap-2 overflow-x-auto max-w-md py-1 px-2 scrollbar-none">
              {Array.from({ length: Math.min(totalEpisodes, 30) }).map((_, i) => {
                const epNum = i + 1;
                const isCurrent = epNum === currentEpisode;
                return (
                  <button
                    key={epNum}
                    onClick={() => {
                      setCurrentEpisode(epNum);
                      setShowEpisodeEndedOverlay(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                      isCurrent
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    {epNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleNextEpisode}
              disabled={currentEpisode >= totalEpisodes}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-xs font-bold text-white transition-colors shadow-sm"
            >
              <span>Next Episode</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default VideoPlayerModal;

