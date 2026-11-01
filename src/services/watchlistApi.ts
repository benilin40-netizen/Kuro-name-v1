import { WatchlistItem, WatchHistoryItem, WatchlistStatus } from '../types/anime.ts';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('kuronami_auth_token') || localStorage.getItem('anivera_auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function getWatchlist(status?: WatchlistStatus | 'ALL'): Promise<WatchlistItem[]> {
  const url = status && status !== 'ALL' ? `/api/user/watchlist?status=${status}` : '/api/user/watchlist';
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function updateWatchlist(data: {
  anime_id: number;
  status: string;
  progress_episodes?: number;
  score?: number;
  notes?: string;
}): Promise<WatchlistItem> {
  const res = await fetch('/api/user/watchlist', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update watchlist');
  return res.json();
}

export async function removeFromWatchlist(animeId: number): Promise<boolean> {
  const res = await fetch(`/api/user/watchlist/${animeId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.ok;
}

export async function getFavourites(): Promise<number[]> {
  const res = await fetch('/api/user/favourites', { headers: getAuthHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function toggleFavourite(anime_id: number): Promise<boolean> {
  const res = await fetch('/api/user/favourites/toggle', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ anime_id }),
  });
  if (!res.ok) throw new Error('Failed to toggle favourite');
  const data = await res.json();
  return data.isFavourite;
}

export async function getWatchHistory(): Promise<WatchHistoryItem[]> {
  const res = await fetch('/api/user/history', { headers: getAuthHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function recordHistory(
  anime_id: number,
  episode_number: number,
  progress_seconds = 0,
  duration_seconds = 0
): Promise<void> {
  await fetch('/api/user/history', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ anime_id, episode_number, progress_seconds, duration_seconds }),
  });
}

export const watchlistApi = {
  getWatchlist,
  updateWatchlist,
  removeFromWatchlist,
  getFavourites,
  toggleFavourite,
  getWatchHistory,
  recordHistory,
};

export default watchlistApi;
