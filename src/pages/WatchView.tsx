import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimeMedia } from '../types/anime.ts';
import { getAnimeById } from '../services/anilistApi.ts';
import {
  StreamingProviderManager,
  StreamingSourceItem,
  VideoDebugLog,
  AnimePaheAdapterProvider,
} from '../services/streamingProviderAdapter.ts';
import {
  STREAMING_PROVIDERS_REGISTRY,
  getEnabledProviders,
  getProviderById,
  isAllowedEmbedOrigin,
  AudioLanguage,
} from '../services/streamingProvidersRegistry.ts';
import { findTMDBByTitle, TMDBMediaDetails } from '../services/tmdbService.ts';
import { VideoPlayer } from '../components/VideoPlayer.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import {
  ChevronLeft,
  ChevronRight,
  Tv,
  Play,
  Heart,
  Share2,
  ArrowLeft,
  Calendar,
  Star,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Server,
  RefreshCw,
  Info,
  SlidersHorizontal,
  Volume2,
  X,
  ExternalLink,
  Code,
} from 'lucide-react';

interface WatchViewProps {
  animeId: number;
  initialEpisodeNumber?: number;
  onBack?: () => void;
  onSelectAnime: (animeId: number) => void;
  onNavigate?: (tab: string, param?: any) => void;
}

export interface QwishEpisode {
  id: string;
  anime_id: string;
  episode_number: number;
  title: string;
  cloudflare_video_id?: string;
  video_source_url?: string;
  video_source_type?: string;
  video_provider?: string;
  duration?: number;
  thumbnail?: string;
  description?: string;
  is_published?: number;
  status?: 'READY' | 'PROCESSING' | 'ERROR' | 'UNAVAILABLE' | 'UPLOADING';
}

