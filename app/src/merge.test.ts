import { describe, expect, it } from 'vitest';
import { effectivePlatforms, mapProviders, mergeShow, parseRt, platformSummary, premiseOf, episodesLabel, imdbLabel, rtLabel, placeholderColor } from './merge';
import { addShow, importBackup, refreshShow, setEpisodes, setStatus, toBackup, updateEntry, emptyLibrary, visible, items, recommendationSeeds } from './library';
import type { Show } from './types';

const tmdbFixture = (over: any = {}) => ({
  id: 215720,
  name: 'Queen of Tears',
  original_name: '눈물의 여왕',
  poster_path: '/p.jpg',
  backdrop_path: '/b.jpg',
  overview: 'A marriage in crisis.',
  first_air_date: '2024-03-09',
  number_of_episodes: 16,
  number_of_seasons: 1,
  external_ids: { imdb_id: 'tt27668559' },
  credits: { cast: Array.from({ length: 9 }, (_, i) => ({ name: `Actor ${i}`, character: `Role ${i}`, profile_path: null })) },
  'watch/providers': { results: { GB: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } } },
  ...over,
});

const show = (over: Partial<Show> = {}): Show => ({
  tmdbId: 1, title: 'Show', cast: [], providersGB: ['netflix'], episodeCount: 16, fetchedAt: 1, ...over,
});

describe('provider mapping', () => {
  it('maps names to ProviderId, dedupes, ignores unknowns', () => {
    const gb = {
      flatrate: [
        { provider_id: 8, provider_name: 'Netflix' },
        { provider_id: 1796, provider_name: 'Netflix Standard with Ads' },
        { provider_id: 9999, provider_name: 'Netflix basic with Ads' },
        { provider_id: 9, provider_name: 'Amazon Prime Video' },
        { provider_id: 2100, provider_name: 'Amazon Prime Video with Ads' },
        { provider_id: 2709, provider_name: 'CJ ENM Selects Amazon Channel' },
        { provider_id: 1899, provider_name: 'HBO Max' },
        { provider_id: 337, provider_name: 'Disney Plus' },
        { provider_id: 350, provider_name: 'Apple TV' },
        { provider_id: 1, provider_name: 'Apple TV+' },
        { provider_id: 38, provider_name: 'BBC iPlayer' },
        { provider_id: 41, provider_name: 'ITVX' },
        { provider_id: 103, provider_name: 'Channel 4' },
        { provider_id: 5, provider_name: 'Rakuten Viki' },
      ],
    };
    expect(mapProviders(gb)).toEqual(['netflix', 'disney', 'prime', 'appletv', 'iplayer', 'itvx', 'channel4', 'viki']);
  });

  it('ignores rent and buy', () => {
    const gb: any = { rent: [{ provider_id: 2, provider_name: 'Apple TV Store' }], buy: [{ provider_id: 10, provider_name: 'Amazon Video' }] };
    expect(mapProviders(gb)).toEqual([]);
    expect(mapProviders(undefined)).toEqual([]);
  });

  it('falls back to known IDs when a name changes', () => {
    expect(mapProviders({ flatrate: [{ provider_id: 337, provider_name: 'Disney+ Renamed' }] })).toEqual(['disney']);
  });

  it('does not match Apple TV Store or channel add-ons', () => {
    expect(mapProviders({ flatrate: [{ provider_id: 2, provider_name: 'Apple TV Store' }, { provider_id: 2243, provider_name: 'Apple TV Amazon Channel' }] })).toEqual([]);
  });
});

