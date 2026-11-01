import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  AlertCircle,
  Loader2,
  Sparkles,
  Terminal,
  Server,
  RefreshCw,
  Check,
  ExternalLink,
  FastForward,
  SkipForward,
  SkipBack,
  Subtitles,
  SlidersHorizontal,
} from 'lucide-react';
import { StreamingSourceItem, VideoDebugLog } from '../services/streamingProviderAdapter.ts';

export interface VideoPlayerProps {
  src?: string | null;
  embedUrl?: string | null;
  sources?: StreamingSourceItem[];
  activeSourceIndex?: number;
  onSelectSource?: (index: number) => void;
  onSourceFallback?: (failedSourceUrl: string, reason: string) => void;
  title?: string;
  episodeNumber?: number;
  animeTitle?: string;
  isDemo?: boolean;
  status?: 'READY' | 'PROCESSING' | 'ERROR' | 'UNAVAILABLE' | 'UPLOADING' | 'NO_SOURCE';
  errorMessage?: string;
  loadingStep?: 'loading_episode' | 'finding_stream' | 'preparing_player' | null;
  debugInfo?: VideoDebugLog | null;
  initialTime?: number;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
  onPreviousEpisode?: () => void;
  hasPreviousEpisode?: boolean;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  subtitles?: Array<{ url: string; lang: string }>;
  onRetry?: () => void;
  onSwitchProvider?: () => void;
  onOpenExternal?: () => void;
  loadingTimeoutMs?: number;
}

