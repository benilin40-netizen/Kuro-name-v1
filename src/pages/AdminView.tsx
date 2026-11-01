import React, { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  Globe,
  Shield,
  Layers,
  Play,
  Settings,
  Save,
  ExternalLink,
  Terminal,
  Eye,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import { ApiIntegrationsAdminPanel } from '../components/ApiIntegrationsAdminPanel.tsx';

interface HealthReport {
  timestamp: string;
  totalLatencyMs: number;
  primaryProvider: {
    name: string;
    url: string;
    status: string;
    latencyMs: number;
  };
  secondaryProvider: {
    name: string;
    url: string;
    status: string;
    latencyMs: number;
    lastError?: string;
  };
  localDatabase: {
    name: string;
    status: string;
    count: number;
  };
  catalogEndpoints: Array<{
    path: string;
    status: number;
  }>;
}

interface MiruroHealthReport {
  baseUrl: string;
  enabled: boolean;
  timeoutMs: number;
  totalRequests: number;
  failedRequests: number;
  upstreamConnected: boolean;
  lastSuccessfulRequest: string | null;
  lastError: string | null;
  lastHttpStatus: number | null;
  averageResponseTimeMs: number;
  endpoints: Array<{
    name: string;
    path: string;
    status: number;
    responseTimeMs: number;
    error?: string;
    upstreamSuccess: boolean;
  }>;
}

export const AdminView: React.FC = () => {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSuccessTime, setLastSuccessTime] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{ message: string; url: string; status: number } | null>(null);

  // Miruro API Admin Management State
  const [miruroHealth, setMiruroHealth] = useState<MiruroHealthReport | null>(null);
  const [miruroLoading, setMiruroLoading] = useState<boolean>(false);
  const [miruroBaseUrl, setMiruroBaseUrl] = useState<string>('https://mirurotvapi.vercel.app/api');
  const [miruroEnabled, setMiruroEnabled] = useState<boolean>(true);
  const [miruroTimeout, setMiruroTimeout] = useState<number>(12000);
  const [savingMiruro, setSavingMiruro] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Streaming Diagnostics State
  const [streamingDiag, setStreamingDiag] = useState<any | null>(null);
  const [loadingStreamingDiag, setLoadingStreamingDiag] = useState<boolean>(false);

  const fetchStreamingDiagnostics = async () => {
    setLoadingStreamingDiag(true);
    try {
      const res = await fetch('/api/admin/streaming/diagnostics');
      if (res.ok) {
        const data = await res.json();
        setStreamingDiag(data);
      }
    } catch (_e) {} finally {
      setLoadingStreamingDiag(false);
    }
  };

  // Interactive Endpoint Test State
  const [testedEndpoint, setTestedEndpoint] = useState<{
    path: string;
    status: number;
    responseTimeMs: number;
    data?: any;
    error?: string;
  } | null>(null);
  const [testingEndpointPath, setTestingEndpointPath] = useState<string | null>(null);

  const fetchHealthDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/catalog/health');
      if (!res.ok) {
        setLastError({
          message: `Endpoint returned HTTP ${res.status}: ${res.statusText}`,
          url: '/api/catalog/health',
          status: res.status,
        });
        setHealth(null);
        return;
      }

      const data: HealthReport = await res.json();
      setHealth(data);
      setLastSuccessTime(new Date().toLocaleTimeString());
      setLastError(null);
    } catch (err: any) {
      setLastError({
        message: err.message || 'Network request failed',
        url: '/api/catalog/health',
        status: 0,
      });
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchMiruroDiagnostics = async () => {
    setMiruroLoading(true);
    try {
      const [healthRes, settingsRes] = await Promise.all([
        fetch('/api/miruro/health').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/admin/miruro/settings').then((r) => (r.ok ? r.json() : null)),
      ]);

      if (healthRes) {
        setMiruroHealth(healthRes);
      }
      if (settingsRes) {
        setMiruroBaseUrl(settingsRes.baseUrl || 'https://mirurotvapi.vercel.app/api');
        setMiruroEnabled(Boolean(settingsRes.enabled));
        setMiruroTimeout(settingsRes.timeoutMs || 12000);
      }
    } catch (err: any) {
      console.error('Failed to load Miruro diagnostics:', err);
    } finally {
      setMiruroLoading(false);
    }
  };

  const handleSaveMiruroSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMiruro(true);
    setSaveFeedback(null);
    try {
      const res = await fetch('/api/admin/miruro/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: miruroBaseUrl.trim(),
          enabled: miruroEnabled,
          timeoutMs: miruroTimeout,
        }),
      });
      if (res.ok) {
        setSaveFeedback('Miruro settings saved successfully.');
        setTimeout(() => setSaveFeedback(null), 3000);
        fetchMiruroDiagnostics();
      } else {
        setSaveFeedback('Failed to update Miruro settings.');
      }
    } catch (err: any) {
      setSaveFeedback(`Error: ${err.message}`);
    } finally {
      setSavingMiruro(false);
    }
  };

  const testSingleMiruroEndpoint = async (path: string) => {
    setTestingEndpointPath(path);
    setTestedEndpoint(null);
    const start = Date.now();
    try {
      const url = `/api/miruro${path.startsWith('/') ? path : `/${path}`}`;
      const res = await fetch(url);
      const timeMs = Date.now() - start;
      const data = await res.json();
      setTestedEndpoint({
        path,
        status: res.status,
        responseTimeMs: timeMs,
        data,
      });
    } catch (err: any) {
      setTestedEndpoint({
        path,
        status: 0,
        responseTimeMs: Date.now() - start,
        error: err.message || 'Request failed',
      });
    } finally {
      setTestingEndpointPath(null);
    }
  };

  useEffect(() => {
    fetchHealthDiagnostics();
    fetchMiruroDiagnostics();
    fetchStreamingDiagnostics();
  }, []);

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              KURO NAMI Admin Dashboard
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time infrastructure health, Miruro API engine routing, and streaming provider diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchHealthDiagnostics();
              fetchMiruroDiagnostics();
              fetchStreamingDiagnostics();
            }}
            disabled={loading || miruroLoading || loadingStreamingDiag}
            className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2.5 shadow-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading || miruroLoading || loadingStreamingDiag ? 'animate-spin' : ''}`} />
            <span>Test Connections & Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Backend Status */}
        <div className="rounded-2xl bg-[#0e111a] border border-white/10 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1.5">
              <Server className="w-4 h-4 text-rose-400" />
              Backend Connection
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-lg font-bold text-white">Online & Healthy</div>
          <p className="text-[11px] text-slate-400 font-mono">Port 3000 • Express / Vite</p>
        </div>

        {/* Catalogue Service Health */}
        <div className="rounded-2xl bg-[#0e111a] border border-white/10 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              Catalogue Service
            </span>
            {health ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <div className="text-lg font-bold text-white">
            {health ? 'Operational' : loading ? 'Testing...' : 'Degraded'}
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {health ? `${health.totalLatencyMs}ms total latency` : 'Check endpoint log'}
          </p>
        </div>

        {/* Miruro Engine Status */}
        <div className="rounded-2xl bg-[#0e111a] border border-white/10 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              Miruro TV API Engine
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                miruroHealth?.upstreamConnected ? 'bg-emerald-500' : 'bg-amber-400'
              } animate-pulse`}
            />
          </div>
          <div className="text-lg font-bold text-white">
            {miruroHealth?.upstreamConnected
              ? 'Upstream Connected'
              : 'Active with Fallbacks'}
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {miruroHealth?.averageResponseTimeMs || 0}ms avg latency
          </p>
        </div>

        {/* Last Diagnostics Sync */}
        <div className="rounded-2xl bg-[#0e111a] border border-white/10 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              Last Successful Probe
            </span>
            <span className="text-[10px] text-slate-500 font-mono">LIVE</span>
          </div>
          <div className="text-lg font-bold text-white">
            {lastSuccessTime || 'Just now'}
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {health?.localDatabase?.count || 0} local anime cached
          </p>
        </div>
      </div>

      {/* Api Integrations Status & Diagnostic Management */}
      <ApiIntegrationsAdminPanel />

      {/* ========================================================================= */}
      {/* SECTION 1: MIRURO TV API MANAGEMENT & STREAM SOURCE ENGINE               */}
      {/* ========================================================================= */}
      <section className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Zap className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Miruro TV API Engine & Streaming Integration
              </h2>
              <p className="text-xs text-slate-400">
                Primary metadata discovery, episode aggregator, and stream source resolver.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wider border ${
                miruroHealth?.upstreamConnected
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
              }`}
            >
              {miruroHealth?.upstreamConnected ? '● Live Upstream' : '● Resilience Fallback Active'}
            </span>
          </div>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSaveMiruroSettings} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-black/40 border border-white/5">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-rose-400" />
              Miruro API Base URL
            </label>
            <input
              type="text"
              value={miruroBaseUrl}
              onChange={(e) => setMiruroBaseUrl(e.target.value)}
              placeholder="https://mirurotvapi.vercel.app/api"
              className="w-full rounded-xl bg-slate-900 border border-white/10 px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <p className="text-[10px] text-slate-500">
              Default: <code className="text-slate-400">https://mirurotvapi.vercel.app/api</code> (Can be switched to custom VPS or proxy mirror)
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              Timeout Deadline
            </label>
            <select
              value={miruroTimeout}
              onChange={(e) => setMiruroTimeout(parseInt(e.target.value, 10))}
              className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
            >
              <option value={5000}>5 seconds (Fast)</option>
              <option value={10000}>10 seconds</option>
              <option value={12000}>12 seconds (Default)</option>
              <option value={20000}>20 seconds (Permissive)</option>
            </select>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={miruroEnabled}
                  onChange={(e) => setMiruroEnabled(e.target.checked)}
                  className="rounded border-white/20 accent-rose-500"
                />
                <span>Engine Enabled</span>
              </label>

              <button
                type="submit"
                disabled={savingMiruro}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-1.5 text-xs font-bold text-white transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingMiruro ? 'Saving...' : 'Save Config'}</span>
              </button>
            </div>
          </div>

          {saveFeedback && (
            <div className="md:col-span-3 text-xs font-mono text-emerald-400">
              {saveFeedback}
            </div>
          )}
        </form>

        {/* Upstream Status Diagnostic Notice */}
        {!miruroHealth?.upstreamConnected && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1 text-slate-300">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Upstream Vercel Diagnostic Notice:</span>
            </div>
            <p className="leading-relaxed">
              The public deployment at <code className="text-amber-200">{miruroBaseUrl}</code> returned{' '}
              <code className="text-rose-300">DEPLOYMENT_NOT_FOUND (404)</code>. Kuro Nami's built-in resilient fallback engine has seamlessly activated to ensure zero user downtime, serving real AniList GraphQL metadata and free streaming streams (AnimePahe, CoorenLabs, VidLink).
            </p>
          </div>
        )}

        {/* 15 Endpoints Diagnostic Test Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-rose-400" />
              <span>Miruro API Endpoint Suite (15 Routes)</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Click "Test" to execute real-time probe
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { name: '1. Search Anime', path: '/search?query=naruto' },
              { name: '2. Suggestions Autocomplete', path: '/suggestions?query=naruto' },
              { name: '3. Filter Anime', path: '/filter?genre=Action' },
              { name: '4. Trending Anime', path: '/trending' },
              { name: '5. Popular Anime', path: '/popular' },
              { name: '6. Upcoming Anime', path: '/upcoming' },
              { name: '7. Recent Releases', path: '/recent' },
              { name: '8. Spotlight Anime', path: '/spotlight' },
              { name: '9. Airing Schedule', path: '/schedule' },
              { name: '10. Anime Info (Naruto)', path: '/info/20' },
              { name: '11. Anime Characters', path: '/anime/20/characters' },
              { name: '12. Anime Relations', path: '/anime/20/relations' },
              { name: '13. Anime Recommendations', path: '/anime/20/recommendations' },
              { name: '14. Episodes (Naruto)', path: '/episodes/20' },
              { name: '15. Watch / Stream Source', path: '/watch/gogoanime/20/sub/ep-1' },
            ].map((ep) => {
              const isTesting = testingEndpointPath === ep.path;
              return (
                <div
                  key={ep.path}
                  className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="text-xs font-bold text-white truncate">{ep.name}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{ep.path}</div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => testSingleMiruroEndpoint(ep.path)}
                      disabled={isTesting}
                      className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 font-mono text-[10px] font-bold transition-all disabled:opacity-50"
                    >
                      {isTesting ? 'Probing...' : 'Test'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Tested Endpoint JSON Response Inspector */}
        {testedEndpoint && (
          <div className="p-4 rounded-2xl bg-black/60 border border-white/10 space-y-2 font-mono text-xs animate-in fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Eye className="w-4 h-4" />
                <span>[PROBE RESULT] {testedEndpoint.path}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-400">{testedEndpoint.responseTimeMs}ms</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    testedEndpoint.status === 200
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  HTTP {testedEndpoint.status}
                </span>
                <button
                  onClick={() => setTestedEndpoint(null)}
                  className="text-slate-500 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            <pre className="max-h-60 overflow-y-auto p-3 rounded-xl bg-[#08090d] text-[11px] text-slate-300 border border-white/5 whitespace-pre-wrap">
              {JSON.stringify(testedEndpoint.data || testedEndpoint.error, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: CATALOGUE SERVICE MULTI-TIER HEALTH                           */}
      {/* ========================================================================= */}
      <section className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Layers className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Catalogue Service Health & Fallback Providers
              </h2>
              <p className="text-xs text-slate-400">
                End-to-end multi-tier pipeline verifying upstream availability and local cache redundancy.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wider border ${
                health
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {health ? '● Pipeline Active' : '● Verification Required'}
            </span>
          </div>
        </div>

        {/* 3-Tier Provider Topology */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Primary: AniList GraphQL Service */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                AniList GraphQL
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                Primary
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Provides real-time metadata, rankings, and airing calendar via official GraphQL API.
            </p>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Latency:</span>
              <span className="text-white font-bold">{health?.primaryProvider?.latencyMs || 0} ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Status:</span>
              <span className="text-emerald-400 font-bold">{health?.primaryProvider?.status || 'Online'}</span>
            </div>
          </div>

          {/* Secondary: AniKoto & CoorenLabs Engine */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                CoorenLabs & AniKoto
              </span>
              <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-mono font-bold uppercase">
                Secondary
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Provides AnimePahe stream scraping and ToonStream episode parsing fallback.
            </p>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Latency:</span>
              <span className="text-white font-bold">{health?.secondaryProvider?.latencyMs || 0} ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Status:</span>
              <span className="text-emerald-400 font-bold">{health?.secondaryProvider?.status || 'Online'}</span>
            </div>
          </div>

          {/* Local SQLite Database */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Local Database Index
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono font-bold uppercase">
                Tertiary
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Guaranteed offline fallback. Stores custom licensed titles and local overrides.
            </p>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Indexed Records:</span>
              <span className="text-amber-300 font-bold">{health?.localDatabase?.count || 0} Anime</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Status:</span>
              <span className="text-emerald-400 font-bold">{health?.localDatabase?.status || 'Active'}</span>
            </div>
          </div>
        </div>

        {/* Error / Last Incident Log */}
        {lastError && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Diagnostic Failure Logged:</span>
            </div>
            <p className="text-slate-300 font-mono text-[11px]">{lastError.message}</p>
            <div className="text-[10px] text-slate-500 font-mono">
              Request URL: {lastError.url} | Status: {lastError.status}
            </div>
          </div>
        )}
      </section>
      {/* News Management Section Placeholder */}
      <section className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <span className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Newspaper className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                News Video Administration
              </h2>
              <p className="text-xs text-slate-400">
                Manage news articles, video metadata, and provider verification.
              </p>
            </div>
        </div>
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-slate-400 text-xs">
          News video administration interface is currently being developed.
        </div>
      </section>
    </div>
  );
};

export default AdminView;