describe('ratings', () => {
  it('parses RT from OMDb Ratings', () => {
    expect(parseRt([{ Source: 'Internet Movie Database', Value: '8.2/10' }, { Source: 'Rotten Tomatoes', Value: '98%' }])).toBe(98);
    expect(parseRt([{ Source: 'Internet Movie Database', Value: '8.2/10' }])).toBeUndefined();
    expect(parseRt(undefined)).toBeUndefined();
  });

  it('reads imdbRating and treats N/A as undefined', () => {
    expect(mergeShow(tmdbFixture(), { Response: 'True', imdbRating: '8.2', Ratings: [] }).imdbRating).toBe(8.2);
    const s = mergeShow(tmdbFixture(), { Response: 'True', imdbRating: 'N/A', Ratings: [] });
    expect(s.imdbRating).toBeUndefined();
    expect(s.rtScore).toBeUndefined();
  });

  it('survives OMDb failure with TMDB data only', () => {
    const s = mergeShow(tmdbFixture(), undefined);
    expect(s.title).toBe('Queen of Tears');
    expect(s.imdbRating).toBeUndefined();
    expect(mergeShow(tmdbFixture(), { Response: 'False', Error: 'Invalid API key!' }).imdbRating).toBeUndefined();
  });

  it('keeps top 6 cast', () => {
    expect(mergeShow(tmdbFixture()).cast).toHaveLength(6);
  });
});

describe('platform override', () => {
  it('wins when non-empty', () => {
    expect(effectivePlatforms(show(), { platformOverride: ['viki'] })).toEqual(['viki']);
  });
  it('empty override falls back to TMDB', () => {
    expect(effectivePlatforms(show(), { platformOverride: [] })).toEqual(['netflix']);
    expect(effectivePlatforms(show(), {})).toEqual(['netflix']);
  });
  it('survives a refresh', () => {
    let lib = addShow(emptyLibrary(), show(), 'want', 10);
    lib = updateEntry(lib, 1, { platformOverride: ['viki'] }, 20);
    lib = refreshShow(lib, show({ providersGB: ['prime'], fetchedAt: 99 }));
    expect(effectivePlatforms(lib.shows[1], lib.entries[1])).toEqual(['viki']);
  });
});

describe('refresh', () => {
  it('replaces Show but never touches Entry', () => {
    let lib = addShow(emptyLibrary(), show(), 'watching', 10);
    lib = setEpisodes(lib, 1, 5, 20).lib;
    lib = updateEntry(lib, 1, { myRating: 4.5, note: 'Lovely', recommendedBy: 'Mina' }, 30);
    const before = lib.entries[1];
    const fresh = show({ title: 'Show (renamed)', imdbRating: 9, fetchedAt: 100 });
    lib = refreshShow(lib, fresh);
    expect(lib.shows[1]).toBe(fresh);
    expect(lib.entries[1]).toBe(before);
  });
});

describe('progress and status', () => {
  it('reaching last episode sets status watched', () => {
    let lib = addShow(emptyLibrary(), show(), 'watching', 1);
    const r = setEpisodes(lib, 1, 16, 2);
    expect(r.finished).toBe(true);
    expect(r.lib.entries[1].status).toBe('watched');
    expect(r.lib.entries[1].episodesWatched).toBe(16);
    lib = setEpisodes(r.lib, 1, 99, 3).lib;
    expect(lib.entries[1].episodesWatched).toBe(16);
  });

  it('setting watched sets episodesWatched = episodeCount', () => {
    let lib = addShow(emptyLibrary(), show(), 'want', 1);
    lib = setStatus(lib, 1, 'watched', 2);
    expect(lib.entries[1].episodesWatched).toBe(16);
    expect(addShow(emptyLibrary(), show(), 'watched').entries[1].episodesWatched).toBe(16);
  });

  it('watching from watched resets progress', () => {
    let lib = addShow(emptyLibrary(), show(), 'watched', 1);
    lib = setStatus(lib, 1, 'watching', 2);
    expect(lib.entries[1].episodesWatched).toBe(0);
  });

  it('+1 without cap when the count is unknown', () => {
    let lib = addShow(emptyLibrary(), show({ episodeCount: undefined }), 'watching', 1);
    for (let i = 1; i <= 30; i++) lib = setEpisodes(lib, 1, i, i + 1).lib;
    expect(lib.entries[1].episodesWatched).toBe(30);
    expect(lib.entries[1].status).toBe('watching');
  });

  it('bumps updatedAt on every change', () => {
    let lib = addShow(emptyLibrary(), show(), 'want', 1);
    lib = updateEntry(lib, 1, { note: 'x' }, 50);
    expect(lib.entries[1].updatedAt).toBe(50);
  });
});

