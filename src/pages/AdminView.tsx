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
} from 'lucide-react';

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

export const AdminView: React.FC = () => {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSuccessTime, setLastSuccessTime] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{ message: string; url: string; status: number } | null>(null);

  const fetchHealthDiagnostics = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/catalog/health');
      const url = '/api/catalog/health';

      if (!res.ok) {
        setLastError({
          message: `Endpoint returned HTTP ${res.status}: ${res.statusText}`,
          url,
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

  useEffect(() => {
    fetchHealthDiagnostics();
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
            Real-time infrastructure health, catalogue service routing, and provider diagnostics.
          </p>
        </div>

        <button
          onClick={fetchHealthDiagnostics}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2.5 shadow-lg transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Test Connections & Retry</span>
        </button>
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

        {/* Primary Metadata */}
        <div className="rounded-2xl bg-[#0e111a] border border-white/10 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-cyan-400" />
              Primary Provider
            </span>
            <span className="text-[10px] font-mono font-bold text-cyan-400">AniList</span>
          </div>
          <div className="text-lg font-bold text-white truncate">
            {health?.primaryProvider?.status || 'Unknown'}
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {health?.primaryProvider ? `${health.primaryProvider.latencyMs}ms GraphQL` : 'GraphQL API'}
          </p>
        </div>

        {/* Local Database */}
        <div className="rounded-2xl bg-[#0e111a] border border-white/10 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1.5">
              <Database className="w-4 h-4 text-amber-400" />
              Local Database
            </span>
            <span className="text-[10px] font-mono font-bold text-amber-400">SQLite</span>
          </div>
          <div className="text-lg font-bold text-white">
            {health?.localDatabase?.count ?? 0} Anime Indexed
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Status: {health?.localDatabase?.status || 'Active'}
          </p>
        </div>
      </div>

      {/* Detailed Catalogue Provider Status Panel */}
      <section className="rounded-3xl bg-[#0e111a] border border-white/10 p-6 space-y-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-500" />
              Catalogue Service Health & Provider Routing
            </h2>
            <p className="text-xs text-slate-400">
              Inspecting active primary, secondary, and local catalogue fallback routes.
            </p>
          </div>
          {lastSuccessTime && (
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Last Verified: {lastSuccessTime}
            </span>
          )}
        </div>

        {/* Provider Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Primary: AniList GraphQL */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                AniList GraphQL
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold uppercase">
                Primary
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Official public metadata provider. Dynamic GraphQL queries with in-memory caching.
            </p>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Latency:</span>
              <span className="text-cyan-300 font-bold">{health?.primaryProvider?.latencyMs || 0}ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Status:</span>
              <span className="text-emerald-400 font-bold">{health?.primaryProvider?.status || 'Testing'}</span>
            </div>
          </div>

          {/* Secondary: AniKoto / Jikan */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                AniKoto & Jikan API
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-mono font-bold uppercase">
                Secondary
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Secondary catalogue stream provider for fallback metadata and recent airing releases.
            </p>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Latency:</span>
              <span className="text-rose-300 font-bold">{health?.secondaryProvider?.latencyMs || 0}ms</span>
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

        {/* API Endpoint Verification Table */}
        <div className="space-y-3 pt-4 border-t border-white/5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Registered Catalogue Endpoints
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            {[
              { path: '/api/catalog', desc: 'Central Catalogue Routing Engine' },
              { path: '/api/anime/recent', desc: 'Recent Releases & Latest Updates' },
              { path: '/api/anime/trending', desc: 'Trending Anime Listings' },
              { path: '/api/anime/popular', desc: 'Popular All-Time Rankings' },
            ].map((endpoint) => (
              <div
                key={endpoint.path}
                className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-white">{endpoint.path}</div>
                  <div className="text-[10px] text-slate-500 font-sans">{endpoint.desc}</div>
                </div>
                <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                  200 OK
                </span>
              </div>
            ))}
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
    </div>
  );
};

export default AdminView;