export const WatchView: React.FC<WatchViewProps> = ({
  animeId,
  initialEpisodeNumber = 1,
  onBack,
  onSelectAnime,
  onNavigate,
}) => {
  const { user, favouriteIds, toggleFavourite } = useAuth();

  const [anime, setAnime] = useState<AnimeMedia | null>(null);
  const [tmdbDetails, setTmdbDetails] = useState<TMDBMediaDetails | null>(null);
  const [currentEpisodeNum, setCurrentEpisodeNum] = useState<number>(initialEpisodeNumber);
  const [episodes, setEpisodes] = useState<QwishEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);

  // Streaming Provider & Language Selector State
  const [selectedServer, setSelectedServer] = useState<string>(() => {
    return localStorage.getItem('preferred_stream_provider') || 'vidlink';
  });
  const [selectedLanguage, setSelectedLanguage] = useState<AudioLanguage>(() => {
    return (localStorage.getItem('preferred_audio_lang') as AudioLanguage) || 'sub';
  });
  const [customEmbedInput, setCustomEmbedInput] = useState<string>('');
  const [showCandidateInfo, setShowCandidateInfo] = useState(false);

  // Playback Pipeline State
  const [sources, setSources] = useState<StreamingSourceItem[]>([]);
  const [activeSourceIndex, setActiveSourceIndex] = useState<number>(0);
  const [videoStatus, setVideoStatus] = useState<
    'READY' | 'PROCESSING' | 'ERROR' | 'UNAVAILABLE' | 'UPLOADING' | 'NO_SOURCE'
  >('READY');
  const [videoErrorMessage, setVideoErrorMessage] = useState<string | undefined>(undefined);
  const [debugLog, setDebugLog] = useState<VideoDebugLog | null>(null);
  const [loadingStep, setLoadingStep] = useState<
    'loading_episode' | 'finding_stream' | 'preparing_player' | null
  >('loading_episode');

  const [autoplayNext, setAutoplayNext] = useState(true);
  const [initialSeekTime, setInitialSeekTime] = useState<number>(0);
  const streamAbortControllerRef = useRef<AbortController | null>(null);

  const enabledProviders = useMemo(() => getEnabledProviders(), []);
  const currentProviderConfig = useMemo(() => getProviderById(selectedServer), [selectedServer]);
  const anilistId = useMemo(() => {
    return (anime as any)?.anilist_id || anime?.id || animeId;
  }, [anime, animeId]);

  // Save server & language preferences
  const handleSelectServer = (serverId: string) => {
    setSelectedServer(serverId);
    localStorage.setItem('preferred_stream_provider', serverId);
  };

  const handleSelectLanguage = (lang: AudioLanguage) => {
    setSelectedLanguage(lang);
    localStorage.setItem('preferred_audio_lang', lang);
  };

  // 1. Fetch Anime Metadata from Backend & AniList fallback + TMDB ID
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/anime/${animeId}`)
      .then(async (res) => {
        let animeData: AnimeMedia | null = null;
        if (res.ok) {
          const data = await res.json();
          if (data && data.title) {
            animeData = data as unknown as AnimeMedia;
          }
        }
        if (!animeData) {
          const aniData = await getAnimeById(animeId);
          if (aniData) {
            animeData = aniData as unknown as AnimeMedia;
          }
        }

        if (!cancelled && animeData) {
          setAnime(animeData);

          // Resolve TMDB Metadata asynchronously
          const mainTitle = animeData.title?.english || animeData.title?.romaji || (animeData.title as any)?.userPreferred || '';
          const releaseYear = animeData.seasonYear || animeData.startDate?.year;
          const isMovie = animeData.format === 'MOVIE';

          findTMDBByTitle(mainTitle, releaseYear, isMovie ? 'movie' : 'tv')
            .then((tmdbRes) => {
              if (!cancelled && tmdbRes) {
                setTmdbDetails(tmdbRes);
              }
            })
            .catch(() => {});
        }
      })
      .catch(async () => {
        try {
          const aniData = await getAnimeById(animeId);
          if (!cancelled && aniData) {
            setAnime(aniData as unknown as AnimeMedia);
          }
        } catch (_err) {
          console.warn('[WATCH VIEW] Could not resolve anime metadata for ID:', animeId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [animeId]);

  // 2. Fetch Episodes from Backend
  useEffect(() => {
    let cancelled = false;
    setLoadingEpisodes(true);

    fetch(`/api/anime/${animeId}/episodes`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: QwishEpisode[]) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setEpisodes(list);

        // Fetch watch progress to resume previous playback position
        fetch('/api/watch-progress')
          .then((r) => (r.ok ? r.json() : []))
          .then((progList) => {
            if (Array.isArray(progList)) {
              const match = progList.find((p) => String(p.anime_id) === String(animeId));
              if (match && match.current_time > 10 && match.episode_number === initialEpisodeNumber) {
                setInitialSeekTime(match.current_time);
              }
            }
          })
          .catch(() => {});
      })
      .catch((err) => console.error('[WATCH VIEW] Episodes list error:', err))
      .finally(() => {
        if (!cancelled) setLoadingEpisodes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, initialEpisodeNumber]);

  // 3. Resolve Video Playback for Selected Server & Episode
  const resolveCurrentStream = async (signal?: AbortSignal) => {
    setLoadingStep('loading_episode');
    setVideoErrorMessage(undefined);
    setSources([]);

    const titleStr =
      (anime?.title as any)?.english ||
      (anime?.title as any)?.romaji ||
      (anime?.title as any)?.userPreferred ||
      'Anime Series';

    const malId = (anime as any)?.mal_id || (anime as any)?.idMal || anime?.ids?.mal;
    const isMovie = anime?.format === 'MOVIE';

    try {
      setLoadingStep('finding_stream');

      // Check if current provider uses TMDB / buildUrl
      const providerConfig = getProviderById(selectedServer);

      // Special Handler: AnimePahe via CoorenLabs
      if (selectedServer === 'animepahe') {
        try {
          const paheProvider = new AnimePaheAdapterProvider();
          const res = await paheProvider.getEpisodeSources(String(anilistId), currentEpisodeNum, signal);

          if (signal?.aborted) return;

          if (res.sources && res.sources.length > 0) {
            let filtered = res.sources;

            if (selectedLanguage === 'dub') {
              const dubSources = res.sources.filter(
                (s) => s.language?.toLowerCase().includes('dub') || s.language?.toLowerCase().includes('eng')
              );
              if (dubSources.length === 0) {
                setSources([]);
                setVideoStatus('NO_SOURCE');
                setVideoErrorMessage('AnimePahe does not have an English Dub available for this episode. Please switch to Japanese Sub.');
                setLoadingStep(null);
                return;
              }
              filtered = dubSources;
            } else {
              const subSources = res.sources.filter(
                (s) => !s.language?.toLowerCase().includes('dub') && !s.language?.toLowerCase().includes('eng')
              );
              if (subSources.length > 0) {
                filtered = subSources;
              }
            }

            setSources(filtered);
            setActiveSourceIndex(0);
            setVideoStatus('READY');
            setLoadingStep(null);
            return;
          }
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.warn('[WATCH VIEW] AnimePahe provider error notice:', err.message);
        }

        // Direct animepahe.pw player connection fallback
        const directPaheUrl = `https://animepahe.pw/play/${anilistId}/${currentEpisodeNum}`;
        const kwikFallbackUrl = `https://kwik.cx/e/${anilistId}-${currentEpisodeNum}`;
        const fallbackSources: StreamingSourceItem[] = [
          {
            id: `pahe_direct_${anilistId}_ep${currentEpisodeNum}_1080p_${selectedLanguage}`,
            url: directPaheUrl,
            embedUrl: directPaheUrl,
            type: 'iframe',
            quality: '1080p',
            language: selectedLanguage === 'dub' ? 'English (Dub)' : 'Japanese (Sub)',
            provider: 'AnimePahe (animepahe.pw 1080p)',
            isOfficial: true,
          },
          {
            id: `pahe_kwik_${anilistId}_ep${currentEpisodeNum}_720p_${selectedLanguage}`,
            url: kwikFallbackUrl,
            embedUrl: kwikFallbackUrl,
            type: 'iframe',
            quality: '720p',
            language: selectedLanguage === 'dub' ? 'English (Dub)' : 'Japanese (Sub)',
            provider: 'AnimePahe Kwik (720p)',
            isOfficial: true,
          },
        ];

        setSources(fallbackSources);
        setActiveSourceIndex(0);
        setVideoStatus('READY');
        setLoadingStep(null);
        return;
      }

      // Special Handler: Studio Master (Configured Streams)
      if (selectedServer === 'configured_master') {
        const base = typeof window !== 'undefined' ? '' : 'http://127.0.0.1:3000';
        const res = await fetch(
          `${base}/api/playback/sources/${anilistId}/${currentEpisodeNum}?language=${selectedLanguage}`,
          { signal }
        );

        if (signal?.aborted) return;

        const rawText = await res.text();
        console.log(`[RAW PLAYBACK SOURCES RESPONSE] Endpoint: /api/playback/sources/${anilistId}/${currentEpisodeNum} | Status: ${res.status} | Raw Text:`, rawText);
        let data: any = {};
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          console.error(`[RAW PLAYBACK SOURCES PARSE ERROR]`, e);
        }

        if (res.ok) {
          const rawList = Array.isArray(data) ? data : data.sources || [];
          if (rawList.length > 0) {
            const mappedSources: StreamingSourceItem[] = rawList.map((item: any) => ({
              id: item.id,
              url: item.url,
              embedUrl: item.embedUrl || (item.type === 'iframe' ? item.url : undefined),
              type: item.type === 'iframe' ? 'iframe' : item.type === 'hls' ? 'hls' : 'mp4',
              quality: item.quality || '1080p',
              language: item.language || (selectedLanguage === 'dub' ? 'English (Dub)' : 'Japanese (Sub)'),
              provider: item.provider || 'Studio Master',
              isOfficial: true,
            }));
            setSources(mappedSources);
            setActiveSourceIndex(0);
            setVideoStatus('READY');
            setLoadingStep(null);
            return;
          }
        }

        const epData = episodes.find((e) => e.episode_number === currentEpisodeNum);
        if (epData && (epData as any).video_source_url) {
          const vUrl = (epData as any).video_source_url;
          const vType = (epData as any).video_source_type || (vUrl.includes('.m3u8') ? 'hls' : 'mp4');
          setSources([
            {
              id: `ep_src_${epData.id}`,
              url: vUrl,
              embedUrl: vType === 'iframe' ? vUrl : undefined,
              type: vType,
              quality: '1080p',
              language: (epData as any).language || 'Japanese (Sub)',
              provider: (epData as any).video_provider || 'Studio Master',
              isOfficial: true,
            },
          ]);
          setActiveSourceIndex(0);
          setVideoStatus('READY');
          setLoadingStep(null);
          return;
        }

        setSources([]);
        setVideoStatus('NO_SOURCE');
        setVideoErrorMessage('No Studio Master stream is configured for this episode yet. Choose another server above.');
        setLoadingStep(null);
        return;
      }

      // Handler for Custom Embed (<Embed>)
      if (selectedServer === 'custom_embed') {
        const epData = episodes.find((e) => e.episode_number === currentEpisodeNum);
        const urlToUse = customEmbedInput.trim() || epData?.video_source_url || '';

        if (!urlToUse) {
          setSources([]);
          setVideoStatus('NO_SOURCE');
          setVideoErrorMessage('Please enter a custom embed URL in the input field below.');
          setLoadingStep(null);
          return;
        }

        const sourceItem: StreamingSourceItem = {
          id: `custom_${Date.now()}`,
          url: urlToUse,
          embedUrl: urlToUse,
          type: 'iframe',
          quality: '1080p',
          language: selectedLanguage === 'dub' ? 'English (Dub)' : 'Japanese (Sub)',
          provider: '<Embed> Custom Player',
          isOfficial: true,
        };

        if (signal?.aborted) return;
        setSources([sourceItem]);
        setActiveSourceIndex(0);
        setVideoStatus('READY');
        setLoadingStep(null);
        return;
      }

      // All 14 Free Streaming Servers (TMDB / MAL / AniList Embed Builder)
      let resolvedTmdbId = tmdbDetails?.tmdb_id || (anime as any)?.tmdb_id;

      if (!resolvedTmdbId && providerConfig?.requiredIdType === 'tmdb_id') {
        // Automatically fetch TMDB ID if missing
        const year = anime?.seasonYear || anime?.startDate?.year;
        const fetchedTmdb = await findTMDBByTitle(titleStr, year, isMovie ? 'movie' : 'tv');
        if (fetchedTmdb) {
          resolvedTmdbId = fetchedTmdb.tmdb_id;
          setTmdbDetails(fetchedTmdb);
        }
      }

      if (providerConfig && providerConfig.buildUrl) {
        const embedUrl = providerConfig.buildUrl({
          malId,
          anilistId,
          tmdbId: resolvedTmdbId,
          episodeNumber: currentEpisodeNum,
          language: selectedLanguage,
          season: 1,
          isMovie,
          customEmbedUrl: customEmbedInput,
        });

        if (embedUrl) {
          const sourceItem: StreamingSourceItem = {
            id: `${selectedServer}_${resolvedTmdbId || malId || anilistId}_e${currentEpisodeNum}_${selectedLanguage}`,
            url: embedUrl,
            embedUrl,
            type: 'iframe',
            quality: '1080p',
            language: selectedLanguage === 'dub' ? 'English (Dub)' : 'Japanese (Sub)',
            provider: `${providerConfig.name} (${selectedLanguage.toUpperCase()})`,
            isOfficial: true,
          };

          if (signal?.aborted) return;
          setSources([sourceItem]);
          setActiveSourceIndex(0);
          setVideoStatus('READY');
          setLoadingStep(null);
          return;
        }
      }

      // Fallback
      setSources([]);
      setVideoStatus('NO_SOURCE');
      setVideoErrorMessage(`Could not build stream link for ${providerConfig?.name || 'this server'}. Try switching servers above.`);
      setLoadingStep(null);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[WATCH VIEW] Stream resolution error:', err);
      setSources([]);
      setVideoStatus('ERROR');
      setVideoErrorMessage('Playback error. Please choose another server above.');
      setLoadingStep(null);
    }
  };

  useEffect(() => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;

    if (anime) {
      resolveCurrentStream(controller.signal);
    }

    return () => {
      controller.abort();
    };
  }, [anime, currentEpisodeNum, selectedServer, selectedLanguage, customEmbedInput]);

  const activeSource = sources[activeSourceIndex] || null;

  // Handle fallback source index
  const handleSourceFallback = () => {
    if (sources.length > activeSourceIndex + 1) {
      setActiveSourceIndex((prev) => prev + 1);
    } else {
      setVideoStatus('NO_SOURCE');
      setVideoErrorMessage('Current server stream unavailable. Please switch to another server above.');
    }
  };

  const hasNext = useMemo(() => {
    if (episodes.length > 0) {
      return episodes.some((e) => e.episode_number === currentEpisodeNum + 1);
    }
    const totalEp = anime?.episodes || 24;
    return currentEpisodeNum < totalEp;
  }, [episodes, currentEpisodeNum, anime]);

  const hasPrev = currentEpisodeNum > 1;

  const handleNext = () => {
    if (hasNext) setCurrentEpisodeNum((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (hasPrev) setCurrentEpisodeNum((prev) => prev - 1);
  };

  const handleProgress = (currentTime: number, duration: number) => {
    if (currentTime > 5 && duration > 0) {
      fetch('/api/watch-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anime_id: animeId,
          episode_number: currentEpisodeNum,
          current_time: Math.floor(currentTime),
          duration_seconds: Math.floor(duration),
        }),
      }).catch(() => {});
    }
  };

  const animeTitle =
    (anime?.title as any)?.english ||
    (anime?.title as any)?.romaji ||
    (anime?.title as any)?.userPreferred ||
    'Anime';

  const currentEpData = episodes.find((e) => e.episode_number === currentEpisodeNum);
  const epTitle = currentEpData?.title || `Episode ${currentEpisodeNum}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack || (() => onNavigate?.('anime'))}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Browse</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => toggleFavourite(animeId)}
            className={`p-2 rounded-xl border transition-colors ${
              favouriteIds.has(animeId)
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title="Favorite"
          >
            <Heart className={`w-4 h-4 ${favouriteIds.has(animeId) ? 'fill-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1. VIDEO PLAYER SECTION */}
      <div className="space-y-4">
        <VideoPlayer
          src={activeSource ? activeSource.url : null}
          embedUrl={activeSource?.embedUrl || (activeSource?.type === 'iframe' ? activeSource.url : null)}
          sources={sources}
          activeSourceIndex={activeSourceIndex}
          onSelectSource={(idx) => setActiveSourceIndex(idx)}
          onSourceFallback={handleSourceFallback}
          title={epTitle}
          episodeNumber={currentEpisodeNum}
          animeTitle={animeTitle}
          isDemo={false}
          status={videoStatus}
          errorMessage={videoErrorMessage}
          loadingStep={loadingStep}
          debugInfo={debugLog}
          initialTime={initialSeekTime}
          onProgress={handleProgress}
          onEnded={() => {
            if (autoplayNext && hasNext) {
              handleNext();
            }
          }}
          onNextEpisode={handleNext}
          hasNextEpisode={hasNext}
          onRetry={() => resolveCurrentStream()}
        />

        {/* 2. STREAM SERVERS & AUDIO SELECTOR BAR */}
        <div className="p-4 rounded-2xl bg-[#0e1017] border border-white/5 space-y-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-rose-500" />
                Stream Server ({enabledProviders.length} Available):
              </span>

              {/* Sub / Dub Toggle */}
              <div className="flex items-center rounded-xl bg-black/40 border border-white/10 p-0.5">
                <button
                  onClick={() => handleSelectLanguage('sub')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedLanguage === 'sub'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SUB
                </button>
                <button
                  onClick={() => handleSelectLanguage('dub')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedLanguage === 'dub'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  DUB
                </button>
              </div>
            </div>

            {/* Server Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {enabledProviders.map((provider) => {
                const isSelected = selectedServer === provider.id;
                return (
                  <button
                    key={provider.id}
                    onClick={() => handleSelectServer(provider.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/40 ring-1 ring-rose-400/50'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <span>{provider.name}</span>
                    {provider.badge && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-black/40 text-rose-200' : 'bg-black/30 text-slate-400'
                        }`}
                      >
                        {provider.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Embed Input if <Embed> is selected */}
            {selectedServer === 'custom_embed' && (
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Paste direct embed or iframe URL..."
                  value={customEmbedInput}
                  onChange={(e) => setCustomEmbedInput(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={() => resolveCurrentStream()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors"
                >
                  Load Frame
                </button>
              </div>
            )}
          </div>

          {/* Active Server Info Note */}
          {currentProviderConfig && (
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-white/5 flex-wrap gap-2">
              <span className="flex items-center gap-2">
                <span>{currentProviderConfig.notes || `Streaming via ${currentProviderConfig.name}`}</span>
                {selectedServer === 'animepahe' && (
                  <a
                    href={`https://animepahe.pw/play/${anilistId}/${currentEpisodeNum}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 underline font-bold"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span>animepahe.pw</span>
                  </a>
                )}
              </span>
              <span className="text-emerald-400 font-bold">
                ● Connected ({selectedLanguage.toUpperCase()})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Episode Selection Bar & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">{animeTitle}</h2>
                <p className="text-xs text-rose-400 font-semibold">{epTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrev}
                  disabled={!hasPrev}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNext}
                  disabled={!hasNext}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Synopsis */}
            {anime?.description && (
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                {anime.description.replace(/<[^>]*>/g, '')}
              </p>
            )}
          </div>
        </div>

        {/* Episode Selector Box */}
        <div className="p-4 rounded-2xl bg-[#0e1017] border border-white/5 space-y-3 h-fit">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Tv className="w-3.5 h-3.5 text-rose-500" />
            <span>Select Episode</span>
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
            {Array.from({ length: anime?.episodes || episodes.length || 24 }).map((_, idx) => {
              const epNum = idx + 1;
              const isActive = epNum === currentEpisodeNum;
              return (
                <button
                  key={epNum}
                  onClick={() => setCurrentEpisodeNum(epNum)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5'
                  }`}
                >
                  Ep {epNum}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
