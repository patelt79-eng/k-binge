import type { ResultPage, Show } from './types';

export const API_URL = (import.meta.env.VITE_API_URL as string).replace(/\/$/, '');

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(API_URL + path, { signal });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export type Discover = 'foryou' | 'new' | 'uk' | 'all';

export const searchShows = (q: string, page = 1, signal?: AbortSignal) =>
  get<ResultPage>(`/search?q=${encodeURIComponent(q)}&page=${page}`, signal);
export const browseShows = (scope: Exclude<Discover, 'foryou'>, page = 1, signal?: AbortSignal) =>
  get<ResultPage>(`/browse?scope=${scope}&page=${page}`, signal);
/** Seeds are sorted so the same library hits the same cached response. */
export const recommendShows = (seeds: number[], page = 1, signal?: AbortSignal) =>
  get<ResultPage>(`/recommend?ids=${[...seeds].sort((a, b) => a - b).join(',')}&page=${page}`, signal);
export const fetchShow = (id: number, signal?: AbortSignal) => get<Show>(`/show/${id}`, signal);
export const shareUrl = (id: number) => `${API_URL}/share/${id}`;
