import React, { useState, useEffect } from 'react';
import {
  Film,
  Video,
  PlusCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Database,
  Search,
  Check,
  RefreshCw,
  Tv,
  Sparkles,
  X,
  Loader2,
  ExternalLink,
  Play,
  Activity,
  Layers,
  Globe,
  Radio,
  FileVideo,
  Code
} from 'lucide-react';
import { auth } from '../services/firebase.ts';
import { PosterImage } from './PosterImage.tsx';
import {
  searchCoorenAnimePahe,
  fetchCoorenAnimePaheEpisodes,
  fetchCoorenAnimePaheStreams,
} from '../services/coorenAnimePaheService.ts';

export interface VideoLibraryAnime {
  id: string;
  anilist_id: number;
  title: string;
  title_english?: string;
  cover_image?: string;
  episodes?: number;
}

export type StreamProviderOption =
  | 'vcdn'
  | 'media_cm'
  | 'cloudflare_stream'
  | 'animepahe'
  | 'toonstream'
  | 'external_embed'
  | 'direct_hls'
  | 'direct_mp4'
  | 'custom_provider';

export interface PlaybackSourceItem {
  id: string;
  anime_id: number;
  episode_number: number;
  season_number: number;
  language: 'sub' | 'dub';
  provider: string;
  provider_video_id?: string;
  embed_url?: string;
  playback_url?: string;
  quality?: string;
  is_published: boolean | number;
  processing_status: 'processing' | 'ready' | 'failed';
  is_primary: boolean | number;
  title?: string;
  created_at: string;
}

interface VideoLibraryManagerProps {
  onNavigateToImport?: () => void;
  initialAnimeId?: string | number;
}

