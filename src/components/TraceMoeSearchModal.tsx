import React, { useState } from 'react';
import { Camera, Upload, Link as LinkIcon, Play, AlertCircle, X, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { TraceMoeResultItem } from '../types/anime.ts';
import { searchTraceMoeByUrl } from '../services/tracemoeApi.ts';

interface TraceMoeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAnime: (anilistId: number, episodeNumber?: number) => void;
}

export const TraceMoeSearchModal: React.FC<TraceMoeSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectAnime,
}) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<TraceMoeResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults([]);
    setLoading(true);

    try {
      if (imageUrl.trim()) {
        const data = await searchTraceMoeByUrl(imageUrl.trim());
        setResults(data);
      } else if (filePreview) {
        // Trace.moe public API accepts image URLs directly. If user uploaded a file, we can convert to data URL or search
        // For file upload directly to Trace.moe public API:
        const form = new FormData();
        if (selectedFile) form.append('image', selectedFile);

        const res = await fetch('https://api.trace.moe/search', {
          method: 'POST',
          body: selectedFile,
        });

        if (!res.ok) {
          throw new Error(`Trace.moe search failed with HTTP ${res.status}`);
        }

        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setResults(json.result || []);
      } else {
        setError('Please paste an image URL or upload a screenshot file.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to search anime by screenshot.');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0e111a] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl text-white">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Camera className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>Trace.moe Screenshot Finder</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  AI Scene Search
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Upload a scene screenshot or paste an image URL to identify the exact anime, episode, and timestamp.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Image URL Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-rose-400" />
                <span>Image URL</span>
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  if (e.target.value) {
                    setSelectedFile(null);
                    setFilePreview(null);
                  }
                }}
                placeholder="https://example.com/screenshot.png"
                className="w-full rounded-xl bg-slate-900 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            {/* File Upload Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Upload Screenshot File</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-rose-500/20 file:text-rose-300 hover:file:bg-rose-500/30 cursor-pointer"
              />
            </div>
          </div>

          {/* Uploaded File Preview */}
          {filePreview && (
            <div className="relative w-32 h-20 rounded-xl overflow-hidden border border-white/10 bg-black/40">
              <img src={filePreview} alt="Screenshot preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setFilePreview(null);
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!imageUrl.trim() && !selectedFile)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-xl transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analyzing Scene with Trace.moe AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Identify Anime Scene</span>
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-xs text-rose-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <span>Matched Scene Candidates ({results.length})</span>
            </h3>

            <div className="space-y-3">
              {results.slice(0, 5).map((item, idx) => {
                const similarityPct = (item.similarity * 100).toFixed(1);
                const anilistId = typeof item.anilist === 'object' ? item.anilist.id : item.anilist;
                const epNum = typeof item.episode === 'number' ? item.episode : parseInt(String(item.episode || 1), 10);

                return (
                  <div
                    key={`${anilistId}-${idx}`}
                    className="p-4 rounded-2xl bg-black/40 border border-white/10 hover:border-rose-500/30 transition-all flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
                  >
                    {/* Scene Video Clip Preview */}
                    <div className="relative w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-black border border-white/10 shrink-0">
                      {item.video ? (
                        <video
                          src={item.video}
                          muted
                          loop
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img src={item.image} alt="Scene frame" className="w-full h-full object-cover" />
                      )}
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[10px] text-white">
                        {formatTimestamp(item.from)} - {formatTimestamp(item.to)}
                      </span>
                    </div>

                    {/* Meta Details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {similarityPct}% Match
                        </span>
                        {epNum && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-white/10 text-slate-300">
                            Episode {epNum}
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-bold text-white truncate">
                        {typeof item.anilist === 'object' ? item.anilist.title?.romaji || item.anilist.title?.english : item.filename || `AniList #${anilistId}`}
                      </div>

                      <p className="text-[11px] font-mono text-slate-400 truncate">
                        {item.filename || `AniList ID: ${anilistId}`}
                      </p>
                    </div>

                    {/* Open in KURO NAMI Action */}
                    <button
                      onClick={() => {
                        onSelectAnime(anilistId, epNum);
                        onClose();
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shrink-0 transition-all shadow-lg"
                    >
                      <span>Watch in KURO NAMI</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