describe('import', () => {
  it('keeps the newer updatedAt per entry', () => {
    let mine = addShow(emptyLibrary(), show({ tmdbId: 1 }), 'want', 100);
    mine = addShow(mine, show({ tmdbId: 2 }), 'want', 100);
    let theirs = addShow(emptyLibrary(), show({ tmdbId: 1 }), 'watched', 50); // older
    theirs = addShow(theirs, show({ tmdbId: 2 }), 'watched', 200); // newer
    theirs = addShow(theirs, show({ tmdbId: 3 }), 'watching', 10); // new
    const { lib, imported } = importBackup(mine, toBackup(theirs));
    expect(imported).toBe(2);
    expect(lib.entries[1].status).toBe('want');
    expect(lib.entries[2].status).toBe('watched');
    expect(lib.entries[3].status).toBe('watching');
    expect(lib.shows[3]).toBeDefined();
  });
});

describe('fallbacks', () => {
  it('missing poster/premise/episodes produce defined fallbacks', () => {
    const s = mergeShow(tmdbFixture({ poster_path: null, backdrop_path: null, overview: '', number_of_episodes: 0, external_ids: {}, credits: undefined, 'watch/providers': undefined, first_air_date: '' }));
    expect(s.posterPath).toBeUndefined();
    expect(s.episodeCount).toBeUndefined();
    expect(s.cast).toEqual([]);
    expect(s.providersGB).toEqual([]);
    expect(premiseOf(s)).toBe('No premise available yet.');
    expect(episodesLabel(s.episodeCount)).toBe('Episodes TBC');
    expect(imdbLabel(s.imdbRating)).toBe('—');
    expect(rtLabel(s.rtScore)).toBe('No score');
    expect(platformSummary([])).toEqual({ label: 'Platform not set', dot: '#6E6879' });
    expect(placeholderColor(s.title)).toMatch(/^oklch\(/);
  });
});

describe('lists', () => {
  it('sorts undefined values last', () => {
    let lib = emptyLibrary();
    lib = addShow(lib, show({ tmdbId: 1, imdbRating: undefined }), 'want', 1);
    lib = addShow(lib, show({ tmdbId: 2, imdbRating: 8 }), 'want', 2);
    lib = addShow(lib, show({ tmdbId: 3, imdbRating: 9 }), 'want', 3);
    expect(visible(items(lib), 'all', 'all', 'imdb').map((x) => x.show.tmdbId)).toEqual([3, 2, 1]);
  });
});

describe('recommendation seeds', () => {
  it('prefers rated and watched shows, skips ones you disliked, max 6', () => {
    let lib = emptyLibrary();
    lib = addShow(lib, show({ tmdbId: 1 }), 'watched', 1);
    lib = updateEntry(lib, 1, { myRating: 5 }, 2);
    lib = addShow(lib, show({ tmdbId: 2 }), 'watched', 3);
    lib = updateEntry(lib, 2, { myRating: 1.5 }, 4); // disliked
    lib = addShow(lib, show({ tmdbId: 3 }), 'want', 5);
    lib = addShow(lib, show({ tmdbId: 4 }), 'watching', 6);
    const seeds = recommendationSeeds(lib);
    expect(seeds[0]).toBe(1);
    expect(seeds).toContain(4);
    expect(seeds).not.toContain(2);
    expect(seeds).not.toContain(3);
    for (let i = 10; i < 20; i++) lib = addShow(lib, show({ tmdbId: i }), 'watched', i);
    expect(recommendationSeeds(lib)).toHaveLength(6);
  });

  it('falls back to want-to-watch shows when nothing is watched yet', () => {
    const lib = addShow(emptyLibrary(), show({ tmdbId: 7 }), 'want', 1);
    expect(recommendationSeeds(lib)).toEqual([7]);
    expect(recommendationSeeds(emptyLibrary())).toEqual([]);
  });
});
