import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search as SearchIcon } from 'lucide-react';
import { browseShows, fetchShow, recommendShows, searchShows, type Discover } from '../api';
import { useLibrary } from '../store';
import { recommendationSeeds } from '../library';
import { useActions } from '../actions';
import { useToast } from '../components/Toast';
import { Poster } from '../components/Poster';
import { back, go, useDebounced, useOnline } from '../hooks';
import { platformSummary } from '../merge';
import type { ResultPage, SearchResult, Status } from '../types';

const STATUS_LABEL: Record<Status, string> = { want: 'Want', watching: 'Watching', watched: 'Watched' };
const TABS: [Discover, string][] = [['foryou', 'For you'], ['new', 'New releases'], ['uk', 'Popular in the UK'], ['all', 'All K-dramas']];
const HEADINGS: Record<Discover, string> = {
  foryou: 'Recommended for you',
  new: 'New and upcoming K-dramas',
  uk: 'Popular K-dramas in the UK',
  all: 'All K-dramas',
};

interface Listing { results: SearchResult[]; nextPage: number | null; total: number }

// Kept across visits so going back from a preview returns to the same list and scroll depth.
let lastQuery = '';
let lastTab: Discover | undefined;
const listCache = new Map<string, Listing>();

function append(prev: Listing | undefined, page: ResultPage): Listing {
  const seen = new Set(prev?.results.map((r) => r.tmdbId));
  return {
    results: [...(prev?.results ?? []), ...page.results.filter((r) => !seen.has(r.tmdbId))],
    nextPage: page.nextPage,
    total: page.totalResults,
  };
}

