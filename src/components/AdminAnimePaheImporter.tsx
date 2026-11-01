import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Tv,
  Calendar,
  Star,
  Film,
  Server,
  Layers,
  Sparkles,
  ExternalLink,
  Clock,
  Check,
  X,
} from 'lucide-react';
import { animePaheProxy, AnimePaheProxySearchResult, AnimePaheEpisodeResult } from '../services/anime/proxy.ts';

interface AdminAnimePaheImporterProps {
  getAdminHeaders: () => Record<string, string> | Promise<Record<string, string>>;
  showFeedback: (msg: string, type?: 'success' | 'error') => void;
}

export const AdminAnimePaheImporter: React.FC<AdminAnimePaheImporterProps> = ({
  getAdminHeaders,
  showFeedback,
}) => {
  // Provider Health State
  const [providerHealth, setProviderHealth] = useState<{ reachable: boolean; baseUrl: string; latencyMs?: number; error?: string } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnimePaheProxySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selected Anime Preview State
  const [selectedAnime, setSelectedAnime] = useState<AnimePaheProxySearchResult | null>(null);
  const [episodesList, setEpisodesList] = useState<AnimePaheEpisodeResult[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisodeNumbers, setSelectedEpisodeNumbers] = useState<Set<number>>(new Set());
  const [importAll, setImportAll] = useState(true);

  // Import Execution State
  const [importing, setImporting] = useState(false);

  // Imported Anime Catalog & Sync History State
  const [importedAnimeList, setImportedAnimeList] = useState<any[]>([]);
  const [syncHistory, setSyncHistory] = useState<any[]>([]);
  const [loadingImports, setLoadingImports] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Check health on mount
  useEffect(() => {
    checkHealth();
    loadImportsAndHistory();
  }, []);

  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      const health = await animePaheProxy.checkHealth();
      setProviderHealth(health);
    } catch (err: any) {
      setProviderHealth({
        reachable: false,
        baseUrl: animePaheProxy.getBaseUrl(),
        error: err.message || 'Connection failed',
      });
    } finally {
      setCheckingHealth(false);
    }
  };

  const loadImportsAndHistory = async () => {
    setLoadingImports(true);
    try {
      const headers = await Promise.resolve(getAdminHeaders());
      const [importsRes, historyRes] = await Promise.all([
        fetch('/api/admin/animepahe/imports', { headers }),
        fetch('/api/admin/animepahe/sync-history', { headers }),
      ]);

      if (importsRes.ok) {
        const data = await importsRes.json();
        setImportedAnimeList(Array.isArray(data) ? data : []);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setSyncHistory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load imports history:', err);
    } finally {
      setLoadingImports(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);
    try {
      const results = await animePaheProxy.search(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No anime titles found matching your search on AnimePahe.');
      }
    } catch (err: any) {
      setSearchError(err.message || 'Failed to execute search. Check API connectivity.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectAnime = async (anime: AnimePaheProxySearchResult) => {
    setSelectedAnime(anime);
    setLoadingEpisodes(true);
    setEpisodesList([]);
    setSelectedEpisodeNumbers(new Set());

    try {
      const eps = await animePaheProxy.getEpisodes(anime.session);
      setEpisodesList(eps);
      const allNums = new Set(eps.map((e) => e.episodeNumber));
      setSelectedEpisodeNumbers(allNums);
    } catch (err: any) {
      showFeedback(`Failed to load episodes for "${anime.title}": ${err.message}`, 'error');
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const toggleEpisodeSelection = (epNum: number) => {
    const next = new Set(selectedEpisodeNumbers);
    if (next.has(epNum)) {
      next.delete(epNum);
    } else {
      next.add(epNum);
    }
    setSelectedEpisodeNumbers(next);
  };

  const handleSelectAllEpisodes = (select: boolean) => {
    if (select) {
      setSelectedEpisodeNumbers(new Set(episodesList.map((e) => e.episodeNumber)));
    } else {
      setSelectedEpisodeNumbers(new Set());
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedAnime) return;
    setImporting(true);

    try {
      const payload = {
        animeSession: selectedAnime.session,
        animeData: selectedAnime,
        importAll,
        episodesToImport: Array.from(selectedEpisodeNumbers),
      };

      const res = await fetch('/api/admin/animepahe/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await Promise.resolve(getAdminHeaders())),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import request failed');
      }

      showFeedback(data.message || `Successfully imported "${selectedAnime.title}"!`, 'success');
      setSelectedAnime(null);
      loadImportsAndHistory();
    } catch (err: any) {
      showFeedback(`Import failed: ${err.message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleRunSync = async (animeId?: string) => {
    setSyncingId(animeId || 'global');
    try {
      const res = await fetch('/api/admin/animepahe/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await Promise.resolve(getAdminHeaders())),
        },
        body: JSON.stringify({ animeId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sync request failed');
      }

      showFeedback(data.message || 'Synchronization completed successfully!', 'success');
      loadImportsAndHistory();
    } catch (err: any) {
      showFeedback(`Synchronization failed: ${err.message}`, 'error');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header & Provider Health Banner */}
      <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <Download className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black text-white tracking-tight">
              AnimePahe Importer & Sync Engine
            </h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Search, preview, and ingest verified anime titles and stream sources directly from AnimePahe (CoorenLabs) into your KURO NAMI catalogue with automated duplicate protection and episode synchronization.
          </p>
        </div>

        {/* Health status badge */}
        <div className="flex items-center gap-3 bg-black/40 border border-white/10 px-4 py-3 rounded-xl self-start md:self-auto">
          <div className={`w-3 h-3 rounded-full ${providerHealth?.reachable ? 'bg-emerald-400 shadow-lg shadow-emerald-950 animate-pulse' : 'bg-rose-500'}`} />
          <div className="text-xs">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>AnimePahe (animepahe.pw)</span>
              {providerHealth?.latencyMs && <span className="text-[10px] font-mono text-emerald-400">({providerHealth.latencyMs}ms)</span>}
            </div>
            <div className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
              {providerHealth?.reachable ? 'animepahe.pw • Online' : providerHealth?.error || 'Connected'}
            </div>
          </div>
          <button
            onClick={checkHealth}
            disabled={checkingHealth}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors ml-2"
            title="Check connection health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Search Section */}
      <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Search className="w-4 h-4 text-rose-500" />
          <span>Search AnimePahe Catalog</span>
        </h3>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search AnimePahe (e.g. Frieren, Solo Leveling, Bleach, Naruto)..."
              className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-rose-950/50 shrink-0"
          >
            {searching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Search Anime</span>
              </>
            )}
          </button>
        </form>

        {searchError && (
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Search Results Grid */}
        {searchResults.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Search Results ({searchResults.length}) — Click an item to preview & import
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {searchResults.map((item) => {
                const isSelected = selectedAnime?.session === item.session;
                return (
                  <div
                    key={item.session}
                    onClick={() => handleSelectAnime(item)}
                    className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-rose-600/20 border-rose-500 text-white shadow-lg'
                        : 'bg-black/40 border-white/5 hover:border-white/20 hover:bg-black/60 text-slate-300'
                    }`}
                  >
                    {item.poster ? (
                      <img src={item.poster} alt={item.title} className="w-16 h-22 object-cover rounded-lg shrink-0 shadow" />
                    ) : (
                      <div className="w-16 h-22 rounded-lg bg-white/5 flex items-center justify-center text-slate-600 shrink-0">
                        <Tv className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <h5 className="text-xs font-bold text-white truncate" title={item.title}>
                        {item.title}
                      </h5>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        {item.year && <span>{item.year}</span>}
                        {item.type && <span>• {item.type}</span>}
                        {item.episodes && <span>• {item.episodes} Eps</span>}
                      </div>
                      {item.score && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{item.score}</span>
                        </div>
                      )}
                      <div className="pt-1">
                        <span className="inline-block px-2 py-0.5 rounded bg-white/10 text-[9px] font-bold text-rose-300 uppercase">
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Selected Anime Preview & Episode Selection Modal/Panel */}
      {selectedAnime && (
        <div className="p-6 rounded-2xl bg-[#0e1017] border border-rose-500/30 space-y-6 shadow-2xl animate-in fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              {selectedAnime.poster ? (
                <img src={selectedAnime.poster} alt={selectedAnime.title} className="w-24 h-36 object-cover rounded-xl shadow-lg border border-white/10" />
              ) : (
                <div className="w-24 h-36 rounded-xl bg-white/5 flex items-center justify-center text-slate-600">
                  <Tv className="w-8 h-8" />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                    AnimePahe Preview
                  </span>
                  {selectedAnime.year && (
                    <span className="text-xs text-slate-400 font-mono">Released: {selectedAnime.year}</span>
                  )}
                </div>
                <h3 className="text-lg font-black text-white">
                  {selectedAnime.title}
                </h3>
                <div className="flex items-center gap-4 text-xs text-slate-300 font-mono">
                  <span>Format: {selectedAnime.type || 'TV'}</span>
                  <span>•</span>
                  <span>Episodes: {selectedAnime.episodes || episodesList.length || 'Unknown'}</span>
                  {selectedAnime.score && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{selectedAnime.score}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedAnime(null)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Episode Selection & Import All */}
          <div className="space-y-4 pt-2 border-t border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-rose-500" />
                  <span>Select Episodes to Import ({selectedEpisodeNumbers.size} / {episodesList.length})</span>
                </h4>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
                  <input
                    type="checkbox"
                    checked={importAll}
                    onChange={(e) => {
                      setImportAll(e.target.checked);
                      handleSelectAllEpisodes(e.target.checked);
                    }}
                    className="accent-rose-500 rounded"
                  />
                  <span className="font-bold">Import All Episodes</span>
                </label>

                <button
                  onClick={() => handleSelectAllEpisodes(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={() => handleSelectAllEpisodes(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {loadingEpisodes ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 font-mono text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-rose-500" />
                <span>Loading confirmed episode list from AnimePahe...</span>
              </div>
            ) : episodesList.length === 0 ? (
              <div className="p-6 rounded-xl bg-black/40 text-center text-xs text-slate-400">
                No episodes found for this anime session.
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2 max-h-64 overflow-y-auto p-2 rounded-xl bg-black/40 border border-white/5">
                {episodesList.map((ep) => {
                  const isChecked = selectedEpisodeNumbers.has(ep.episodeNumber);
                  return (
                    <button
                      key={ep.episodeNumber}
                      onClick={() => {
                        setImportAll(false);
                        toggleEpisodeSelection(ep.episodeNumber);
                      }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                        isChecked
                          ? 'bg-rose-600 border-rose-500 text-white shadow'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                      title={ep.title}
                    >
                      <span>Ep {ep.episodeNumber}</span>
                      {isChecked && <Check className="w-3 h-3 mt-1 text-white" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Import Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
            <button
              onClick={() => setSelectedAnime(null)}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={importing || selectedEpisodeNumbers.size === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors shadow-lg shadow-rose-950/50 disabled:opacity-50 disabled:pointer-events-none"
            >
              {importing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Importing Anime & Streams...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Import Anime ({selectedEpisodeNumbers.size} Episodes)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 4. Imported Anime Catalog & Synchronization Management */}
      <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Film className="w-4 h-4 text-rose-500" />
              <span>Imported AnimePahe Catalog & Sync Manager</span>
            </h3>
            <p className="text-xs text-slate-400">
              Manage previously imported AnimePahe titles and synchronize newly released episodes.
            </p>
          </div>

          <button
            onClick={() => handleRunSync()}
            disabled={syncingId !== null}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-rose-500 ${syncingId === 'global' ? 'animate-spin' : ''}`} />
            <span>Sync All Anime</span>
          </button>
        </div>

        {loadingImports ? (
          <div className="py-12 flex justify-center text-slate-400 text-xs">Loading imported catalog...</div>
        ) : importedAnimeList.length === 0 ? (
          <div className="p-8 rounded-xl bg-black/40 text-center text-xs text-slate-400">
            No AnimePahe titles imported yet. Use the search above to find and import anime.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {importedAnimeList.map((item) => (
              <div key={item.anime_id} className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-3">
                <div className="flex gap-3">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-14 h-20 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className="w-14 h-20 rounded-lg bg-white/5 flex items-center justify-center text-slate-600 shrink-0">
                      <Tv className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="text-xs font-bold text-white truncate" title={item.title}>
                      {item.title}
                    </h4>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Episodes Ingested: <span className="text-white font-bold">{item.episodes_count || 0}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      Last Synced: {item.last_synced_at ? new Date(item.last_synced_at).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-mono font-bold uppercase">
                    Active Catalog
                  </span>
                  <button
                    onClick={() => handleRunSync(item.anime_id)}
                    disabled={syncingId === item.anime_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-bold text-white transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingId === item.anime_id ? 'animate-spin' : ''}`} />
                    <span>Sync New Episodes</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Synchronization History Logs */}
      <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-rose-500" />
          <span>Synchronization Audit History</span>
        </h3>

        {syncHistory.length === 0 ? (
          <div className="p-6 rounded-xl bg-black/40 text-center text-xs text-slate-400">
            No synchronization activity logged yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {syncHistory.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="text-emerald-400">●</span>
                    <span>{log.message}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Session: {log.animepahe_session} • Time: {new Date(log.synced_at).toLocaleString()}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono font-bold text-slate-300">
                  +{log.new_episodes_added} Eps
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAnimePaheImporter;
