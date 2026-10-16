export type ProviderId = 'netflix' | 'disney' | 'prime' | 'appletv' | 'iplayer' | 'itvx' | 'channel4' | 'viki';
export type Status = 'want' | 'watching' | 'watched';

export interface CastMember {
  name: string;
  character?: string;
  profilePath?: string;
}

/** Cached API data, refreshable, never edited by her. */
export interface Show {
  tmdbId: number;
  imdbId?: string;
  title: string;
  originalTitle?: string;
  posterPath?: string;
  backdropPath?: string;
  premise?: string;
  firstAirDate?: string;
  episodeCount?: number;
  seasons?: number;
  cast: CastMember[];
  providersGB: ProviderId[];
  imdbRating?: number;
  rtScore?: number;
  fetchedAt: number;
}

/** Hers. */
export interface Entry {
  tmdbId: number;
  status: Status;
  episodesWatched: number;
  myRating?: number;
  note?: string;
  recommendedBy?: string;
  platformOverride?: ProviderId[];
  addedAt: number;
  updatedAt: number;
}

export interface LibraryV1 {
  version: 1;
  shows: Record<number, Show>;
  entries: Record<number, Entry>;
}

export interface Backup {
  app: 'k-binge';
  version: 1;
  exportedAt: string;
  shows: Record<number, Show>;
  entries: Record<number, Entry>;
}

/** A row from GET /search or /popular. */
export interface SearchResult {
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  posterPath?: string;
  episodeCount?: number;
  imdbRating?: number;
  providersGB: ProviderId[];
}