export function Search() {
  const [q, setQ] = useState(lastQuery);
  const query = useDebounced(q.trim(), 300);
  const online = useOnline();
  const [lib] = useLibrary();
  const actions = useActions();
  const toast = useToast();
  const seeds = useMemo(() => recommendationSeeds(lib), [lib]);
  const [tab, setTab] = useState<Discover>(() => lastTab ?? (seeds.length ? 'foryou' : 'new'));
  const input = useRef<HTMLInputElement>(null);

  // Seeds only change the key when the set changes, not on every progress tap.
  const seedKey = [...seeds].sort((a, b) => a - b).join(',');
  const key = query ? `q:${query}` : tab === 'foryou' ? `foryou:${seedKey}` : `browse:${tab}`;
  const needsSeeds = !query && tab === 'foryou' && seeds.length === 0;

  const [listing, setListing] = useState<Listing | undefined>(() => listCache.get(key));
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState<number>();

  useEffect(() => { lastQuery = q; }, [q]);
  useEffect(() => { lastTab = tab; }, [tab]);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);

  const load = (page: number, signal?: AbortSignal) =>
    query ? searchShows(query, page, signal)
      : tab === 'foryou' ? recommendShows(seeds, page, signal)
        : browseShows(tab, page, signal);

  useEffect(() => {
    if (!online || needsSeeds) return;
    const hit = listCache.get(key);
    setError(false);
    if (hit) { setListing(hit); return; }
    const ctl = new AbortController();
    setListing(undefined);
    load(1, ctl.signal)
      .then((p) => { const l = append(undefined, p); listCache.set(key, l); setListing(l); })
      .catch((e) => { if (e.name !== 'AbortError') setError(true); });
    return () => ctl.abort();
  }, [key, online, needsSeeds]); // eslint-disable-line react-hooks/exhaustive-deps

  async function showMore() {
    if (!listing?.nextPage || more) return;
    setMore(true);
    try {
      const l = append(listing, await load(listing.nextPage));
      listCache.set(key, l);
      setListing(l);
    } catch {
      toast('Needs a connection');
    } finally {
      setMore(false);
    }
  }

  async function add(r: SearchResult) {
    setAdding(r.tmdbId);
    try {
      actions.add(await fetchShow(r.tmdbId));
    } catch {
      toast('Needs a connection');
    } finally {
      setAdding(undefined);
    }
  }

  const typing = q.trim() !== query;
  const loading = !needsSeeds && (typing || (!listing && !error));
  const results = listing?.results ?? [];
  const heading = loading
    ? (query || typing ? 'Searching TMDB…' : 'Loading…')
    : query
      ? `${results.length}${listing?.nextPage ? '+' : ''} result${results.length === 1 ? '' : 's'}`
      : tab === 'all' && listing ? `All K-dramas · ${listing.total.toLocaleString('en-GB')}` : HEADINGS[tab];

  return (
    <div className="view">
      <div className="inner screen">
        <div className="search-row">
          <label className="search-box">
            <SearchIcon size={18} strokeWidth={2.2} />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search every K-drama"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="Search K-dramas"
            />
          </label>
          <button className="text-btn" onClick={() => { lastQuery = ''; back('/'); }}>Cancel</button>
        </div>

        {!online ? (
          <div className="notice">
            <div style={{ fontWeight: 700, fontSize: 16 }}>Search needs a connection</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>Your saved shows work offline. Adding new ones needs a connection.</div>
          </div>
        ) : (
          <>
            {!q.trim() && (
              <div className="hscroll chips" style={{ padding: '0 20px 16px' }} role="tablist">
                {TABS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
                ))}
              </div>
            )}
            <div className="label" style={{ padding: '0 20px 10px' }}>{heading}</div>

            {needsSeeds ? (
              <div className="notice">
                <div style={{ fontWeight: 700, fontSize: 16 }}>Recommendations start with your list</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>Add a few dramas you've watched or want to watch, rate the ones you loved, and suggestions will appear here.</div>
              </div>
            ) : loading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton"><div className="a" /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><div className="b" /><div className="c" /></div></div>
              ))
            ) : error ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 14.5, lineHeight: 1.5, color: 'var(--muted)' }}>
                Couldn't reach TMDB just now. Try again in a moment.
              </div>
            ) : (
              <>
                {results.map((r) => {
                  const entry = lib.entries[r.tmdbId];
                  const plat = platformSummary(r.providersGB);
                  const meta = [r.year, r.episodeCount ? `${r.episodeCount} episodes` : null, r.imdbRating != null ? `IMDb ${r.imdbRating.toFixed(1)}` : null].filter(Boolean).join(' · ');
                  return (
                    <div key={r.tmdbId} className="result">
                      <button onClick={() => go(`/show/${r.tmdbId}`)} aria-label={`Preview ${r.title}`} style={{ flex: 'none' }}>
                        <Poster title={r.title} path={r.posterPath} size="w185" label={false} className="thumb" />
                      </button>
                      <button className="body" onClick={() => go(`/show/${r.tmdbId}`)}>
                        <div className="title">{r.title}</div>
                        {meta && <div className="meta">{meta}</div>}
                        <div className="plat"><span className="dot" style={{ background: plat.dot }} />{plat.label}</div>
                      </button>
                      {entry ? (
                        <div className="inlib"><Check size={14} strokeWidth={3} />{STATUS_LABEL[entry.status]}</div>
                      ) : (
                        <button className="pill-acc add" disabled={adding === r.tmdbId} onClick={() => add(r)} style={{ opacity: adding === r.tmdbId ? 0.6 : 1 }}>
                          {adding === r.tmdbId ? 'Adding…' : 'Add'}
                        </button>
                      )}
                    </div>
                  );
                })}
                {listing?.nextPage ? (
                  <div style={{ padding: '14px 20px 0' }}>
                    <button className="more-btn" onClick={showMore} disabled={more}>{more ? 'Loading…' : 'Show more'}</button>
                  </div>
                ) : null}
                {results.length === 0 && (
                  <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 14.5, lineHeight: 1.5, color: 'var(--muted)' }}>
                    {query ? 'No K-dramas match that. Try the English or Korean title.' : 'Nothing here right now.'}
                  </div>
                )}
              </>
            )}
          </>
        )}
        <div style={{ padding: '24px 20px 0', fontSize: 11.5, color: 'var(--faint)', textAlign: 'center' }}>Search by TMDB · Where to watch powered by JustWatch</div>
      </div>
    </div>
  );
}