export const VideoLibraryManager: React.FC<VideoLibraryManagerProps> = ({ onNavigateToImport, initialAnimeId }) => {
  const [animeList, setAnimeList] = useState<VideoLibraryAnime[]>([]);
  const [loadingAnime, setLoadingAnime] = useState(false);
  const [selectedAnimeId, setSelectedAnimeId] = useState<string>(initialAnimeId ? String(initialAnimeId) : '');
  const [searchFilter, setSearchFilter] = useState('');

  const [episodesList, setEpisodesList] = useState<any[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(1);

  const [sourcesList, setSourcesList] = useState<PlaybackSourceItem[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  // Form states for adding/editing a source
  const [provider, setProvider] = useState<StreamProviderOption>('vcdn');
  const [providerVideoId, setProviderVideoId] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [directMediaUrl, setDirectMediaUrl] = useState('');
  const [customProviderName, setCustomProviderName] = useState('');
  const [language, setLanguage] = useState<'sub' | 'dub'>('sub');
  const [quality, setQuality] = useState('1080p');
  const [isPrimary, setIsPrimary] = useState(true);
  const [isPublished, setIsPublished] = useState(true);
  const [sourceTitle, setSourceTitle] = useState('');
  const [savingSource, setSavingSource] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [supabaseStatus, setSupabaseStatus] = useState<any>(null);

  // CoorenLabs Diagnostics & Search State
  const [coorenHealth, setCoorenHealth] = useState<any>(null);
  const [checkingCoorenHealth, setCheckingCoorenHealth] = useState(false);
  const [coorenSearchQuery, setCoorenSearchQuery] = useState('');
  const [coorenSearchResults, setCoorenSearchResults] = useState<any[]>([]);
  const [searchingCooren, setSearchingCooren] = useState(false);
  const [coorenEpisodes, setCoorenEpisodes] = useState<any[]>([]);
  const [loadingCoorenEpisodes, setLoadingCoorenEpisodes] = useState(false);
  const [selectedCoorenAnime, setSelectedCoorenAnime] = useState<any>(null);
  const [resolvingCoorenStream, setResolvingCoorenStream] = useState(false);
  const [showCoorenTools, setShowCoorenTools] = useState(false);
  const [configuredApiUrlInput, setConfiguredApiUrlInput] = useState('');
  const [savingApiConfig, setSavingApiConfig] = useState(false);
  const [showDeploymentGuide, setShowDeploymentGuide] = useState(false);

  // Preview Player State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState<'iframe' | 'hls' | 'mp4'>('iframe');
  const [previewTitle, setPreviewTitle] = useState('');
  const [iframeLoadError, setIframeLoadError] = useState(false);

  // Quick AniList Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSearchQuery, setImportSearchQuery] = useState('');
  const [importSearchResults, setImportSearchResults] = useState<any[]>([]);
  const [isSearchingAniList, setIsSearchingAniList] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Helper to ensure authenticated admin headers
  const getAdminHeaders = async (): Promise<HeadersInit> => {
    let token =
      localStorage.getItem('kuronami_admin_token') ||
      localStorage.getItem('kuronami_auth_token') ||
      localStorage.getItem('qwish_admin_token') ||
      '';

    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        if (idToken) token = idToken;
      } catch {}
    }

    if (!token) {
      token = 'usr_admin_001';
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const loadAnimeCatalog = async () => {
    setLoadingAnime(true);
    try {
      const res = await fetch('/api/kuronami/anime');
      const data = res.ok ? await res.json() : [];
      setAnimeList(data);
      if (data.length > 0) {
        if (initialAnimeId && data.some((a: any) => String(a.id) === String(initialAnimeId))) {
          setSelectedAnimeId(String(initialAnimeId));
        } else if (!selectedAnimeId || !data.some((a: any) => String(a.id) === String(selectedAnimeId))) {
          setSelectedAnimeId(String(data[0].id));
        }
      } else {
        setSelectedAnimeId('');
      }
    } catch (err) {
      console.error('Failed to load anime list:', err);
    } finally {
      setLoadingAnime(false);
    }
  };

  // Check CoorenLabs health
  const refreshCoorenHealth = async () => {
    setCheckingCoorenHealth(true);
    try {
      const res = await fetch('/api/cooren/health');
      const data = res.ok ? await res.json() : null;
      setCoorenHealth(data);
    } catch {
      setCoorenHealth({ configured: false, reachable: false, message: 'Health probe failed' });
    } finally {
      setCheckingCoorenHealth(false);
    }
  };

  // Load anime list & diagnostics on mount
  useEffect(() => {
    loadAnimeCatalog();
    refreshCoorenHealth();

    // Check Supabase diagnostics
    fetch('/api/admin/database/diagnostics')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.supabase) {
          setSupabaseStatus(data.supabase);
        }
      })
      .catch(() => {});
  }, []);

  // Sync initialAnimeId prop when changed
  useEffect(() => {
    if (initialAnimeId) {
      setSelectedAnimeId(String(initialAnimeId));
    }
  }, [initialAnimeId]);

  // Load episodes when selectedAnimeId changes
  useEffect(() => {
    if (!selectedAnimeId) {
      setEpisodesList([]);
      return;
    }
    setLoadingEpisodes(true);
    fetch(`/api/admin/episodes/${selectedAnimeId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setEpisodesList(Array.isArray(data) ? data : []);
        if (data && data.length > 0) {
          setSelectedEpisodeNum(data[0].episode_number || 1);
        } else {
          setSelectedEpisodeNum(1);
        }
      })
      .catch(() => setEpisodesList([]))
      .finally(() => setLoadingEpisodes(false));
  }, [selectedAnimeId]);

  // Load playback sources when anime or episode changes
  const loadSources = async (animeId: string, epNum: number) => {
    if (!animeId || !epNum) return;
    setLoadingSources(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/playback/sources/${animeId}/${epNum}`, { headers });
      const data = res.ok ? await res.json() : [];
      setSourcesList(Array.isArray(data) ? data : []);
    } catch {
      setSourcesList([]);
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    if (selectedAnimeId && selectedEpisodeNum) {
      loadSources(selectedAnimeId, selectedEpisodeNum);
    }
  }, [selectedAnimeId, selectedEpisodeNum]);

  // Save & Verify CoorenLabs Deployed URL
  const handleSaveCoorenConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuredApiUrlInput.trim()) return;

    setSavingApiConfig(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/cooren/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: configuredApiUrlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify Cooren API URL');

      showFeedback(data.message || 'Cooren API verified and configured successfully!');
      setConfiguredApiUrlInput('');
      await refreshCoorenHealth();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setSavingApiConfig(false);
    }
  };

  const handleResetCoorenConfig = async () => {
    if (!confirm('Reset CoorenLabs API URL configuration?')) return;
    try {
      const headers = await getAdminHeaders();
      await fetch('/api/admin/cooren/config', { method: 'DELETE', headers });
      showFeedback('CoorenLabs API configuration reset.');
      await refreshCoorenHealth();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  // Handle Search on CoorenLabs (AnimePahe or ToonStream)
  const handleCoorenSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!coorenSearchQuery.trim()) return;

    setSearchingCooren(true);
    setCoorenSearchResults([]);
    setSelectedCoorenAnime(null);
    setCoorenEpisodes([]);

    try {
      if (provider === 'animepahe') {
        const res = await searchCoorenAnimePahe(coorenSearchQuery.trim());
        if (res.error) throw new Error(res.error);
        setCoorenSearchResults(res.results || []);
      } else {
        // Default to ToonStream
        const res = await fetch(`/api/cooren/toonstream/search/${encodeURIComponent(coorenSearchQuery.trim())}/1`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'ToonStream search error');
        const items = data.data?.data || data.results || [];
        setCoorenSearchResults(Array.isArray(items) ? items : []);
      }
    } catch (err: any) {
      showFeedback(err.message || 'Cooren provider search failed', 'error');
    } finally {
      setSearchingCooren(false);
    }
  };

  // Select a Cooren Anime to fetch its episodes
  const handleSelectCoorenAnime = async (anime: any) => {
    setSelectedCoorenAnime(anime);
    setLoadingCoorenEpisodes(true);
    setCoorenEpisodes([]);

    try {
      if (provider === 'animepahe') {
        const animeSession = anime.session || anime.id;
        const res = await fetchCoorenAnimePaheEpisodes(animeSession);
        if (res.error) throw new Error(res.error);
        setCoorenEpisodes(res.episodes || []);
      } else {
        const slug = anime.slug || anime.id;
        const res = await fetch(`/api/cooren/toonstream/series/info/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load ToonStream series info');
        const eps = data.data?.episodes || data.episodes || [];
        setCoorenEpisodes(Array.isArray(eps) ? eps : []);
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setLoadingCoorenEpisodes(false);
    }
  };

  // Resolve stream from a Cooren Episode
  const handleResolveCoorenEpisode = async (episodeItem: any) => {
    setResolvingCoorenStream(true);
    try {
      if (provider === 'animepahe') {
        const animeSession = selectedCoorenAnime?.session || selectedCoorenAnime?.id;
        const epSession = episodeItem.session;
        const res = await fetchCoorenAnimePaheStreams(animeSession, epSession);
        if (res.error) throw new Error(res.error);

        const variants = res.streams || [];
        if (variants.length > 0) {
          const first = variants[0];
          setEmbedUrl(first.url || first.directUrl || '');
          setDirectMediaUrl(first.directUrl || first.proxiedUrl || '');
          setProviderVideoId(epSession);
          setQuality(first.quality || '1080p');
          setLanguage(first.audio === 'dub' ? 'dub' : 'sub');
          setSourceTitle(`AnimePahe Ep ${episodeItem.episode} [${first.quality || '1080p'}] (${(first.audio || 'jpn').toUpperCase()})`);
          showFeedback(`Resolved stream from AnimePahe for Episode ${episodeItem.episode}!`);
        } else {
          showFeedback('No stream variants returned by AnimePahe for this episode.', 'error');
        }
      } else {
        const slug = selectedCoorenAnime?.slug || selectedCoorenAnime?.id;
        const epNum = episodeItem.episode || episodeItem.episode_number || selectedEpisodeNum;
        const res = await fetch(`/api/cooren/toonstream/episode/sources/${encodeURIComponent(slug)}?season=1&episode=${epNum}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to resolve ToonStream sources');

        const sources = data.data?.sources || data.sources || [];
        if (sources.length > 0) {
          const s = sources[0];
          setEmbedUrl(s.url || s.embed_url || '');
          setDirectMediaUrl(s.playback_url || '');
          setSourceTitle(`ToonStream Ep ${epNum}`);
          showFeedback(`Resolved ToonStream source for Episode ${epNum}!`);
        } else {
          showFeedback('No sources returned for this ToonStream episode.', 'error');
        }
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setResolvingCoorenStream(false);
    }
  };

  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnimeId) {
      showFeedback('Please select or import an anime first.', 'error');
      return;
    }

    setSavingSource(true);
    try {
      let finalEmbedUrl = embedUrl.trim();
      let finalPlaybackUrl = directMediaUrl.trim();
      let finalVideoId = providerVideoId.trim();

      // Normalize based on provider
      if (provider === 'direct_hls' || provider === 'direct_mp4') {
        finalPlaybackUrl = directMediaUrl.trim() || embedUrl.trim();
        finalEmbedUrl = '';
      } else if (provider === 'external_embed' || provider === 'custom_provider') {
        finalEmbedUrl = embedUrl.trim();
      }

      const payload = {
        anime_id: parseInt(selectedAnimeId, 10),
        episode_number: selectedEpisodeNum,
        season_number: 1,
        provider,
        provider_video_id: finalVideoId,
        embed_url: finalEmbedUrl,
        playback_url: finalPlaybackUrl,
        language,
        quality,
        is_published: isPublished,
        is_primary: isPrimary,
        title:
          sourceTitle.trim() ||
          (customProviderName ? `${customProviderName} Ep ${selectedEpisodeNum}` : `Episode ${selectedEpisodeNum} (${provider.toUpperCase()})`),
      };

      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/playback/sources', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save playback source');

      showFeedback(`Successfully mapped ${provider.toUpperCase()} source for Episode #${selectedEpisodeNum}!`);
      loadSources(selectedAnimeId, selectedEpisodeNum);

      // Reset form fields
      setProviderVideoId('');
      setEmbedUrl('');
      setDirectMediaUrl('');
      setSourceTitle('');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to save source', 'error');
    } finally {
      setSavingSource(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this playback source?')) return;
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/playback/sources/${sourceId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Failed to delete source');
      showFeedback('Playback source removed.');
      loadSources(selectedAnimeId, selectedEpisodeNum);
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  const handleSetPrimary = async (sourceId: string) => {
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/playback/sources/${sourceId}/set-primary`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('Failed to update primary source');
      showFeedback('Primary stream source updated.');
      loadSources(selectedAnimeId, selectedEpisodeNum);
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  const openPreview = (url: string, type: 'iframe' | 'hls' | 'mp4', titleText: string) => {
    setPreviewUrl(url);
    setPreviewType(type);
    setPreviewTitle(titleText);
    setIframeLoadError(false);
    setPreviewModalOpen(true);
  };

  // Quick AniList Search in modal
  const handleQuickAniListSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importSearchQuery.trim()) return;

    setIsSearchingAniList(true);
    try {
      const query = `
        query ($search: String) {
          Page(page: 1, perPage: 8) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
              id
              title { english romaji }
              coverImage { large extraLarge }
              format
              episodes
            }
          }
        }
      `;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { search: importSearchQuery.trim() } }),
      });
      const json = await res.json();
      setImportSearchResults(json?.data?.Page?.media || []);
    } catch {
      showFeedback('AniList search failed.', 'error');
    } finally {
      setIsSearchingAniList(false);
    }
  };

  const handlePerformQuickImport = async (item: any) => {
    setImportingId(item.id);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/anime/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ anilistId: item.id, forceUpdate: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      showFeedback(`"${item.title?.english || item.title?.romaji}" imported into KURO NAMI!`);
      await loadAnimeCatalog();
      setSelectedAnimeId(String(item.id));
      setIsImportModalOpen(false);
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setImportingId(null);
    }
  };

  const selectedAnime = animeList.find((a) => String(a.id) === String(selectedAnimeId));

  const filteredAnimeList = animeList.filter((a) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      (a.title_english && a.title_english.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[#0e1017] border border-white/10 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-rose-400 text-xs font-mono font-bold uppercase tracking-widest mb-1">
            <Film className="w-4 h-4" /> Multi-Provider Stream & Source Management
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Stream Source Manager & Embed Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Configure streams across VCDN, media.cm, Cloudflare Stream, AnimePahe, ToonStream, direct HLS/MP4, and custom iframe embeds.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow-lg shadow-rose-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            + Import Anime
          </button>

          {/* CoorenLabs Health Badge */}
          <div
            onClick={() => setShowCoorenTools(!showCoorenTools)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 cursor-pointer hover:border-rose-500/30 transition-colors"
            title="Click to toggle CoorenLabs Provider Tools"
          >
            <Activity className={`w-4 h-4 ${coorenHealth?.reachable ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <div className="text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Cooren API</span>
              <span className="font-mono font-bold text-[11px] text-white">
                {coorenHealth?.reachable ? (coorenHealth.isLocalDevServer ? 'Local Dev Active' : 'Online & Connected') : 'Needs Setup'}
              </span>
            </div>
          </div>

          {/* Supabase Sync Badge */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 shrink-0">
            <Database className="w-4 h-4 text-emerald-400" />
            <div className="text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Storage</span>
              <span className="font-mono font-bold text-[11px] text-emerald-400">
                {supabaseStatus?.status === 'connected' ? 'Synced (Supabase)' : 'Dual-Store'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-mono flex items-center gap-3 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* CoorenLabs Live Provider Tool Drawer */}
      {showCoorenTools && (
        <div className="p-6 rounded-2xl bg-[#0b0d13] border border-rose-500/30 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                CoorenLabs Official Integration Drawer
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                Truth Mode
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              {coorenHealth?.baseUrl && (
                <a
                  href={`${coorenHealth.baseUrl}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white flex items-center gap-1 underline text-[11px]"
                >
                  Open /docs <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={refreshCoorenHealth}
                disabled={checkingCoorenHealth}
                className="p-1 text-slate-400 hover:text-white"
                title="Refresh health"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingCoorenHealth ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowCoorenTools(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs font-mono text-slate-300 space-y-1">
            <p><span className="text-slate-500">Status:</span> {coorenHealth?.message || 'Checking...'}</p>
            <p><span className="text-slate-500">Target Base URL:</span> <code className="text-rose-400">{coorenHealth?.baseUrl || 'COOREN_API_BASE_URL (not set)'}</code></p>
            <p className="text-[11px] text-slate-400">
              Supported routes: <code className="text-slate-300">GET /anime/animepahe/search/:q</code>, <code className="text-slate-300">GET /anime/animepahe/episode/:id/:session (NDJSON)</code>, <code className="text-slate-300">GET /anime/toonstream/home</code>, <code className="text-slate-300">GET /anime/toonstream/search/:q/:p</code>.
            </p>
          </div>

          {/* Configure Deployed CoorenLabs API URL */}
          <div className="p-4 rounded-xl bg-black/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-rose-500" />
                  Configure Deployed CoorenLabs API URL
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Deploy CoorenLabs to Render, Railway, Cloud Run, or VPS and configure its verified public HTTPS URL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeploymentGuide(!showDeploymentGuide)}
                className="text-[11px] font-mono text-rose-400 hover:text-rose-300 underline"
              >
                {showDeploymentGuide ? 'Hide Guide' : 'Deployment Guide'}
              </button>
            </div>

            <form onSubmit={handleSaveCoorenConfig} className="flex gap-2">
              <input
                type="url"
                value={configuredApiUrlInput}
                onChange={(e) => setConfiguredApiUrlInput(e.target.value)}
                placeholder="https://YOUR-DEPLOYED-COOREN-DOMAIN (e.g. https://cooren-api.yourdomain.com)"
                className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
              />
              <button
                type="submit"
                disabled={savingApiConfig || !configuredApiUrlInput.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingApiConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Verify & Connect URL
              </button>
              {coorenHealth?.baseUrl && (
                <button
                  type="button"
                  onClick={handleResetCoorenConfig}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-xs font-mono transition-colors shrink-0"
                  title="Reset custom URL"
                >
                  Reset
                </button>
              )}
            </form>

            {/* Deployment Guide Details */}
            {showDeploymentGuide && (
              <div className="p-4 rounded-xl bg-black/80 border border-white/10 space-y-3 text-xs text-slate-300 font-mono">
                <div className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5 text-rose-400">
                  <Code className="w-3.5 h-3.5" />
                  Official Deployment Instructions (CoorenLabs)
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed text-[11px]">
                  <li>
                    <strong>Repository:</strong> Official repository is available at <code className="text-rose-300">https://github.com/CoorenLabs/CoorenLabs</code> (pre-cached in <code className="text-rose-300">/cooren-api</code>).
                  </li>
                  <li>
                    <strong>Docker Deployment:</strong> Use the official Dockerfile (provided in <code className="text-rose-300">/cooren-api/Dockerfile</code>), which includes Chromium and Xvfb for Cloudflare solver support.
                  </li>
                  <li>
                    <strong>Required Environment Variables:</strong>
                    <div className="mt-1 pl-4 space-y-0.5 text-slate-400">
                      <div>• <code className="text-emerald-300">SERVER_ORIGIN=https://YOUR-PUBLIC-DOMAIN</code> (Required for proxied streams)</div>
                      <div>• <code className="text-emerald-300">PORT=3000</code></div>
                      <div>• <code className="text-emerald-300">NODE_ENV=production</code></div>
                      <div>• <code className="text-emerald-300">CHROME_PATH=/usr/bin/chromium</code></div>
                    </div>
                  </li>
                  <li>
                    <strong>Deploy to:</strong> Render, Railway, Fly.io, Google Cloud Run, or any VPS with port 3000 mapped.
                  </li>
                  <li>
                    <strong>Verification:</strong> Ensure <code className="text-rose-300">https://YOUR-PUBLIC-DOMAIN/docs</code> returns HTTP 200 before entering the URL above.
                  </li>
                </ol>
              </div>
            )}
          </div>

          {/* Real Provider Search Bar */}
          <form onSubmit={handleCoorenSearch} className="flex gap-2">
            <input
              type="text"
              value={coorenSearchQuery}
              onChange={(e) => setCoorenSearchQuery(e.target.value)}
              placeholder={`Search ${provider === 'animepahe' ? 'AnimePahe' : 'ToonStream'} (e.g. Frieren, Solo Leveling, Bleach)...`}
              className="flex-1 rounded-xl bg-black/50 border border-white/10 px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <button
              type="submit"
              disabled={searchingCooren || !coorenSearchQuery.trim()}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5"
            >
              {searchingCooren ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Search {provider === 'animepahe' ? 'AnimePahe' : 'ToonStream'}
            </button>
          </form>

          {/* Cooren Search Results */}
          {coorenSearchResults.length > 0 && !selectedCoorenAnime && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {coorenSearchResults.map((item, idx) => {
                const title = item.title || item.name || 'Untitled';
                const poster = item.poster || item.image || item.snapshot;
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectCoorenAnime(item)}
                    className="p-3 rounded-xl bg-black/40 border border-white/5 hover:border-rose-500/50 cursor-pointer transition-all flex gap-3 items-center"
                  >
                    {poster && (
                      <img src={poster} alt={title} className="w-10 h-14 object-cover rounded bg-slate-900 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white truncate">{title}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {item.type || 'Anime'} {item.episodes ? `• ${item.episodes} eps` : ''}
                      </p>
                      <span className="text-[10px] text-rose-400 font-bold mt-1 inline-block">
                        Select Anime →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Cooren Anime Episodes */}
          {selectedCoorenAnime && (
            <div className="space-y-3 p-4 rounded-xl bg-black/60 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    Selected: {selectedCoorenAnime.title || selectedCoorenAnime.name}
                  </span>
                  <button
                    onClick={() => setSelectedCoorenAnime(null)}
                    className="text-[10px] text-rose-400 underline font-mono"
                  >
                    Change
                  </button>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {coorenEpisodes.length} episodes found
                </span>
              </div>

              {loadingCoorenEpisodes ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  Fetching episodes from provider...
                </div>
              ) : coorenEpisodes.length === 0 ? (
                <p className="text-xs text-slate-500">No episodes returned for this anime.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {coorenEpisodes.slice(0, 30).map((ep, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={resolvingCoorenStream}
                      onClick={() => handleResolveCoorenEpisode(ep)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-rose-600 hover:text-white border border-white/10 text-xs font-mono text-slate-300 shrink-0 transition-all flex items-center gap-1"
                    >
                      <span>Ep {ep.episode || ep.episode_number || idx + 1}</span>
                      <Play className="w-2.5 h-2.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Left (Anime selector & episodes), Right (Source Mapping Form & Active Sources) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Anime Selection & Episode List */}
        <div className="lg:col-span-5 space-y-4">
          {/* Anime Search & Select */}
          <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Tv className="w-4 h-4 text-rose-500" /> 1. Select Anime Record
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                {animeList.length} anime indexed
              </span>
            </div>

            {animeList.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search anime database..."
                  className="w-full rounded-xl bg-black/50 border border-white/10 pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>
            )}

            {loadingAnime ? (
              <div className="h-40 rounded-xl bg-white/5 animate-pulse" />
            ) : animeList.length === 0 ? (
              <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
                  <Tv className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white">Database is Empty</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Import anime metadata from AniList to begin mapping video streams.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToImport) {
                      onNavigateToImport();
                    } else {
                      setIsImportModalOpen(true);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow-lg shadow-rose-600/20"
                >
                  <PlusCircle className="w-4 h-4" />
                  Import from AniList
                </button>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {filteredAnimeList.map((a) => {
                  const isSelected = String(a.id) === String(selectedAnimeId);
                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAnimeId(String(a.id))}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'bg-rose-600/15 border-rose-500 shadow-md'
                          : 'bg-black/30 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="w-10 h-14 rounded-lg bg-black/60 overflow-hidden shrink-0">
                        <PosterImage src={a.cover_image} alt={a.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white truncate">{a.title}</h4>
                        {a.title_english && a.title_english !== a.title && (
                          <p className="text-[10px] text-slate-400 truncate">{a.title_english}</p>
                        )}
                        <p className="text-[10px] text-rose-400 font-mono mt-0.5">
                          ID: {a.id} • AniList #{a.anilist_id}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Episode Selector */}
          {selectedAnime && (
            <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/10 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-rose-500" /> 2. Select Episode
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  {episodesList.length} configured
                </span>
              </div>

              {loadingEpisodes ? (
                <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
              ) : episodesList.length === 0 ? (
                <p className="text-xs text-slate-500">No episodes created yet for this anime.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {episodesList.map((ep) => {
                    const isSelected = ep.episode_number === selectedEpisodeNum;
                    return (
                      <button
                        key={ep.id}
                        onClick={() => setSelectedEpisodeNum(ep.episode_number)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold shrink-0 transition-all ${
                          isSelected
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                            : 'bg-black/40 border border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        Ep {ep.episode_number}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Source Mapping Form & Active Sources */}
        <div className="lg:col-span-7 space-y-6">
          {/* Stream Source Form */}
          <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/10 space-y-5 shadow-xl">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-rose-500" />
                Map Stream Source
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Attach a playback stream to {selectedAnime ? selectedAnime.title : 'selected anime'} (Episode #{selectedEpisodeNum})
              </p>
            </div>

            <form onSubmit={handleSaveSource} className="space-y-4">
              {/* Provider Selection Tabs */}
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-2 uppercase font-bold">
                  Select Provider Type
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'vcdn', label: 'VCDN', desc: 'Embed & HLS' },
                    { key: 'media_cm', label: 'Media.cm', desc: 'Mirror Embed' },
                    { key: 'cloudflare_stream', label: 'Cloudflare', desc: 'Direct Stream UID' },
                    { key: 'animepahe', label: 'AnimePahe', desc: 'CoorenLabs NDJSON' },
                    { key: 'toonstream', label: 'ToonStream', desc: 'CoorenLabs Stream' },
                    { key: 'external_embed', label: 'External Embed', desc: '16:9 Iframe' },
                    { key: 'direct_hls', label: 'Direct HLS', desc: '.m3u8 Playlist' },
                    { key: 'direct_mp4', label: 'Direct MP4', desc: 'Native Video' },
                    { key: 'custom_provider', label: 'Custom', desc: 'Third-Party' },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setProvider(p.key as any);
                        if (p.key === 'animepahe' || p.key === 'toonstream') {
                          setShowCoorenTools(true);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        provider === p.key
                          ? 'bg-rose-500/15 border-rose-500 text-white font-bold'
                          : 'bg-black/40 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-[11px] font-black uppercase truncate">{p.label}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 truncate">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider-specific inputs */}
              {provider === 'vcdn' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1">
                      VCDN Video ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={providerVideoId}
                      onChange={(e) => setProviderVideoId(e.target.value)}
                      placeholder="e.g. vc_abc123 or paste embed/video ID"
                      required={!embedUrl}
                      className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1">
                      Direct Embed URL (Optional override)
                    </label>
                    <input
                      type="url"
                      value={embedUrl}
                      onChange={(e) => setEmbedUrl(e.target.value)}
                      placeholder="https://embed.vcdn.me/v/..."
                      className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                    />
                  </div>
                </div>
              )}

              {provider === 'media_cm' && (
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Media.cm Embed URL or Video Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={embedUrl || providerVideoId}
                    onChange={(e) => {
                      setEmbedUrl(e.target.value);
                      setProviderVideoId(e.target.value);
                    }}
                    placeholder="https://media.cm/embed/xyz... or xyz123"
                    required
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              )}

              {provider === 'cloudflare_stream' && (
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Cloudflare Stream UID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={providerVideoId}
                    onChange={(e) => setProviderVideoId(e.target.value)}
                    placeholder="e.g. d1a2f3c4e5b6..."
                    required
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              )}

              {(provider === 'animepahe' || provider === 'toonstream') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-300">
                      CoorenLabs Stream or Embed URL <span className="text-rose-500">*</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCoorenTools(true)}
                      className="text-rose-400 hover:text-rose-300 text-[11px] font-mono flex items-center gap-1"
                    >
                      <Search className="w-3 h-3" /> Auto-resolve via Drawer
                    </button>
                  </div>
                  <input
                    type="text"
                    value={embedUrl || directMediaUrl}
                    onChange={(e) => {
                      setEmbedUrl(e.target.value);
                      if (e.target.value.includes('.m3u8')) setDirectMediaUrl(e.target.value);
                    }}
                    placeholder={provider === 'animepahe' ? 'https://kwik.cx/e/... or direct stream' : 'https://... or direct embed'}
                    required
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              )}

              {provider === 'external_embed' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1">
                      Authorized Embed URL <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={embedUrl}
                      onChange={(e) => setEmbedUrl(e.target.value)}
                      placeholder="https://player.provider.com/embed/..."
                      required
                      className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Will be embedded in a responsive 16:9 player with strict sandbox security controls.
                    </p>
                  </div>
                </div>
              )}

              {(provider === 'direct_hls' || provider === 'direct_mp4') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1">
                      Direct Media Stream URL <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={directMediaUrl}
                      onChange={(e) => setDirectMediaUrl(e.target.value)}
                      placeholder={provider === 'direct_hls' ? 'https://.../video.m3u8' : 'https://.../video.mp4'}
                      required
                      className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Validated for SSRF protection and parsed by {provider === 'direct_hls' ? 'HLS.js player' : 'HTML5 video element'}.
                    </p>
                  </div>
                </div>
              )}

              {provider === 'custom_provider' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono text-slate-300 mb-1">Provider Name</label>
                      <input
                        type="text"
                        value={customProviderName}
                        onChange={(e) => setCustomProviderName(e.target.value)}
                        placeholder="e.g. MyAnimeStream"
                        className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-slate-300 mb-1">Stream/Embed URL</label>
                      <input
                        type="text"
                        value={embedUrl || directMediaUrl}
                        onChange={(e) => {
                          setEmbedUrl(e.target.value);
                          setDirectMediaUrl(e.target.value);
                        }}
                        placeholder="https://..."
                        required
                        className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Title, Language, Quality */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as any)}
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="sub">Japanese (Sub)</option>
                    <option value="dub">English (Dub)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Resolution</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                  >
                    <option value="1080p">1080p FHD</option>
                    <option value="720p">720p HD</option>
                    <option value="480p">480p SD</option>
                    <option value="auto">Auto Adaptive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Source Title</label>
                  <input
                    type="text"
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                    placeholder="e.g. Official Server 1"
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 pt-1 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    className="rounded bg-black/50 border-white/10 text-rose-600 focus:ring-0"
                  />
                  <span>Primary Stream</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="rounded bg-black/50 border-white/10 text-rose-600 focus:ring-0"
                  />
                  <span>Publish Immediately</span>
                </label>

                {(embedUrl || directMediaUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = directMediaUrl || embedUrl;
                      const type = url.includes('.m3u8') ? 'hls' : url.match(/\.(mp4|webm)($|\?)/i) ? 'mp4' : 'iframe';
                      openPreview(url, type, `Preview: Episode ${selectedEpisodeNum}`);
                    }}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3 h-3 text-rose-400" />
                    Preview Player
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={savingSource || !selectedAnimeId}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
              >
                {savingSource ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving Stream Source...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save & Persist Stream Source
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Configured Sources for this Episode */}
          <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Video className="w-4 h-4 text-rose-500" /> Configured Streams for Episode #{selectedEpisodeNum} ({sourcesList.length})
              </h3>
            </div>

            {loadingSources ? (
              <div className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ) : sourcesList.length === 0 ? (
              <div className="p-8 rounded-xl bg-black/30 border border-white/5 text-center space-y-2">
                <p className="text-xs font-bold text-white">No stream sources mapped yet</p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Use the form above to attach a VCDN, Media.cm, Cloudflare, AnimePahe, or custom embed stream.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sourcesList.map((src) => (
                  <div
                    key={src.id}
                    className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-white truncate">
                          {src.title || `Episode ${src.episode_number}`}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          {src.provider}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-slate-300">
                          {src.quality || '1080p'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-slate-300">
                          {src.language === 'dub' ? 'Dub' : 'Sub'}
                        </span>
                        {src.is_primary ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            PRIMARY
                          </span>
                        ) : null}
                      </div>

                      <p className="text-[10px] text-slate-500 font-mono truncate max-w-md">
                        {src.embed_url || src.playback_url || src.provider_video_id}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          const url = src.playback_url || src.embed_url || '';
                          const type = url.includes('.m3u8') ? 'hls' : url.match(/\.(mp4|webm)($|\?)/i) ? 'mp4' : 'iframe';
                          openPreview(url, type, `${src.title} (${src.provider})`);
                        }}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                        title="Preview Stream"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>

                      {!src.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(src.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[10px] font-mono transition-colors"
                        >
                          Make Primary
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteSource(src.id)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 16:9 Responsive Stream Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#0e1017] border border-white/10 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-rose-500" />
                  {previewTitle || 'Stream Preview'}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-xl">
                  {previewUrl}
                </p>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 16:9 Player Viewport */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
              {previewType === 'iframe' ? (
                <>
                  <iframe
                    src={previewUrl}
                    title="Stream Preview"
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; clipboard-write"
                    referrerPolicy="no-referrer"
                    onError={() => setIframeLoadError(true)}
                    className="w-full h-full border-0"
                  />
                  {iframeLoadError && (
                    <div className="absolute inset-0 bg-black/90 p-6 flex flex-col items-center justify-center text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-rose-500" />
                      <p className="text-xs font-bold text-white">Embed Blocked by Provider</p>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        This site prohibits iframe embedding via X-Frame-Options or Content-Security-Policy.
                      </p>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        Open in New Tab <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <video
                  src={previewUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1">
              <span>Player Type: <strong className="text-white uppercase">{previewType}</strong></span>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-400 hover:underline flex items-center gap-1"
              >
                Direct Link <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Quick AniList Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0e1017] border border-white/10 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  Import Anime from AniList GraphQL
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Search official AniList metadata. 1-click import pulls verified cover art, descriptions, and studios.
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAniListSearch} className="flex gap-2">
              <input
                type="text"
                value={importSearchQuery}
                onChange={(e) => setImportSearchQuery(e.target.value)}
                placeholder="Search by title (e.g. Solo Leveling, Bleach, Jujutsu Kaisen)..."
                className="flex-1 rounded-xl bg-black/50 border border-white/10 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={isSearchingAniList}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shrink-0 disabled:opacity-50"
              >
                {isSearchingAniList ? 'Searching...' : 'Search'}
              </button>
            </form>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {isSearchingAniList ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  Searching official AniList metadata...
                </div>
              ) : importSearchResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  {importSearchQuery ? 'No results found on AniList.' : 'Type an anime title above to search AniList.'}
                </div>
              ) : (
                importSearchResults.map((item) => {
                  const isAlreadyInCatalog = animeList.some((a) => a.anilist_id === item.id);
                  const isImporting = importingId === item.id;
                  const title = item.title?.english || item.title?.romaji || 'Untitled';

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-14 rounded bg-black/60 overflow-hidden shrink-0">
                          <PosterImage
                            src={item.coverImage?.large || item.coverImage?.extraLarge}
                            alt={title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{title}</h4>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            AniList #{item.id} • {item.format || 'TV'} {item.episodes ? `• ${item.episodes} eps` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handlePerformQuickImport(item)}
                        disabled={isImporting}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                          isAlreadyInCatalog
                            ? 'bg-white/10 hover:bg-white/20 text-slate-200'
                            : 'bg-rose-600 hover:bg-rose-500 text-white'
                        }`}
                      >
                        {isImporting ? 'Importing...' : isAlreadyInCatalog ? 'Re-import' : 'Import'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
