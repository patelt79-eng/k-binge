// Pure data shaping shared by the app and the Worker: TMDB + OMDb → Show,
// provider mapping, and the fallbacks the UI relies on.
import type { Entry, ProviderId, Show } from './types';

export const PROVIDERS: Record<ProviderId, { label: string; dot: string }> = {
  netflix: { label: 'Netflix', dot: '#E50914' },
  disney: { label: 'Disney+', dot: '#3D6BFF' },
  prime: { label: 'Prime Video', dot: '#1FA9E5' },
  appletv: { label: 'Apple TV+', dot: '#C9CDD2' },
  iplayer: { label: 'BBC iPlayer', dot: '#FF4FA3' },
  itvx: { label: 'ITVX', dot: '#D8EC4E' },
  channel4: { label: 'Channel 4', dot: '#7FE0C2' },
  viki: { label: 'Viki', dot: '#2EC6FF' },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export const UNKNOWN_DOT = '#6E6879';

// Name rules first (TMDB provider IDs drift); IDs are the fallback.
// Amazon/Apple "Channel" add-ons are separate subscriptions, so they are not matched.
const NAME_RULES: [RegExp, ProviderId][] = [
  [/^netflix\b/, 'netflix'],
  [/^disney\s*(\+|plus)/, 'disney'],
  [/^amazon prime video\b(?!.*channel)/, 'prime'],
  [/^apple tv(\+|\s*plus)?$/, 'appletv'],
  [/^bbc iplayer$/, 'iplayer'],
  [/^itvx( premium)?$/, 'itvx'],
  [/^channel 4$/, 'channel4'],
  [/^(rakuten )?viki$/, 'viki'],
];
// GB IDs as listed by TMDB /watch/providers/tv?watch_region=GB (Oct 2026). Viki isn't listed in GB.
const ID_FALLBACK: Record<number, ProviderId> = {
  8: 'netflix', 175: 'netflix', 1796: 'netflix', 337: 'disney', 9: 'prime', 2100: 'prime',
  350: 'appletv', 38: 'iplayer', 41: 'itvx', 2300: 'itvx', 103: 'channel4',
};

export interface TmdbProvider { provider_id: number; provider_name: string }

export function mapProvider(p: TmdbProvider): ProviderId | undefined {
  const name = (p.provider_name ?? '').trim().toLowerCase();
  for (const [re, id] of NAME_RULES) if (re.test(name)) return id;
  if (name.includes('channel')) return undefined;
  return ID_FALLBACK[p.provider_id];
}

/** Flatrate only; rent/buy/ads are ignored. Deduped, in our canonical order. */
export function mapProviders(gb: { flatrate?: TmdbProvider[] } | undefined): ProviderId[] {
  const found = new Set<ProviderId>();
  for (const p of gb?.flatrate ?? []) {
    const id = mapProvider(p);
    if (id) found.add(id);
  }
  return PROVIDER_IDS.filter((id) => found.has(id));
}

export function parseImdbRating(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function parseRt(ratings: { Source: string; Value: string }[] | undefined): number | undefined {
  const rt = ratings?.find((r) => r.Source === 'Rotten Tomatoes');
  const n = rt ? parseInt(rt.Value, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

const nonEmpty = (s: unknown): string | undefined =>
  typeof s === 'string' && s.trim() ? s.trim() : undefined;

/** TMDB `/tv/:id?append_to_response=credits,external_ids,watch/providers` + optional OMDb → Show. */
export function mergeShow(tmdb: any, omdb?: any, now = Date.now()): Show {
  const omdbOk = omdb && omdb.Response !== 'False';
  const eps = Number(tmdb.number_of_episodes);
  return {
    tmdbId: tmdb.id,
    imdbId: nonEmpty(tmdb.external_ids?.imdb_id),
    title: nonEmpty(tmdb.name) ?? nonEmpty(tmdb.original_name) ?? 'Untitled',
    originalTitle: nonEmpty(tmdb.original_name),
    posterPath: nonEmpty(tmdb.poster_path),
    backdropPath: nonEmpty(tmdb.backdrop_path),
    premise: nonEmpty(tmdb.overview),
    firstAirDate: nonEmpty(tmdb.first_air_date),
    episodeCount: eps > 0 ? eps : undefined,
    seasons: Number(tmdb.number_of_seasons) || undefined,
    cast: (tmdb.credits?.cast ?? []).slice(0, 6).map((c: any) => ({
      name: c.name,
      character: nonEmpty(c.character),
      profilePath: nonEmpty(c.profile_path),
    })),
    providersGB: mapProviders(tmdb['watch/providers']?.results?.GB),
    imdbRating: omdbOk ? parseImdbRating(omdb.imdbRating) : undefined,
    rtScore: omdbOk ? parseRt(omdb.Ratings) : undefined,
    fetchedAt: now,
  };
}

/** Her override wins when non-empty; otherwise what TMDB/JustWatch says. */
export function effectivePlatforms(show: Pick<Show, 'providersGB'> | undefined, entry?: Pick<Entry, 'platformOverride'>): ProviderId[] {
  if (entry?.platformOverride?.length) return entry.platformOverride;
  return show?.providersGB ?? [];
}

export function platformSummary(plats: ProviderId[]): { label: string; dot: string } {
  const p0 = plats[0];
  if (!p0) return { label: 'Platform not set', dot: UNKNOWN_DOT };
  return { label: PROVIDERS[p0].label + (plats.length > 1 ? ` +${plats.length - 1}` : ''), dot: PROVIDERS[p0].dot };
}

// ---- display fallbacks ----

export const premiseOf = (s: Pick<Show, 'premise'>) => s.premise || 'No premise available yet.';
export const yearOf = (s: Pick<Show, 'firstAirDate'>) => s.firstAirDate?.slice(0, 4);
export const episodesLabel = (n?: number) => (n ? `${n} episodes` : 'Episodes TBC');
export const imdbLabel = (r?: number) => (r != null ? r.toFixed(1) : '—');
export const rtLabel = (r?: number) => (r != null ? `${r}%` : 'No score');

/** Stable hue from the title, for poster placeholders. */
export function titleHue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return h % 360;
}
export const placeholderColor = (title: string, l = 0.36) => `oklch(${l} 0.085 ${titleHue(title)})`;

export const TMDB_IMG = 'https://image.tmdb.org/t/p/';
export const tmdbImg = (path: string | undefined, size: 'w185' | 'w342' | 'w780') =>
  path ? `${TMDB_IMG}${size}${path}` : undefined;
