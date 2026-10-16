import type { SearchResult, Show } from './types';

export const API_URL = (import.meta.env.VITE_API_URL as string).replace(/\/$/, '');

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(API_URL + path, { signal });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export const searchShows = (q: string, signal?: AbortSignal) => get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`, signal);
export const popularShows = (signal?: AbortSignal) => get<SearchResult[]>('/popular', signal);
export const fetchShow = (id: number, signal?: AbortSignal) => get<Show>(`/show/${id}`, signal);
export const shareUrl = (id: number) => `${API_URL}/share/${id}`;
