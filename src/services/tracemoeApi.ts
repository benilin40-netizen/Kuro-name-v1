import { TraceMoeResultItem } from '../types/anime.ts';

export async function searchTraceMoeByUrl(imageUrl: string, anilistFilter?: number): Promise<TraceMoeResultItem[]> {
  try {
    let endpoint = `/api/tracemoe/search?url=${encodeURIComponent(imageUrl)}`;
    if (anilistFilter && anilistFilter > 0) {
      endpoint += `&anilistID=${anilistFilter}`;
    }
    const res = await fetch(endpoint);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Trace.moe error HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.result || [];
  } catch (err: any) {
    console.warn('[TRACEMOE API CLIENT]', err.message);
    throw err;
  }
}

export async function searchTraceMoeByFile(file: File, anilistFilter?: number): Promise<TraceMoeResultItem[]> {
  try {
    const formData = new FormData();
    formData.append('image', file);
    if (anilistFilter && anilistFilter > 0) {
      formData.append('anilistID', String(anilistFilter));
    }

    const res = await fetch('/api/tracemoe/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Trace.moe error HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.result || [];
  } catch (err: any) {
    console.warn('[TRACEMOE API CLIENT]', err.message);
    throw err;
  }
}

export const TraceMoeAPI = {
  searchByUrl: searchTraceMoeByUrl,
  searchByFile: searchTraceMoeByFile,
};
