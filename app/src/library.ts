// Pure operations on your library. Every change to an Entry bumps updatedAt.
import type { Backup, Entry, LibraryV1, ProviderId, Show, Status } from './types';
import { effectivePlatforms } from './merge';

export const emptyLibrary = (): LibraryV1 => ({ version: 1, shows: {}, entries: {} });

function putEntry(lib: LibraryV1, e: Entry, now: number): LibraryV1 {
  return { ...lib, entries: { ...lib.entries, [e.tmdbId]: { ...e, updatedAt: now } } };
}

export function addShow(lib: LibraryV1, show: Show, status: Status = 'want', now = Date.now()): LibraryV1 {
  const existing = lib.entries[show.tmdbId];
  const withShow = { ...lib, shows: { ...lib.shows, [show.tmdbId]: show } };
  if (existing) return setStatus(withShow, show.tmdbId, status, now);
  const entry: Entry = {
    tmdbId: show.tmdbId,
    status,
    episodesWatched: status === 'watched' ? show.episodeCount ?? 0 : 0,
    addedAt: now,
    updatedAt: now,
  };
  return putEntry(withShow, entry, now);
}

export function removeShow(lib: LibraryV1, id: number): LibraryV1 {
  const shows = { ...lib.shows };
  const entries = { ...lib.entries };
  delete shows[id];
  delete entries[id];
  return { ...lib, shows, entries };
}

/** Watched fills progress; Watching from a finished show starts over. */
export function setStatus(lib: LibraryV1, id: number, status: Status, now = Date.now()): LibraryV1 {
  const e = lib.entries[id];
  if (!e) return lib;
  const total = lib.shows[id]?.episodeCount;
  let episodesWatched = e.episodesWatched;
  if (status === 'watched') episodesWatched = total ?? e.episodesWatched;
  else if (status === 'watching' && (e.status === 'watched' || (total && e.episodesWatched >= total))) episodesWatched = 0;
  return putEntry(lib, { ...e, status, episodesWatched }, now);
}

export interface EpisodeResult { lib: LibraryV1; finished: boolean }

/** Sets episodes watched. Reaching the last episode marks the show Watched. No cap when the count is unknown. */
export function setEpisodes(lib: LibraryV1, id: number, n: number, now = Date.now()): EpisodeResult {
  const e = lib.entries[id];
  if (!e) return { lib, finished: false };
  const total = lib.shows[id]?.episodeCount;
  n = Math.max(0, total ? Math.min(total, n) : n);
  if (total && n >= total) {
    return { lib: putEntry(lib, { ...e, episodesWatched: total, status: 'watched' }, now), finished: e.status !== 'watched' };
  }
  const status: Status = n > 0 ? 'watching' : e.status === 'watched' ? 'watching' : e.status;
  return { lib: putEntry(lib, { ...e, episodesWatched: n, status }, now), finished: false };
}

export function updateEntry(
  lib: LibraryV1, id: number,
  patch: Partial<Pick<Entry, 'myRating' | 'note' | 'recommendedBy' | 'platformOverride'>>,
  now = Date.now(),
): LibraryV1 {
  const e = lib.entries[id];
  if (!e) return lib;
  return putEntry(lib, { ...e, ...patch }, now);
}

/** Refresh replaces the cached Show and never touches your Entry. */
export function refreshShow(lib: LibraryV1, show: Show): LibraryV1 {
  return { ...lib, shows: { ...lib.shows, [show.tmdbId]: show } };
}

export function toBackup(lib: LibraryV1, now = new Date()): Backup {
  return { app: 'k-binge', version: 1, exportedAt: now.toISOString(), shows: lib.shows, entries: lib.entries };
}

export function isBackup(x: any): x is Backup {
  return !!x && x.app === 'k-binge' && x.version === 1 && typeof x.entries === 'object' && x.entries !== null;
}

/** Merges per entry, keeping whichever has the newer updatedAt. Returns how many entries came from the file. */
export function importBackup(lib: LibraryV1, backup: Backup): { lib: LibraryV1; imported: number } {
  const shows = { ...lib.shows };
  const entries = { ...lib.entries };
  let imported = 0;
  for (const raw of Object.values(backup.entries ?? {})) {
    const e = raw as Entry;
    if (!e || typeof e.tmdbId !== 'number') continue;
    const mine = entries[e.tmdbId];
    if (!mine || (e.updatedAt ?? 0) > (mine.updatedAt ?? 0)) {
      entries[e.tmdbId] = e;
      imported++;
    }
    const s = backup.shows?.[e.tmdbId];
    if (s && (!shows[e.tmdbId] || s.fetchedAt > shows[e.tmdbId].fetchedAt)) shows[e.tmdbId] = s;
  }
  return { lib: { ...lib, shows, entries }, imported };
}

// ---- lists ----

export type SortKey = 'recent' | 'rating' | 'imdb' | 'release';
export type TabKey = 'all' | Status;
export interface Item { show: Show; entry: Entry }

export function items(lib: LibraryV1): Item[] {
  return Object.values(lib.entries)
    .filter((e) => lib.shows[e.tmdbId])
    .map((entry) => ({ entry, show: lib.shows[entry.tmdbId] }));
}

/** Descending, with undefined values last. */
function desc<T extends number | string>(a: T | undefined, b: T | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? 1 : a > b ? -1 : 0;
}

export const SORTS: Record<SortKey, (a: Item, b: Item) => number> = {
  recent: (a, b) => b.entry.addedAt - a.entry.addedAt,
  rating: (a, b) => desc(a.entry.myRating, b.entry.myRating) || b.entry.addedAt - a.entry.addedAt,
  imdb: (a, b) => desc(a.show.imdbRating, b.show.imdbRating) || b.entry.addedAt - a.entry.addedAt,
  release: (a, b) => desc(a.show.firstAirDate, b.show.firstAirDate) || b.entry.addedAt - a.entry.addedAt,
};

export function visible(all: Item[], tab: TabKey, plat: ProviderId | 'all', sort: SortKey): Item[] {
  return all
    .filter((x) => tab === 'all' || x.entry.status === tab)
    .filter((x) => plat === 'all' || effectivePlatforms(x.show, x.entry).includes(plat))
    .sort(SORTS[sort]);
}

/**
 * Shows to base recommendations on: your best-rated and most recent watched/watching shows first,
 * then anything else on your list. Up to 6.
 */
export function recommendationSeeds(lib: LibraryV1): number[] {
  const all = Object.values(lib.entries);
  const engaged = all.filter((e) => e.status !== 'want' || (e.myRating ?? 0) >= 3.5);
  const pool = engaged.length ? engaged : all;
  return pool
    .filter((e) => e.myRating == null || e.myRating >= 3)
    .sort((a, b) => (b.myRating ?? 3.5) - (a.myRating ?? 3.5) || b.updatedAt - a.updatedAt)
    .slice(0, 6)
    .map((e) => e.tmdbId);
}

export function friendNames(lib: LibraryV1): string[] {
  const seen = new Map<string, number>();
  for (const e of Object.values(lib.entries)) {
    const n = e.recommendedBy?.trim();
    if (n) seen.set(n, Math.max(seen.get(n) ?? 0, e.updatedAt));
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}