function redactTokens(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const sensitiveParams = ['token', 'key', 'sig', 'signature', 'auth', 'access_token', 'credential', 'secret', 'h'];
    sensitiveParams.forEach(param => {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    });
    return parsed.toString();
  } catch {
    return url.replace(/([?&](?:token|key|sig|signature|auth|access_token|h)=)([^&]+)/gi, '$1[REDACTED]');
  }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  embedUrl,
  sources = [],
  activeSourceIndex = 0,
  onSelectSource,
  onSourceFallback,
  title,
  episodeNumber,
  animeTitle,
  isDemo = false,
  status = 'READY',
  errorMessage,
  loadingStep = null,
  debugInfo = null,
  initialTime = 0,
  onProgress,
  onEnded,
  onNextEpisode,
  hasNextEpisode = false,
  onPreviousEpisode,
  hasPreviousEpisode = false,
  intro,
  outro,
  onRetry,
  onSwitchProvider,
  onOpenExternal,
  loadingTimeoutMs,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [levels, setLevels] = useState<Array<{ id: number; height: number; label: string }>>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; lang: string; name: string }>>([]);
  const [currentSubTrack, setCurrentSubTrack] = useState<number>(-1);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [initialSeekDone, setInitialSeekDone] = useState(false);
  const [playerState, setPlayerState] = useState<string>('Initializing');

  const skipIntro = () => {
    if (intro && videoRef.current) {
      videoRef.current.currentTime = intro.end + 0.5;
    }
  };

  const skipOutro = () => {
    if (outro && videoRef.current) {
      videoRef.current.currentTime = outro.end + 0.5;
    }
  };

  const controlsTimeoutRef = useRef<any>(null);
  const networkRetryCountRef = useRef<number>(0);
  const loadTimeoutRef = useRef<any>(null);
  const bufferStallRecoveryCountRef = useRef<number>(0);
  const lastStallRecoveryTimeRef = useRef<number>(0);
  const fragStartTimeMapRef = useRef<Map<number | string, number>>(new Map());
  const fragRetryCountMapRef = useRef<Map<number | string, number>>(new Map());
  const fragTimeoutHandleRef = useRef<any>(null);

  // Active source resolution
  const activeSource: StreamingSourceItem | undefined = sources[activeSourceIndex];
  const activeUrl = activeSource ? activeSource.url : (src || embedUrl || '');
  const isIframe = activeSource?.type === 'iframe' ||
    Boolean(embedUrl && embedUrl === activeUrl) ||
    activeUrl.includes('embed') ||
    (activeUrl.includes('vcdn.me') && !activeUrl.includes('.m3u8')) ||
    (activeUrl.includes('media.cm') && !activeUrl.includes('.mp4'));

  // PostMessage listener for embed players (VidLink, plyr, iframe messengers)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;
        const evtType = data.event || data.type || data.status;
        if (evtType === 'ready' || evtType === 'player_ready' || evtType === 'playback_ready') {
          setIsLoading(false);
          setPlayerState('Embed Player Ready');
        } else if (evtType === 'play' || evtType === 'playing') {
          setIsLoading(false);
          setIsPlaying(true);
          setPlayerState('Playing');
        } else if (evtType === 'pause') {
          setIsPlaying(false);
        } else if (evtType === 'ended') {
          setIsPlaying(false);
          if (onEnded) onEnded();
        } else if (evtType === 'timeupdate' && typeof data.currentTime === 'number') {
          setCurrentTime(data.currentTime);
          if (data.duration) setDuration(data.duration);
          if (onProgress) onProgress(data.currentTime, data.duration || 0);
        }
      } catch {}
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onEnded, onProgress]);

  // Configurable loading watchdog (25-second initialization timeout)
  useEffect(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

    if (isLoading && status === 'READY' && activeUrl) {
      const timeoutMs = loadingTimeoutMs || (isIframe ? 25000 : 12000);
      const timeoutSec = Math.round(timeoutMs / 1000);

      if (activeUrl.includes('aniembed.se')) {
        console.log(`[VIDEO PLAYER] Initializing AniEmbed (${redactTokens(activeUrl)})`);
      }

      loadTimeoutRef.current = setTimeout(() => {
        if (isLoading) {
          console.warn(`[VIDEO PLAYER] Initialization timeout after ${timeoutSec} seconds for ${redactTokens(activeUrl)}`);
          if (onSourceFallback) {
            onSourceFallback(activeUrl, `Timeout (${timeoutSec}s exceeded)`);
          } else {
            setPlayerError(`Stream initialization timed out after ${timeoutSec} seconds. Try retrying, switching provider, or opening externally.`);
            setIsLoading(false);
            setPlayerState(`Fatal: ${timeoutSec}s Initialization Timeout`);
          }
        }
      }, timeoutMs);
    }

    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [isLoading, status, activeUrl, activeSourceIndex, sources.length, onSourceFallback, loadingTimeoutMs, isIframe]);

  // Setup video source & HLS (Only for non-iframe streams)
  useEffect(() => {
    setPlayerError(null);
    setIsLoading(true);
    setInitialSeekDone(false);
    networkRetryCountRef.current = 0;
    bufferStallRecoveryCountRef.current = 0;
    lastStallRecoveryTimeRef.current = 0;
    fragStartTimeMapRef.current.clear();
    fragRetryCountMapRef.current.clear();
    if (fragTimeoutHandleRef.current) clearTimeout(fragTimeoutHandleRef.current);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (status !== 'READY' || !activeUrl) {
      setIsLoading(false);
      setPlayerState('Idle');
      return;
    }

    if (isIframe) {
      setPlayerState('Loading Official Embed Player');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const cleanSrc = activeUrl.trim();
    const isHlsUrl = cleanSrc.includes('.m3u8') || cleanSrc.includes('manifest/video');

    setPlayerState(isHlsUrl ? 'Loading HLS Manifest' : 'Loading Native Video');

    if (isHlsUrl && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        manifestLoadingTimeOut: 15000,
        fragLoadingTimeOut: 20000,
        maxBufferHole: 0.2,
        maxFragLookUpTolerance: 0.25,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 3,
      });

      hlsRef.current = hls;
      hls.loadSource(cleanSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setPlayerState('Ready (Manifest Parsed)');
        if (hls.levels && hls.levels.length > 0) {
          const lvls = hls.levels.map((l: any, idx: number) => ({
            id: idx,
            height: l.height || 720,
            label: l.height ? `${l.height}p` : `Level ${idx + 1}`,
          }));
          setLevels(lvls);
        }
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          const subs = hls.subtitleTracks.map((t: any, idx: number) => ({
            id: idx,
            lang: t.lang || t.name || 'Sub',
            name: t.name || t.lang || `Track ${idx + 1}`,
          }));
          setSubtitleTracks(subs);
        }
        if (initialTime > 0 && !initialSeekDone) {
          video.currentTime = initialTime;
          setInitialSeekDone(true);
        }
      });

      hls.on(Hls.Events.FRAG_LOADING, (_event: any, data: any) => {
        const fragSn = data.frag?.sn;
        if (fragSn !== undefined && fragSn !== null) {
          fragStartTimeMapRef.current.set(fragSn, Date.now());
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, (_event: any, data: any) => {
        const fragSn = data.frag?.sn;
        if (fragSn !== undefined && fragSn !== null) {
          fragRetryCountMapRef.current.delete(fragSn);
          fragStartTimeMapRef.current.delete(fragSn);
        }
      });

      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        const errorDetail = data.details || data.type;

        if (
          data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
          data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
        ) {
          const fragSn = data.frag?.sn ?? 0;
          const startTime = fragStartTimeMapRef.current.get(fragSn) || Date.now();
          const elapsedTime = Date.now() - startTime;
          const retryCount = (fragRetryCountMapRef.current.get(fragSn) || 0) + 1;
          fragRetryCountMapRef.current.set(fragSn, retryCount);

          const rawUrl = data.frag?.url || data.url || cleanSrc;
          const safeUrl = redactTokens(rawUrl);
          const httpStatus = data.response?.code || data.networkDetails?.status || 0;
          const errorType = data.details;

          console.warn(`[VIDEO DEBUG] Frag load error/timeout (segment ${fragSn}), reloading segment...`, {
            url: safeUrl,
            httpStatus,
            retryCount,
            errorType,
            elapsedTimeMs: elapsedTime,
          });

          if (retryCount > 3) {
            console.error(`[VIDEO DEBUG] Frag load retries exhausted (max 3) for segment ${fragSn}`);
            setPlayerError(`Fragment load failed repeatedly for segment ${fragSn} (HTTP ${httpStatus}).`);
            setPlayerState('Fatal: Frag Load Retries Exhausted');
            hls.destroy();
            if (onSourceFallback) {
              onSourceFallback(cleanSrc, 'fragLoadTimeoutExhausted');
            }
          } else {
            setPlayerState(`Fragment Timeout - Retry ${retryCount}/3`);
            const backoff = Math.min(1000 * Math.pow(2, retryCount - 1), 8000);
            if (fragTimeoutHandleRef.current) clearTimeout(fragTimeoutHandleRef.current);
            fragTimeoutHandleRef.current = setTimeout(() => {
              if (hlsRef.current === hls) {
                hls.startLoad();
              }
            }, backoff);
          }
          return;
        }

        // 1. Recoverable buffer gaps (bufferSeekOverHole, bufferNudgeOnStall)
        if (
          data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE ||
          data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL
        ) {
          console.debug(`[HLS DEBUG] Recoverable buffer event: ${errorDetail} (fatal: ${Boolean(data.fatal)})`, {
            hole: (data as any).hole,
            frag: (data as any).frag?.sn,
          });
          return;
        }

        // 2. Buffer stalled error
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          console.debug('[HLS DEBUG] Buffer stalled notice (fatal: false)');
          if (!video) return;

          const now = Date.now();
          if (now - lastStallRecoveryTimeRef.current < 2000) {
            return;
          }

          const isPaused = video.paused;
          const readyState = video.readyState;
          const curTime = video.currentTime;
          const dur = video.duration || 0;

          if (isPaused || readyState >= 3) {
            return;
          }

          let nextBufferStart = 0;
          const buffered = video.buffered;
          if (buffered && buffered.length > 0) {
            for (let i = 0; i < buffered.length; i++) {
              const start = buffered.start(i);
              const end = buffered.end(i);
              if (curTime >= start && curTime <= end) {
                break;
              } else if (start > curTime && start - curTime <= 0.3) {
                nextBufferStart = start;
                break;
              }
            }
          }

          if (bufferStallRecoveryCountRef.current < 3) {
            bufferStallRecoveryCountRef.current += 1;
            lastStallRecoveryTimeRef.current = now;
            setPlayerState('Buffer Stalled - Nudging Playhead');

            if (nextBufferStart > curTime && nextBufferStart < dur) {
              video.currentTime = Math.min(nextBufferStart + 0.05, dur);
            } else if (curTime + 0.1 < dur) {
              video.currentTime = curTime + 0.1;
            }
          }
          return;
        }

        if (
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
        ) {
          console.error('[VIDEO DEBUG] Fatal error: manifestLoadError');
          setPlayerState('Fatal: manifestLoadError');
          setPlayerError('Stream manifest failed to load.');
          hls.destroy();
          if (onSourceFallback) {
            onSourceFallback(cleanSrc, 'manifestLoadError');
          }
          return;
        }

        // Fatal errors handling
        if (data.fatal) {
          console.warn(`[VIDEO DEBUG] Fatal HLS error encountered: ${errorDetail}`, data);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[VIDEO DEBUG] Network error, recovering...');
              setPlayerState('Network Error - Attempting Recovery');
              if (networkRetryCountRef.current < 2) {
                networkRetryCountRef.current += 1;
                hls.startLoad();
              } else {
                console.error('[VIDEO DEBUG] Fatal error: networkError retry limit reached');
                setPlayerError('Network error connecting to video stream.');
                hls.destroy();
                if (onSourceFallback) {
                  onSourceFallback(cleanSrc, 'networkError');
                }
              }
              break;

            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[VIDEO DEBUG] Media error, recovering...');
              setPlayerState('Media Error - Recovering');
              hls.recoverMediaError();
              break;

            default:
              console.error('[VIDEO DEBUG] Fatal playback error:', data);
              setPlayerState(`Fatal error: ${data.details || data.type}`);
              setPlayerError(`Playback error (${data.details || data.type}).`);
              hls.destroy();
              if (onSourceFallback) {
                onSourceFallback(cleanSrc, data.details || 'unknown');
              }
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = cleanSrc;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        setPlayerState('Native HLS Ready');
        if (initialTime > 0 && !initialSeekDone) {
          video.currentTime = initialTime;
          setInitialSeekDone(true);
        }
      });
      video.addEventListener('error', () => {
        console.error('[VIDEO DEBUG] Native HLS video element error');
        setPlayerError('Safari native HLS stream error.');
        if (onSourceFallback) onSourceFallback(cleanSrc, 'nativeHlsError');
      });
    } else {
      video.src = cleanSrc;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        setPlayerState('MP4 Ready');
        if (initialTime > 0 && !initialSeekDone) {
          video.currentTime = initialTime;
          setInitialSeekDone(true);
        }
      });
      video.addEventListener('error', () => {
        console.error('[VIDEO DEBUG] MP4 video element error');
        setPlayerError('MP4 video file error.');
        if (onSourceFallback) onSourceFallback(cleanSrc, 'mp4Error');
      });
    }

    return () => {
      if (fragTimeoutHandleRef.current) clearTimeout(fragTimeoutHandleRef.current);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeUrl, isIframe, status, initialTime, onSourceFallback]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);
    if (onProgress && Math.floor(cur) % 5 === 0) {
      onProgress(cur, dur);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (onEnded) onEnded();
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          // Autoplay policy handling: try muted if browser blocked unmuted playback
          if (err.name === 'NotAllowedError') {
            video.muted = true;
            setIsMuted(true);
            video.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
      setIsMuted(vol === 0);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
      const remM = m % 60;
      return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // If fatal error or definitively unavailable
  const hasFatalError = Boolean(playerError) || status === 'ERROR';
  const isNoSource = status === 'NO_SOURCE' || status === 'UNAVAILABLE' || (!activeUrl && !loadingStep && !isLoading);

  if (hasFatalError || isNoSource) {
    const heading = hasFatalError
      ? 'Streaming provider temporarily unavailable'
      : 'No authorized stream is currently available';

    const desc =
      playerError ||
      errorMessage ||
      (hasFatalError
        ? 'The streaming provider failed to respond or returned an error. Please try another server or check back shortly.'
        : 'No legal, authorized stream has been provisioned for this episode in the streaming catalog.');

    return (
      <div className="relative aspect-video w-full rounded-2xl bg-[#090b10] border border-white/5 flex flex-col items-center justify-center p-8 text-center overflow-hidden">
        <div className="max-w-md space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
            {hasFatalError ? (
              <AlertCircle className="w-7 h-7 text-rose-500" />
            ) : (
              <Server className="w-7 h-7 text-amber-400" />
            )}
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">{heading}</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{desc}</p>
          </div>

          <div className="flex items-center justify-center gap-2.5 pt-2 flex-wrap">
            {onRetry && (
              <button
                onClick={() => {
                  setPlayerError(null);
                  setIsLoading(true);
                  onRetry();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Stream</span>
              </button>
            )}

            {onSwitchProvider && (
              <button
                onClick={onSwitchProvider}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
              >
                <Server className="w-3.5 h-3.5 text-rose-400" />
                <span>Switch Provider</span>
              </button>
            )}

            {onOpenExternal && (
              <button
                onClick={onOpenExternal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                <span>Open External Player</span>
              </button>
            )}

            <button
              onClick={() => setShowDebugModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-400 hover:text-white transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Diagnostics</span>
            </button>
          </div>
        </div>

        {/* Development Diagnostic Overlay */}
        {showDebugModal && debugInfo && (
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md p-6 overflow-y-auto text-left z-50">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold">
                <Terminal className="w-4 h-4" />
                <span>[VIDEO DEBUG DIAGNOSTICS]</span>
              </div>
              <button
                onClick={() => setShowDebugModal(false)}
                className="text-xs text-slate-400 hover:text-white font-bold font-mono"
              >
                Close ✕
              </button>
            </div>

            <div className="mt-4 font-mono text-xs text-slate-300 space-y-1.5">
              <p><span className="text-slate-500">Anime:</span> {debugInfo.anime}</p>
              <p><span className="text-slate-500">Episode:</span> {debugInfo.episode}</p>
              <p><span className="text-slate-500">Provider:</span> {debugInfo.provider}</p>
              <p><span className="text-slate-500">Source request:</span> {debugInfo.sourceRequest}</p>
              <p><span className="text-slate-500">HTTP status:</span> {debugInfo.httpStatus}</p>
              <p><span className="text-slate-500">Sources returned:</span> {debugInfo.sourcesReturned}</p>
              <p><span className="text-slate-500">Selected source:</span> {debugInfo.selectedSource}</p>
              <p><span className="text-slate-500">Type:</span> {debugInfo.type}</p>
              <p><span className="text-slate-500">Player state:</span> {playerState}</p>
              <p><span className="text-slate-500">Fatal error:</span> <span className="text-rose-400">{debugInfo.fatalError || playerError || 'None'}</span></p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const loadingMessage =
    loadingStep === 'loading_episode'
      ? 'Loading episode...'
      : loadingStep === 'finding_stream'
      ? 'Finding authorized stream...'
      : loadingStep === 'preparing_player'
      ? 'Preparing player...'
      : 'Connecting to authorized stream...';

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="group relative aspect-video w-full rounded-2xl bg-black border border-white/5 overflow-hidden select-none"
    >
      {/* 1. Official Iframe Player Viewport (VCDN / media.cm / embeds) */}
      {isIframe ? (
        <iframe
          id="anime-player"
          key={activeUrl}
          ref={iframeRef}
          src={activeUrl}
          title={title || `Episode ${episodeNumber}`}
          frameBorder={0}
          allow="autoplay; fullscreen; picture-in-picture; accelerometer; gyroscope; clipboard-write; encrypted-media"
          allowFullScreen
          scrolling="no"
          style={{
            width: "100%",
            height: "100%",
            aspectRatio: "16 / 9",
            border: 0,
          }}
          className="w-full h-full border-0 bg-black"
          referrerPolicy="no-referrer"
          onLoad={() => {
            console.log('[VIDEO PLAYER] Iframe loaded; playback not yet confirmed');
            setPlayerState('Iframe Loaded (Playback Unconfirmed)');
            setTimeout(() => {
              setIsLoading(false);
            }, 2000);
          }}
          onError={() => {
            console.error('[VIDEO PLAYER] Iframe failed to load');
            if (onSourceFallback) onSourceFallback(activeUrl, 'iframeLoadError');
          }}
        />
      ) : (
        /* 2. Direct HLS / Native MP4 Video Player Viewport */
        <video
          ref={videoRef}
          onClick={togglePlay}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onCanPlay={() => {
            setIsLoading(false);
            setPlayerState('Playback Ready');
          }}
          onPlaying={() => {
            setIsLoading(false);
            setIsPlaying(true);
            setPlayerState('Playing');
          }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsLoading(true)}
          playsInline
          className="w-full h-full object-contain cursor-pointer"
        />
      )}

      {/* 3. Non-blocking Loading State Overlay (shown while resolving or waiting for first frame) */}
      {(isLoading || Boolean(loadingStep)) && (
        <div className="absolute inset-0 z-30 bg-[#090b10]/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center pointer-events-none transition-opacity duration-300">
          <div className="max-w-md space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">{loadingMessage}</h3>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                {activeSource ? `Connecting to ${activeSource.provider}...` : 'Resolving verified playback sources'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Top Banner (Server Switcher & Debug Trigger) */}
      <div
        className={`absolute top-0 inset-x-0 p-4 flex items-center justify-between transition-opacity duration-300 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              <span>Licensed Stream</span>
            </span>
          )}

          <button
            onClick={() => setShowDebugModal(!showDebugModal)}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-[10px] font-mono text-slate-300 transition-colors flex items-center gap-1"
            title="Toggle Video Debug Inspector"
          >
            <Terminal className="w-3 h-3 text-rose-400" />
            <span>DEBUG</span>
          </button>
        </div>

        {/* Multi-Source Server Switcher */}
        {sources.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowServerMenu(!showServerMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 border border-white/15 text-xs font-mono text-slate-200 transition-colors shadow-lg"
            >
              <Server className="w-3.5 h-3.5 text-rose-400" />
              <span>
                Server {activeSourceIndex + 1}: {(sources[activeSourceIndex]?.provider || 'Stream').split(' ')[0]} ({(sources[activeSourceIndex]?.type || 'stream').toUpperCase()})
              </span>
            </button>

            {showServerMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-[#0e1017] border border-white/10 shadow-2xl p-1.5 z-40 space-y-1">
                {sources.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (onSelectSource) onSelectSource(idx);
                      setShowServerMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-mono transition-colors ${
                      idx === activeSourceIndex
                        ? 'bg-rose-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex flex-col text-left">
                      <span className="truncate">{s.provider}</span>
                      <span className="text-[10px] opacity-70">{s.language || 'Subbed'}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold opacity-80">{s.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4.5. Floating Skip Intro & Skip Outro Buttons */}
      {!isIframe && intro && currentTime >= intro.start && currentTime <= intro.end && (
        <button
          onClick={skipIntro}
          className="absolute bottom-20 right-6 z-30 px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold shadow-2xl flex items-center gap-1.5 transition-all transform hover:scale-105 backdrop-blur-md"
        >
          <FastForward className="w-4 h-4" />
          <span>Skip Intro</span>
        </button>
      )}

      {!isIframe && outro && currentTime >= outro.start && currentTime <= outro.end && (
        <button
          onClick={skipOutro}
          className="absolute bottom-20 right-6 z-30 px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold shadow-2xl flex items-center gap-1.5 transition-all transform hover:scale-105 backdrop-blur-md"
        >
          <FastForward className="w-4 h-4" />
          <span>Skip Outro</span>
        </button>
      )}

      {/* 5. Center Play Button for native video (when paused) */}
      {!isIframe && !isPlaying && !isLoading && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20 z-10"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-rose-600/90 hover:bg-rose-600 hover:scale-105 transition-all flex items-center justify-center shadow-2xl shadow-rose-950/60 backdrop-blur-sm">
            <Play className="w-8 h-8 fill-white text-white ml-1" />
          </div>
        </div>
      )}

      {/* 6. Native Controls Bar (shown for video element, omitted for iframe player which has built-in UI) */}
      {!isIframe && (
        <div
          className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 space-y-2.5 z-20 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress Scrubber */}
          <div className="relative flex items-center group/scrubber cursor-pointer">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 rounded-lg bg-white/20 accent-rose-500 cursor-pointer appearance-none group-hover/scrubber:h-2 transition-all"
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-white pt-1">
            <div className="flex items-center gap-3">
              {hasPreviousEpisode && onPreviousEpisode && (
                <button
                  onClick={onPreviousEpisode}
                  className="p-1 hover:text-rose-400 transition-colors"
                  title="Previous Episode"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={togglePlay}
                className="p-1 hover:text-rose-400 transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              {hasNextEpisode && onNextEpisode && (
                <button
                  onClick={onNextEpisode}
                  className="p-1 hover:text-rose-400 transition-colors"
                  title="Next Episode"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              <div className="flex items-center gap-1.5 group/vol">
                <button onClick={toggleMute} className="p-1 hover:text-rose-400 transition-colors">
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-14 sm:w-20 h-1 rounded-lg bg-white/20 accent-rose-500 cursor-pointer appearance-none"
                />
              </div>

              <div className="text-[11px] text-slate-300 font-mono pl-1">
                <span>{formatTime(currentTime)}</span>
                <span className="text-slate-500 mx-1">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Resolution / Quality Menu */}
              {levels.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold transition-colors"
                    title="Select Resolution"
                  >
                    <SlidersHorizontal className="w-3 h-3 text-rose-400" />
                    <span>{currentLevel === -1 ? 'Auto' : levels[currentLevel]?.label || 'Quality'}</span>
                  </button>
                  {showResolutionMenu && (
                    <div className="absolute right-0 bottom-full mb-2 w-28 rounded-xl bg-[#0e1017] border border-white/10 shadow-xl p-1 z-40">
                      <button
                        onClick={() => {
                          setCurrentLevel(-1);
                          if (hlsRef.current) hlsRef.current.currentLevel = -1;
                          setShowResolutionMenu(false);
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between ${
                          currentLevel === -1 ? 'text-rose-400 font-bold bg-white/5' : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <span>Auto</span>
                        {currentLevel === -1 && <Check className="w-3 h-3 text-rose-400" />}
                      </button>
                      {levels.map((lvl) => (
                        <button
                          key={lvl.id}
                          onClick={() => {
                            setCurrentLevel(lvl.id);
                            if (hlsRef.current) hlsRef.current.currentLevel = lvl.id;
                            setShowResolutionMenu(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between ${
                            currentLevel === lvl.id ? 'text-rose-400 font-bold bg-white/5' : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <span>{lvl.label}</span>
                          {currentLevel === lvl.id && <Check className="w-3 h-3 text-rose-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Subtitles Menu */}
              {subtitleTracks.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
                    className="p-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold transition-colors"
                    title="Select Subtitle Track"
                  >
                    <Subtitles className={`w-3.5 h-3.5 ${currentSubTrack !== -1 ? 'text-rose-400' : 'text-slate-300'}`} />
                  </button>
                  {showSubtitleMenu && (
                    <div className="absolute right-0 bottom-full mb-2 w-32 rounded-xl bg-[#0e1017] border border-white/10 shadow-xl p-1 z-40">
                      <button
                        onClick={() => {
                          setCurrentSubTrack(-1);
                          if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
                          setShowSubtitleMenu(false);
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between ${
                          currentSubTrack === -1 ? 'text-rose-400 font-bold bg-white/5' : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <span>Off</span>
                        {currentSubTrack === -1 && <Check className="w-3 h-3 text-rose-400" />}
                      </button>
                      {subtitleTracks.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => {
                            setCurrentSubTrack(sub.id);
                            if (hlsRef.current) hlsRef.current.subtitleTrack = sub.id;
                            setShowSubtitleMenu(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between ${
                            currentSubTrack === sub.id ? 'text-rose-400 font-bold bg-white/5' : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <span className="truncate">{sub.name}</span>
                          {currentSubTrack === sub.id && <Check className="w-3 h-3 text-rose-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Playback Speed */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold transition-colors"
                >
                  {playbackSpeed}x
                </button>
                {showSpeedMenu && (
                  <div className="absolute right-0 bottom-full mb-2 w-24 rounded-xl bg-[#0e1017] border border-white/10 shadow-xl p-1 z-40">
                    {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSpeedChange(s)}
                        className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between ${
                          playbackSpeed === s ? 'text-rose-400 font-bold bg-white/5' : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <span>{s}x</span>
                        {playbackSpeed === s && <Check className="w-3 h-3 text-rose-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={toggleFullscreen}
                className="p-1 hover:text-rose-400 transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Floating Development Diagnostic Inspector */}
      {showDebugModal && debugInfo && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-md p-6 overflow-y-auto text-left z-50 animate-in fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold">
              <Terminal className="w-4 h-4" />
              <span>[VIDEO DEBUG DIAGNOSTICS]</span>
            </div>
            <button
              onClick={() => setShowDebugModal(false)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white font-mono"
            >
              Close ✕
            </button>
          </div>

          <div className="mt-4 font-mono text-xs text-slate-300 space-y-2">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <p><span className="text-slate-500">Anime:</span> {debugInfo.anime}</p>
              <p><span className="text-slate-500">Episode:</span> {debugInfo.episode}</p>
              <p><span className="text-slate-500">Provider:</span> <span className="text-emerald-400">{debugInfo.provider}</span></p>
              <p><span className="text-slate-500">Source request:</span> {debugInfo.sourceRequest}</p>
              <p><span className="text-slate-500">HTTP status:</span> {debugInfo.httpStatus}</p>
              <p><span className="text-slate-500">Sources returned:</span> {debugInfo.sourcesReturned}</p>
              <p><span className="text-slate-500">Selected source:</span> <span className="text-sky-300 break-all">{debugInfo.selectedSource}</span></p>
              <p><span className="text-slate-500">Type:</span> <span className="uppercase text-amber-300">{debugInfo.type}</span></p>
              <p><span className="text-slate-500">Player state:</span> <span className="text-emerald-400">{playerState}</span></p>
              <p><span className="text-slate-500">Fatal error:</span> <span className="text-rose-400">{debugInfo.fatalError || playerError || 'None'}</span></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
