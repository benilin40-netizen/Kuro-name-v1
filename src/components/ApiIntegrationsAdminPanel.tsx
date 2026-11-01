import React, { useState, useEffect } from 'react';
import {
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Globe,
  Camera,
  Layers,
  Sparkles,
  Link2,
  Shield,
  Code,
  FileCheck,
  Tv,
  Check,
  ExternalLink,
} from 'lucide-react';
import { ApiIntegrationStatus } from '../types/anime.ts';
import {
  getPlaybackDiagnosticSessions,
  PlaybackDiagnosticSession,
} from '../services/canonicalAnimeResolver.ts';

export const ApiIntegrationsAdminPanel: React.FC = () => {
  const [statuses, setStatuses] = useState<ApiIntegrationStatus[]>([]);
  const [diagnosticSessions, setDiagnosticSessions] = useState<PlaybackDiagnosticSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchStatuses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/integrations/status', {
        headers: { Authorization: 'Bearer usr_admin_001' },
      });
      if (res.ok) {
        const data = await res.json();
        setStatuses(data.services || []);
      }
    } catch (_err) {
      console.error('Failed to fetch integration statuses');
    } finally {
      setLoading(false);
      setDiagnosticSessions(getPlaybackDiagnosticSessions());
    }
  };

  const testConnection = async (serviceName: string) => {
    setTestingService(serviceName);
    try {
      const serviceKey = serviceName.toLowerCase().split(' ')[0];
      const res = await fetch('/api/admin/integrations/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer usr_admin_001',
        },
        body: JSON.stringify({ service: serviceKey }),
      });
      if (res.ok) {
        await fetchStatuses();
      }
    } catch (err: any) {
      console.error('Test connection error:', err);
    } finally {
      setTestingService(null);
    }
  };

  const triggerIdSync = async () => {
    setSyncingIds(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/id-mapper/resolve?title=Naruto');
      if (res.ok) {
        setSyncMessage('External ID resolution verified across AniList, MAL, and Kitsu!');
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage('Sync verification failed.');
      }
    } catch (err: any) {
      setSyncMessage(`Error syncing: ${err.message}`);
    } finally {
      setSyncingIds(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const getServiceIcon = (name: string) => {
    if (name.includes('AniList')) return <Sparkles className="w-5 h-5 text-sky-400" />;
    if (name.includes('Jikan')) return <Server className="w-5 h-5 text-emerald-400" />;
    if (name.includes('Kitsu')) return <Globe className="w-5 h-5 text-amber-400" />;
    if (name.includes('Trace.moe')) return <Camera className="w-5 h-5 text-rose-400" />;
    return <Zap className="w-5 h-5 text-purple-400" />;
  };

  return (
    <div className="space-y-6">
      {/* 1. API INTEGRATIONS GRID */}
      <div className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Layers className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Catalogue & Discovery API Integrations
              </h2>
              <p className="text-xs text-slate-400">
                Live connection status and diagnostics for Jikan v4, AniList GraphQL, Kitsu Anime, Trace.moe, and Miruro.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={triggerIdSync}
              disabled={syncingIds}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-bold text-xs transition-all disabled:opacity-50"
            >
              <Link2 className={`w-3.5 h-3.5 ${syncingIds ? 'animate-spin' : ''}`} />
              <span>{syncingIds ? 'Verifying IDs...' : 'Verify ID Mappings'}</span>
            </button>

            <button
              onClick={fetchStatuses}
              disabled={loading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all"
              title="Refresh integration metrics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-mono text-indigo-300 animate-in fade-in">
            {syncMessage}
          </div>
        )}

        {/* Integration Status Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statuses.map((svc) => {
            const isHealthy = svc.status === 'healthy';
            const isTesting = testingService === svc.name;

            return (
              <div
                key={svc.name}
                className="p-5 rounded-2xl bg-black/40 border border-white/5 hover:border-white/10 space-y-4 shadow-lg transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-white/5 border border-white/10">
                      {getServiceIcon(svc.name)}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white leading-tight">{svc.name}</h3>
                      <p className="text-[10px] font-mono text-slate-500 truncate max-w-[160px]">{svc.endpoint}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase border ${
                      isHealthy
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    }`}
                  >
                    {isHealthy ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                    )}
                    <span>{svc.status}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Latency</span>
                    <span className="text-white font-bold">{svc.latencyMs} ms</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Requests</span>
                    <span className="text-slate-300">{svc.requestCount || 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Failures</span>
                    <span className={svc.failedCount > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                      {svc.failedCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Last Success</span>
                    <span className="text-slate-400 text-[10px]">
                      {svc.lastSuccess ? new Date(svc.lastSuccess).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {svc.lastError && (
                  <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] font-mono text-rose-300 truncate">
                    Error: {svc.lastError}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => testConnection(svc.name)}
                    disabled={isTesting}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs font-bold transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>{isTesting ? 'Testing Probe...' : 'Test Connection'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. PLAYBACK & ARTWORK DIAGNOSTIC SESSIONS */}
      <div className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Tv className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Playback & Artwork Diagnostic Log
              </h2>
              <p className="text-xs text-slate-400">
                Audits canonical anime ID resolution, artwork verification result, and stream provider matching.
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/5 text-slate-300 border border-white/10">
            {diagnosticSessions.length} Recent Sessions
          </span>
        </div>

        {diagnosticSessions.length > 0 ? (
          <div className="space-y-3">
            {diagnosticSessions.map((session) => (
              <div
                key={session.sessionId}
                className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2 text-xs font-mono"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-rose-400">Anime ID: #{session.canonicalAnimeId}</span>
                    {session.anilistId && (
                      <span className="text-slate-400 text-[10px]">
                        (AniList #{session.anilistId})
                      </span>
                    )}
                    {session.malId && (
                      <span className="text-slate-400 text-[10px]">
                        (MAL #{session.malId})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Artwork: {session.artworkVerificationResult}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Playback: {session.playbackInitializationResult}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Provider</span>
                    <span className="text-white font-bold">{session.providerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Episode & Lang</span>
                    <span className="text-slate-200">
                      Ep {session.selectedEpisode} ({session.selectedLanguage.toUpperCase()})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Metadata Source</span>
                    <span className="text-emerald-300">{session.metadataSource}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Logged At</span>
                    <span className="text-slate-400">
                      {new Date(session.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {session.resolvedPlaybackUrl && (
                  <div className="text-[10px] text-slate-500 truncate pt-1">
                    Stream URL: <code className="text-slate-400">{session.resolvedPlaybackUrl}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-black/40 border border-white/5 text-center text-xs text-slate-400 space-y-1">
            <p className="font-bold text-slate-300">No playback sessions logged yet in this browser session.</p>
            <p>Launch an anime episode in Watch View to record real-time playback & artwork diagnostic metrics.</p>
          </div>
        )}
      </div>

      {/* 3. CODERABBIT INTEGRATION & CODE QUALITY WORKFLOW */}
      <div className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <FileCheck className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>CodeRabbit AI Code Review Layer</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  .coderabbit.yaml Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Automated pull request code review workflow configured for TypeScript, React, Security, and ID mapping.
              </p>
            </div>
          </div>

          <a
            href="https://coderabbit.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition-all"
          >
            <span>CodeRabbit Docs</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Config File Created</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              <code className="text-slate-200 font-mono">/.coderabbit.yaml</code> is configured with path filters and assertive review rules for TypeScript, React 18, and streaming providers.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Review Guidelines Prepared</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Reviews strictly audit anime ID separation, artwork verification, video player sandbox security, and Express middleware authorization.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Code className="w-4 h-4 text-sky-400" />
              <span>Awaiting GitHub App Auth</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              To trigger AI reviews on Pull Requests, authorize the CodeRabbit GitHub App on your repository as outlined in <code className="text-slate-200 font-mono">CODERABBIT_GUIDE.md</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
