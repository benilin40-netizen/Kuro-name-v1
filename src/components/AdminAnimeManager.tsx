import React, { useState, useEffect } from 'react';
import {
  Tv,
  PlusCircle,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Archive,
  RefreshCw,
  ExternalLink,
  Play,
  Film,
  Sparkles,
  Calendar,
  Layers,
  Sliders,
  X,
  Check,
  Video,
  Upload,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { PosterImage } from './PosterImage.tsx';

export interface CategoryAssignment {
  category: string;
  display_order: number;
}

export interface AdminAnimeRecord {
  id: string;
  anilist_id?: number;
  mal_id?: number;
  title: string;
  title_english?: string;
  title_romaji?: string;
  title_native?: string;
  synopsis?: string;
  description?: string;
  cover_image?: string;
  banner_image?: string;
  genres?: string;
  format?: string;
  status?: string;
  season?: string;
  season_year?: number;
  episodes?: number;
  average_score?: number;
  popularity?: number;
  studios?: string;
  is_published?: number;
  is_archived?: number;
  categories?: CategoryAssignment[];
  episode_count?: number;
}

export interface AdminEpisodeRecord {
  id: string;
  anime_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  release_date?: string;
  language?: string;
  video_source_url?: string;
  video_source_type?: string;
  video_provider?: string;
  duration?: number;
  thumbnail?: string;
  description?: string;
  is_published?: number;
  is_hidden?: number;
  status?: 'READY' | 'PROCESSING' | 'ERROR' | 'UNAVAILABLE' | 'UPLOADING';
  sort_order?: number;
}

const SITE_CATEGORIES = [
  'Trending',
  'Popular',
  'Recently Added',
  'Movies',
  'Ongoing',
  'Completed',
];

interface AdminAnimeManagerProps {
  getAdminHeaders: () => Promise<Record<string, string>>;
  showFeedback: (msg: string, type?: 'success' | 'error') => void;
  onSelectAnimeForPlayer?: (animeId: string) => void;
}

export const AdminAnimeManager: React.FC<AdminAnimeManagerProps> = ({
  getAdminHeaders,
  showFeedback,
  onSelectAnimeForPlayer,
}) => {
  const [animeList, setAnimeList] = useState<AdminAnimeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Duplicate Check Search
  const [duplicateQuery, setDuplicateQuery] = useState('');
  const [duplicateMatches, setDuplicateMatches] = useState<AdminAnimeRecord[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Modal: Create / Edit Anime
  const [showAnimeModal, setShowAnimeModal] = useState(false);
  const [editingAnime, setEditingAnime] = useState<AdminAnimeRecord | null>(null);
  const [savingAnime, setSavingAnime] = useState(false);

  // Form Fields for Anime
  const [formTitle, setFormTitle] = useState('');
  const [formTitleEnglish, setFormTitleEnglish] = useState('');
  const [formTitleRomaji, setFormTitleRomaji] = useState('');
  const [formTitleNative, setFormTitleNative] = useState('');
  const [formSynopsis, setFormSynopsis] = useState('');
  const [formCoverImage, setFormCoverImage] = useState('');
  const [formBannerImage, setFormBannerImage] = useState('');
  const [formGenres, setFormGenres] = useState('');
  const [formFormat, setFormFormat] = useState('TV');
  const [formStatus, setFormStatus] = useState('RELEASING');
  const [formSeason, setFormSeason] = useState('SPRING');
  const [formSeasonYear, setFormSeasonYear] = useState<number>(new Date().getFullYear());
  const [formEpisodes, setFormEpisodes] = useState<number>(12);
  const [formAnilistId, setFormAnilistId] = useState<string>('');
  const [formMalId, setFormMalId] = useState<string>('');
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formIsArchived, setFormIsArchived] = useState(false);
  const [formCategoryMap, setFormCategoryMap] = useState<Record<string, { selected: boolean; order: number }>>({
    Trending: { selected: false, order: 0 },
    Popular: { selected: false, order: 0 },
    'Recently Added': { selected: true, order: 0 },
    Movies: { selected: false, order: 0 },
    Ongoing: { selected: true, order: 0 },
    Completed: { selected: false, order: 0 },
  });

  // Episode Management Drawer
  const [selectedAnimeForEpisodes, setSelectedAnimeForEpisodes] = useState<AdminAnimeRecord | null>(null);
  const [episodesList, setEpisodesList] = useState<AdminEpisodeRecord[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Modal: Add / Edit Episode
  const [showEpisodeModal, setShowEpisodeModal] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<AdminEpisodeRecord | null>(null);
  const [epSeasonNumber, setEpSeasonNumber] = useState(1);
  const [epEpisodeNumber, setEpEpisodeNumber] = useState(1);
  const [epTitle, setEpTitle] = useState('');
  const [epReleaseDate, setEpReleaseDate] = useState('');
  const [epLanguage, setEpLanguage] = useState('Japanese (Sub)');
  const [epVideoUrl, setEpVideoUrl] = useState('');
  const [epVideoType, setEpVideoType] = useState('hls');
  const [epVideoProvider, setEpVideoProvider] = useState('Studio Master');
  const [epIsPublished, setEpIsPublished] = useState(true);
  const [epIsHidden, setEpIsHidden] = useState(false);
  const [epSaving, setEpSaving] = useState(false);

  // Video Preview Modal
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [previewVideoType, setPreviewVideoType] = useState<string>('hls');
  const [previewVideoTitle, setPreviewVideoTitle] = useState<string>('');

  // Stream Purge & Rollback Section State
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgePreview, setPurgePreview] = useState<any>(null);
  const [loadingPurgePreview, setLoadingPurgePreview] = useState(false);
  const [executingPurge, setExecutingPurge] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [executingRollback, setExecutingRollback] = useState(false);

  // 1. Fetch Anime Catalog with Category assignments
  const loadAnime = async () => {
    setLoading(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/anime', { headers });
      if (res.ok) {
        const data = await res.json();
        setAnimeList(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      showFeedback('Failed to load anime list: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnime();
  }, []);

  // 2. Load Episodes for Selected Anime
  const loadEpisodes = async (animeId: string) => {
    setLoadingEpisodes(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/anime/${encodeURIComponent(animeId)}/episodes`, { headers });
      if (res.ok) {
        const data = await res.json();
        setEpisodesList(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      showFeedback('Failed to load episodes: ' + err.message, 'error');
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // 3. Search Duplicates Check
  const handleCheckDuplicates = async (query: string) => {
    setDuplicateQuery(query);
    if (!query.trim() || query.trim().length < 2) {
      setDuplicateMatches([]);
      return;
    }
    setCheckingDuplicates(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/anime/search?q=${encodeURIComponent(query.trim())}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDuplicateMatches(Array.isArray(data) ? data : []);
      }
    } catch {
      setDuplicateMatches([]);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  // 4. Open Create Modal
  const openCreateModal = () => {
    setEditingAnime(null);
    setFormTitle('');
    setFormTitleEnglish('');
    setFormTitleRomaji('');
    setFormTitleNative('');
    setFormSynopsis('');
    setFormCoverImage('');
    setFormBannerImage('');
    setFormGenres('Action, Adventure, Fantasy');
    setFormFormat('TV');
    setFormStatus('RELEASING');
    setFormSeason('SPRING');
    setFormSeasonYear(new Date().getFullYear());
    setFormEpisodes(12);
    setFormAnilistId('');
    setFormMalId('');
    setFormIsPublished(true);
    setFormIsArchived(false);
    setFormCategoryMap({
      Trending: { selected: false, order: 0 },
      Popular: { selected: false, order: 0 },
      'Recently Added': { selected: true, order: 0 },
      Movies: { selected: false, order: 0 },
      Ongoing: { selected: true, order: 0 },
      Completed: { selected: false, order: 0 },
    });
    setDuplicateMatches([]);
    setDuplicateQuery('');
    setShowAnimeModal(true);
  };

  // 5. Open Edit Modal
  const openEditModal = (anime: AdminAnimeRecord) => {
    setEditingAnime(anime);
    setFormTitle(anime.title || '');
    setFormTitleEnglish(anime.title_english || '');
    setFormTitleRomaji(anime.title_romaji || '');
    setFormTitleNative(anime.title_native || '');
    setFormSynopsis(anime.synopsis || anime.description || '');
    setFormCoverImage(anime.cover_image || '');
    setFormBannerImage(anime.banner_image || '');
    setFormGenres(anime.genres || '');
    setFormFormat(anime.format || 'TV');
    setFormStatus(anime.status || 'RELEASING');
    setFormSeason(anime.season || 'SPRING');
    setFormSeasonYear(anime.season_year || new Date().getFullYear());
    setFormEpisodes(anime.episodes || 12);
    setFormAnilistId(anime.anilist_id ? String(anime.anilist_id) : '');
    setFormMalId(anime.mal_id ? String(anime.mal_id) : '');
    setFormIsPublished(anime.is_published !== 0);
    setFormIsArchived(anime.is_archived === 1);

    const initialMap: Record<string, { selected: boolean; order: number }> = {};
    for (const cat of SITE_CATEGORIES) {
      const match = anime.categories?.find((c) => c.category.toLowerCase() === cat.toLowerCase());
      initialMap[cat] = {
        selected: Boolean(match),
        order: match ? match.display_order : 0,
      };
    }
    setFormCategoryMap(initialMap);
    setDuplicateMatches([]);
    setShowAnimeModal(true);
  };

  // 6. Save Anime Submit
  const handleSaveAnime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showFeedback('Anime title is required.', 'error');
      return;
    }

    setSavingAnime(true);
    try {
      const categoriesToSubmit: CategoryAssignment[] = [];
      for (const cat of SITE_CATEGORIES) {
        if (formCategoryMap[cat]?.selected) {
          categoriesToSubmit.push({
            category: cat,
            display_order: Number(formCategoryMap[cat].order) || 0,
          });
        }
      }

      const payload = {
        title: formTitle.trim(),
        title_english: formTitleEnglish.trim(),
        title_romaji: formTitleRomaji.trim(),
        title_native: formTitleNative.trim(),
        synopsis: formSynopsis.trim(),
        cover_image: formCoverImage.trim(),
        banner_image: formBannerImage.trim(),
        genres: formGenres.trim(),
        format: formFormat,
        status: formStatus,
        season: formSeason,
        season_year: Number(formSeasonYear) || new Date().getFullYear(),
        episodes: Number(formEpisodes) || 12,
        anilist_id: formAnilistId.trim() ? Number(formAnilistId) : null,
        mal_id: formMalId.trim() ? Number(formMalId) : null,
        is_published: formIsPublished ? 1 : 0,
        is_archived: formIsArchived ? 1 : 0,
        categories: categoriesToSubmit,
      };

      const headers = await getAdminHeaders();
      let res;
      if (editingAnime) {
        res = await fetch(`/api/admin/anime/${editingAnime.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/anime', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save anime');

      showFeedback(
        editingAnime
          ? `Updated "${payload.title}" successfully!`
          : `Created "${payload.title}" in catalog!`
      );
      setShowAnimeModal(false);
      loadAnime();
    } catch (err: any) {
      showFeedback(err.message || 'Save failed', 'error');
    } finally {
      setSavingAnime(false);
    }
  };

  // 7. Toggle Publish Anime
  const handleTogglePublish = async (anime: AdminAnimeRecord) => {
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/anime/${anime.id}/publish`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle publish status');
      showFeedback(
        `"${anime.title}" is now ${data.is_published ? 'Published' : 'Unpublished'}`
      );
      loadAnime();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  // 8. Toggle Archive Anime
  const handleToggleArchive = async (anime: AdminAnimeRecord) => {
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/anime/${anime.id}/archive`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle archive status');
      showFeedback(
        `"${anime.title}" is now ${data.is_archived ? 'Archived' : 'Unarchived'}`
      );
      loadAnime();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  // 9. Delete Anime
  const handleDeleteAnime = async (anime: AdminAnimeRecord) => {
    if (
      !confirm(
        `Are you sure you want to delete "${anime.title}" and all its category assignments and episode associations?`
      )
    ) {
      return;
    }
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/anime/${anime.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Failed to delete anime');
      showFeedback(`"${anime.title}" deleted.`);
      if (selectedAnimeForEpisodes?.id === anime.id) {
        setSelectedAnimeForEpisodes(null);
      }
      loadAnime();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  // 10. Open Episodes Management Drawer
  const openEpisodeManager = (anime: AdminAnimeRecord) => {
    setSelectedAnimeForEpisodes(anime);
    loadEpisodes(anime.id);
  };

  // 11. Open Add / Edit Episode Modal
  const openAddEpisodeModal = () => {
    if (!selectedAnimeForEpisodes) return;
    setEditingEpisode(null);
    const nextEpNum = episodesList.reduce((max, ep) => Math.max(max, ep.episode_number), 0) + 1;
    setEpSeasonNumber(1);
    setEpEpisodeNumber(nextEpNum);
    setEpTitle(`Episode ${nextEpNum}`);
    setEpReleaseDate(new Date().toISOString().split('T')[0]);
    setEpLanguage('Japanese (Sub)');
    setEpVideoUrl('');
    setEpVideoType('hls');
    setEpVideoProvider('Studio Master');
    setEpIsPublished(true);
    setEpIsHidden(false);
    setShowEpisodeModal(true);
  };

  const openEditEpisodeModal = (ep: AdminEpisodeRecord) => {
    setEditingEpisode(ep);
    setEpSeasonNumber(ep.season_number || 1);
    setEpEpisodeNumber(ep.episode_number);
    setEpTitle(ep.title || `Episode ${ep.episode_number}`);
    setEpReleaseDate(ep.release_date ? ep.release_date.split('T')[0] : '');
    setEpLanguage(ep.language || 'Japanese (Sub)');
    setEpVideoUrl(ep.video_source_url || '');
    setEpVideoType(ep.video_source_type || 'hls');
    setEpVideoProvider(ep.video_provider || 'Studio Master');
    setEpIsPublished(ep.is_published !== 0);
    setEpIsHidden(ep.is_hidden === 1);
    setShowEpisodeModal(true);
  };

  // 12. Save Episode Submit
  const handleSaveEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnimeForEpisodes) return;

    setEpSaving(true);
    try {
      const payload = {
        season_number: Number(epSeasonNumber) || 1,
        episode_number: Number(epEpisodeNumber),
        title: epTitle.trim(),
        release_date: epReleaseDate ? `${epReleaseDate}T00:00:00.000Z` : '',
        language: epLanguage,
        video_source_url: epVideoUrl.trim(),
        video_source_type: epVideoType,
        video_provider: epVideoProvider.trim(),
        is_published: epIsPublished ? 1 : 0,
        is_hidden: epIsHidden ? 1 : 0,
      };

      const headers = await getAdminHeaders();
      let res;
      if (editingEpisode) {
        res = await fetch(`/api/admin/episodes/${editingEpisode.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(
          `/api/admin/anime/${selectedAnimeForEpisodes.id}/episodes`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          }
        );
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save episode');

      showFeedback(`Episode #${payload.episode_number} saved successfully!`);
      setShowEpisodeModal(false);
      loadEpisodes(selectedAnimeForEpisodes.id);
      loadAnime();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setEpSaving(false);
    }
  };

  // 13. Delete Episode
  const handleDeleteEpisode = async (ep: AdminEpisodeRecord) => {
    if (!confirm(`Delete Episode #${ep.episode_number}: "${ep.title}"?`)) return;
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/episodes/${ep.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Delete failed');
      showFeedback(`Episode #${ep.episode_number} deleted.`);
      if (selectedAnimeForEpisodes) {
        loadEpisodes(selectedAnimeForEpisodes.id);
        loadAnime();
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  // 14. Stream Purge Preview & Execution
  const handleOpenPurgeModal = async () => {
    setShowPurgeModal(true);
    setLoadingPurgePreview(true);
    setPurgeConfirmText('');
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/streams/preview-purge', { headers });
      const data = await res.json();
      setPurgePreview(data);
    } catch (err: any) {
      showFeedback('Failed to preview stream cleanup: ' + err.message, 'error');
    } finally {
      setLoadingPurgePreview(false);
    }
  };

  const handleExecutePurge = async () => {
    if (purgeConfirmText.trim().toLowerCase() !== 'purge') {
      showFeedback('Please type "purge" to confirm the cleanup operation.', 'error');
      return;
    }
    setExecutingPurge(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/streams/purge', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Stream cleanup failed');

      showFeedback(data.message || 'Unwanted streams removed safely with backup.');
      setShowPurgeModal(false);
      loadAnime();
      if (selectedAnimeForEpisodes) {
        loadEpisodes(selectedAnimeForEpisodes.id);
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setExecutingPurge(false);
    }
  };

  const handleRollbackPurge = async () => {
    if (!confirm('Are you sure you want to rollback to the last backup snapshot?')) return;
    setExecutingRollback(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/streams/rollback', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rollback failed');
      showFeedback(data.message || 'Stream backup restored.');
      loadAnime();
      if (selectedAnimeForEpisodes) {
        loadEpisodes(selectedAnimeForEpisodes.id);
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setExecutingRollback(false);
    }
  };

  // Filter anime list
  const filteredAnime = animeList.filter((a) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle =
        a.title.toLowerCase().includes(q) ||
        (a.title_english && a.title_english.toLowerCase().includes(q)) ||
        (a.title_romaji && a.title_romaji.toLowerCase().includes(q)) ||
        (a.genres && a.genres.toLowerCase().includes(q));
      if (!matchTitle) return false;
    }
    if (categoryFilter !== 'ALL') {
      const hasCat = a.categories?.some(
        (c) => c.category.toLowerCase() === categoryFilter.toLowerCase()
      );
      if (!hasCat) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header & Primary Management Actions */}
      <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono text-[10px] font-bold uppercase">
                Catalog Operations
              </span>
            </div>
            <h2 className="text-lg font-black text-white mt-1 flex items-center gap-2">
              <Tv className="w-5 h-5 text-rose-500" />
              Anime Catalog & Category Assignment Management
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Create and edit anime entries, configure site categories with custom display order, assign episodes, and safely remove unwanted or demo streams without deleting catalog metadata.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Stream Purge Action Button */}
            <button
              onClick={handleOpenPurgeModal}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all"
              title="Preview and remove demo/placeholder video streams"
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Clean Unwanted Streams</span>
            </button>

            {/* Create New Anime Button */}
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-950/40"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Create Anime Entry</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-white/5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search catalog by title, English name, or genre..."
              className="w-full rounded-xl bg-black/40 border border-white/10 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {['ALL', ...SITE_CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                  categoryFilter === cat
                    ? 'bg-rose-600 text-white'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Anime Catalog Table */}
      <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>Catalog Entries ({filteredAnime.length})</span>
          <button
            onClick={loadAnime}
            disabled={loading}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="h-40 rounded-xl bg-white/5 animate-pulse" />
        ) : filteredAnime.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No anime entries match your search query or filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAnime.map((anime) => (
              <div
                key={anime.id}
                className={`p-4 rounded-xl bg-black/40 border transition-all flex flex-col justify-between space-y-3 ${
                  anime.is_archived
                    ? 'border-white/5 opacity-60'
                    : anime.is_published
                    ? 'border-white/10 hover:border-rose-500/30'
                    : 'border-amber-500/30 bg-amber-950/10'
                }`}
              >
                <div className="flex gap-3 min-w-0">
                  <div className="w-18 h-26 rounded-lg overflow-hidden shrink-0 bg-slate-900 border border-white/5">
                    <PosterImage
                      src={anime.cover_image}
                      alt={anime.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <h4
                        className="text-xs font-bold text-white truncate"
                        title={anime.title}
                      >
                        {anime.title}
                      </h4>
                      {anime.is_archived ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px] font-mono shrink-0">
                          Archived
                        </span>
                      ) : !anime.is_published ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-mono shrink-0">
                          Draft
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-mono shrink-0">
                          Published
                        </span>
                      )}
                    </div>

                    {anime.title_english && anime.title_english !== anime.title && (
                      <p className="text-[10px] text-slate-400 truncate">
                        {anime.title_english}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold">
                        {anime.format || 'TV'}
                      </span>
                      {anime.season && anime.season_year && (
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">
                          {anime.season} {anime.season_year}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                        {anime.episode_count || anime.episodes || 0} eps
                      </span>
                    </div>

                    {/* Category Tags */}
                    {anime.categories && anime.categories.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {anime.categories.map((c) => (
                          <span
                            key={c.category}
                            className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] text-slate-300 font-mono"
                          >
                            {c.category} (#{c.display_order})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEpisodeManager(anime)}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-all flex items-center gap-1"
                      title="Manage episodes and assign video sources"
                    >
                      <Film className="w-3 h-3" />
                      <span>Episodes ({anime.episode_count || 0})</span>
                    </button>

                    <button
                      onClick={() => openEditModal(anime)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                      title="Edit metadata and category assignments"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Toggle Publish */}
                    <button
                      onClick={() => handleTogglePublish(anime)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        anime.is_published
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                      title={anime.is_published ? 'Unpublish Anime' : 'Publish Anime'}
                    >
                      {anime.is_published ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Toggle Archive */}
                    <button
                      onClick={() => handleToggleArchive(anime)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        anime.is_archived
                          ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                      title={anime.is_archived ? 'Unarchive' : 'Archive'}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteAnime(anime)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Delete Anime Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. MODAL: CREATE / EDIT ANIME */}
      {showAnimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0e1017] border border-white/10 p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Tv className="w-5 h-5 text-rose-500" />
                  {editingAnime ? `Edit Anime: ${editingAnime.title}` : 'Create New Anime Entry'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Set catalog metadata, external IDs, and homepage category ordering.
                </p>
              </div>
              <button
                onClick={() => setShowAnimeModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Duplicate Check Warning */}
            {!editingAnime && (
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
                <label className="block text-[11px] font-mono text-slate-300 uppercase font-bold">
                  Duplicate Prevention Search:
                </label>
                <input
                  type="text"
                  value={duplicateQuery}
                  onChange={(e) => handleCheckDuplicates(e.target.value)}
                  placeholder="Check existing anime title before creating duplicates..."
                  className="w-full rounded-xl bg-black/60 border border-white/10 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                {checkingDuplicates && (
                  <p className="text-[11px] text-slate-400 font-mono">Checking catalog...</p>
                )}
                {duplicateMatches.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      Notice: Matching titles already exist in catalog!
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {duplicateMatches.map((m) => (
                        <li key={m.id}>
                          <span className="font-bold">{m.title}</span> (AniList #{m.anilist_id || 'N/A'}) -{' '}
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="underline text-amber-200 hover:text-white"
                          >
                            Edit Existing Entry
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSaveAnime} className="space-y-5">
              {/* Titles Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Primary Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Frieren: Beyond Journey's End"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    English Title
                  </label>
                  <input
                    type="text"
                    value={formTitleEnglish}
                    onChange={(e) => setFormTitleEnglish(e.target.value)}
                    placeholder="e.g. Frieren: Beyond Journey's End"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Romaji Title
                  </label>
                  <input
                    type="text"
                    value={formTitleRomaji}
                    onChange={(e) => setFormTitleRomaji(e.target.value)}
                    placeholder="e.g. Sousou no Frieren"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Native (Japanese) Title
                  </label>
                  <input
                    type="text"
                    value={formTitleNative}
                    onChange={(e) => setFormTitleNative(e.target.value)}
                    placeholder="e.g. 葬送のフリーレン"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Synopsis */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Synopsis / Description
                </label>
                <textarea
                  rows={3}
                  value={formSynopsis}
                  onChange={(e) => setFormSynopsis(e.target.value)}
                  placeholder="Anime story overview..."
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Artwork URLs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Poster Cover Image URL
                  </label>
                  <input
                    type="url"
                    value={formCoverImage}
                    onChange={(e) => setFormCoverImage(e.target.value)}
                    placeholder="https://... poster.jpg"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Banner Background Image URL
                  </label>
                  <input
                    type="url"
                    value={formBannerImage}
                    onChange={(e) => setFormBannerImage(e.target.value)}
                    placeholder="https://... banner.jpg"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Format, Status, Season, Episodes, External IDs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Format
                  </label>
                  <select
                    value={formFormat}
                    onChange={(e) => setFormFormat(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="TV">TV</option>
                    <option value="MOVIE">MOVIE</option>
                    <option value="OVA">OVA</option>
                    <option value="ONA">ONA</option>
                    <option value="SPECIAL">SPECIAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="RELEASING">RELEASING</option>
                    <option value="FINISHED">FINISHED</option>
                    <option value="NOT_YET_RELEASED">NOT YET RELEASED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Season
                  </label>
                  <select
                    value={formSeason}
                    onChange={(e) => setFormSeason(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="WINTER">WINTER</option>
                    <option value="SPRING">SPRING</option>
                    <option value="SUMMER">SUMMER</option>
                    <option value="FALL">FALL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    value={formSeasonYear}
                    onChange={(e) => setFormSeasonYear(Number(e.target.value))}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    AniList ID
                  </label>
                  <input
                    type="text"
                    value={formAnilistId}
                    onChange={(e) => setFormAnilistId(e.target.value)}
                    placeholder="e.g. 154587"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    MAL ID
                  </label>
                  <input
                    type="text"
                    value={formMalId}
                    onChange={(e) => setFormMalId(e.target.value)}
                    placeholder="e.g. 52991"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Genres */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Genres (comma-separated)
                </label>
                <input
                  type="text"
                  value={formGenres}
                  onChange={(e) => setFormGenres(e.target.value)}
                  placeholder="Action, Adventure, Fantasy, Drama"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Category Assignments with Display Order */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-white uppercase tracking-wider">
                    Site Category Assignments & Display Order
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Lower display order number appears first in category feeds
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {SITE_CATEGORIES.map((cat) => {
                    const isChecked = Boolean(formCategoryMap[cat]?.selected);
                    const orderVal = formCategoryMap[cat]?.order ?? 0;

                    return (
                      <div
                        key={cat}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                          isChecked
                            ? 'bg-rose-950/20 border-rose-500/40 text-white'
                            : 'bg-black/30 border-white/5 text-slate-400'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setFormCategoryMap({
                                ...formCategoryMap,
                                [cat]: {
                                  selected: e.target.checked,
                                  order: orderVal,
                                },
                              });
                            }}
                            className="rounded accent-rose-500"
                          />
                          <span>{cat}</span>
                        </label>

                        {isChecked && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-mono text-slate-400">Order:</span>
                            <input
                              type="number"
                              min={0}
                              max={999}
                              value={orderVal}
                              onChange={(e) => {
                                setFormCategoryMap({
                                  ...formCategoryMap,
                                  [cat]: {
                                    selected: true,
                                    order: Number(e.target.value) || 0,
                                  },
                                });
                              }}
                              className="w-14 rounded-lg bg-black/60 border border-white/10 px-2 py-1 text-xs text-white text-center font-mono focus:border-rose-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Toggles */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsPublished}
                    onChange={(e) => setFormIsPublished(e.target.checked)}
                    className="rounded accent-rose-500"
                  />
                  <span>Published (visible in catalog)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsArchived}
                    onChange={(e) => setFormIsArchived(e.target.checked)}
                    className="rounded accent-slate-500"
                  />
                  <span>Archived</span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowAnimeModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAnime}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50 disabled:opacity-50"
                >
                  {savingAnime ? 'Saving...' : editingAnime ? 'Save Changes' : 'Create Anime'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. EPISODE MANAGEMENT DRAWER FOR SELECTED ANIME */}
      {selectedAnimeForEpisodes && (
        <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/5 space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-rose-400 font-bold uppercase">
                <Film className="w-3.5 h-3.5" />
                <span>Episode Management</span>
              </div>
              <h3 className="text-lg font-black text-white mt-1">
                {selectedAnimeForEpisodes.title} — Episode Records
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Episodes are bound to this anime ID ({selectedAnimeForEpisodes.id}) to prevent accidental cross-assignment.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openAddEpisodeModal}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add Episode</span>
              </button>
              <button
                onClick={() => setSelectedAnimeForEpisodes(null)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold"
              >
                Close Drawer
              </button>
            </div>
          </div>

          {loadingEpisodes ? (
            <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          ) : episodesList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-white/10 rounded-xl space-y-2">
              <p>No episodes configured for this anime yet.</p>
              <button
                onClick={openAddEpisodeModal}
                className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
              >
                Add First Episode
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {episodesList.map((ep) => (
                <div
                  key={ep.id}
                  className="p-4 rounded-xl bg-black/40 border border-white/5 hover:border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-black/60 border border-white/10 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono">S{ep.season_number || 1}</span>
                      <span className="text-xs font-black text-rose-400 font-mono">
                        E{ep.episode_number < 10 ? `0${ep.episode_number}` : ep.episode_number}
                      </span>
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-white truncate">{ep.title}</h4>
                        {ep.is_hidden ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-mono">
                            Hidden / Unaired
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-mono">
                            Live
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono flex-wrap">
                        {ep.release_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {ep.release_date.split('T')[0]}
                          </span>
                        )}
                        <span>•</span>
                        <span>{ep.language || 'Japanese (Sub)'}</span>
                        {ep.video_source_url && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 truncate max-w-xs">
                              {ep.video_provider || 'Source'}: {ep.video_source_url}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {ep.video_source_url && (
                      <button
                        onClick={() => {
                          setPreviewVideoUrl(ep.video_source_url || '');
                          setPreviewVideoType(ep.video_source_type || 'hls');
                          setPreviewVideoTitle(ep.title);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-xs font-bold transition-all"
                        title="Preview video playback"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Preview</span>
                      </button>
                    )}

                    <button
                      onClick={() => openEditEpisodeModal(ep)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                      title="Edit Episode"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteEpisode(ep)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Delete Episode"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. MODAL: ADD / EDIT EPISODE */}
      {showEpisodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-[#0e1017] border border-white/10 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-rose-500" />
                {editingEpisode ? `Edit Episode #${editingEpisode.episode_number}` : 'Add New Episode'}
              </h3>
              <button
                onClick={() => setShowEpisodeModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEpisode} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Season #
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={epSeasonNumber}
                    onChange={(e) => setEpSeasonNumber(Number(e.target.value))}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Episode # *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={epEpisodeNumber}
                    onChange={(e) => setEpEpisodeNumber(Number(e.target.value))}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Episode Title *
                </label>
                <input
                  type="text"
                  required
                  value={epTitle}
                  onChange={(e) => setEpTitle(e.target.value)}
                  placeholder="e.g. The End of the Journey"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Release Date (Airs)
                  </label>
                  <input
                    type="date"
                    value={epReleaseDate}
                    onChange={(e) => setEpReleaseDate(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Audio Language
                  </label>
                  <select
                    value={epLanguage}
                    onChange={(e) => setEpLanguage(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="Japanese (Sub)">Japanese (Sub)</option>
                    <option value="English (Dub)">English (Dub)</option>
                  </select>
                </div>
              </div>

              {/* Video Source Assignment */}
              <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-3">
                <span className="block text-[11px] font-mono text-rose-400 font-bold uppercase">
                  Playback Video Source Assignment
                </span>

                <div>
                  <label className="block text-[11px] text-slate-300 mb-1">
                    Authorized Playback URL
                  </label>
                  <input
                    type="url"
                    value={epVideoUrl}
                    onChange={(e) => setEpVideoUrl(e.target.value)}
                    placeholder="https://... video.m3u8, video.mp4, or embed url"
                    className="w-full rounded-xl bg-black/60 border border-white/10 px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:border-rose-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">Source Type</label>
                    <select
                      value={epVideoType}
                      onChange={(e) => setEpVideoType(e.target.value)}
                      className="w-full rounded-xl bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="hls">HLS (.m3u8)</option>
                      <option value="mp4">MP4 Video</option>
                      <option value="iframe">iFrame Embed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">Provider Label</label>
                    <input
                      type="text"
                      value={epVideoProvider}
                      onChange={(e) => setEpVideoProvider(e.target.value)}
                      placeholder="e.g. Studio Master"
                      className="w-full rounded-xl bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>

                {epVideoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewVideoUrl(epVideoUrl);
                      setPreviewVideoType(epVideoType);
                      setPreviewVideoTitle(epTitle || `Episode ${epEpisodeNumber}`);
                    }}
                    className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-rose-500" />
                    <span>Test / Preview Video Before Saving</span>
                  </button>
                )}
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={epIsPublished}
                    onChange={(e) => setEpIsPublished(e.target.checked)}
                    className="rounded accent-rose-500"
                  />
                  <span>Published</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={epIsHidden}
                    onChange={(e) => setEpIsHidden(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>Hide from viewers (unaired)</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowEpisodeModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={epSaving}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  {epSaving ? 'Saving...' : 'Save Episode'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: VIDEO PREVIEW MODAL */}
      {previewVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-3xl rounded-2xl bg-[#0e1017] border border-white/10 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-rose-500 fill-rose-500" />
                  Video Preview: {previewVideoTitle || 'Episode Stream'}
                </h4>
                <p className="text-[11px] font-mono text-slate-400 truncate max-w-xl">
                  {previewVideoUrl}
                </p>
              </div>
              <button
                onClick={() => setPreviewVideoUrl(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video or iFrame Element */}
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
              {previewVideoType === 'iframe' ? (
                <iframe
                  src={previewVideoUrl}
                  title="Stream Preview"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                />
              ) : (
                <video
                  src={previewVideoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPreviewVideoUrl(null)}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Done Previewing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: STREAM CLEANUP & PURGE */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0e1017] border border-amber-500/30 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">
                  Preview & Confirm Stream Removal
                </h3>
              </div>
              <button
                onClick={() => setShowPurgeModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This process purges demo, placeholder, and unwanted stream URLs from the database.
              <strong className="text-white block mt-1">
                Anime titles, posters, descriptions, user watchlists, accounts, and provider credentials remain completely safe and untouched.
              </strong>
            </p>

            {loadingPurgePreview ? (
              <div className="p-8 text-center text-xs text-slate-400 font-mono animate-pulse">
                Scanning database for demo and placeholder video assignments...
              </div>
            ) : purgePreview ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400 font-mono">
                    <span>Total Affected Records:</span>
                    <span className="text-amber-400 font-bold">{purgePreview.totalAffected}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 font-mono">
                    <span>Video Sources Table:</span>
                    <span className="text-white">{purgePreview.videoSources?.length || 0}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 font-mono">
                    <span>Episodes Config Table:</span>
                    <span className="text-white">{purgePreview.episodesConfig?.length || 0}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 font-mono">
                    <span>QWISH Episodes (Demo CF/Samples):</span>
                    <span className="text-white">{purgePreview.qwishEpisodes?.length || 0}</span>
                  </div>
                </div>

                {/* Table of Affected Records */}
                <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 text-[11px] font-mono">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-2">ID</th>
                        <th className="p-2">Anime ID</th>
                        <th className="p-2">Title</th>
                        <th className="p-2">Provider / URL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {purgePreview.videoSources?.slice(0, 10).map((vs: any) => (
                        <tr key={vs.id} className="hover:bg-white/5">
                          <td className="p-2 text-rose-400 truncate max-w-[80px]">{vs.id}</td>
                          <td className="p-2">{vs.anime_id}</td>
                          <td className="p-2 truncate max-w-[120px]">{vs.title}</td>
                          <td className="p-2 truncate max-w-[200px] text-slate-500">{vs.url}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Confirmation Input */}
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <label className="block text-xs font-bold text-amber-300">
                    Type "purge" below to execute removal with automatic backup:
                  </label>
                  <input
                    type="text"
                    value={purgeConfirmText}
                    onChange={(e) => setPurgeConfirmText(e.target.value)}
                    placeholder="Type purge to confirm"
                    className="w-full rounded-xl bg-black/60 border border-amber-500/40 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={handleRollbackPurge}
                    disabled={executingRollback}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                    title="Restore records from previous backup"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${executingRollback ? 'animate-spin' : ''}`} />
                    <span>Rollback from Backup</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPurgeModal(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecutePurge}
                      disabled={executingPurge || purgeConfirmText.trim().toLowerCase() !== 'purge'}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all disabled:opacity-40"
                    >
                      {executingPurge ? 'Executing Purge...' : 'Confirm Purge of Unwanted Streams'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
