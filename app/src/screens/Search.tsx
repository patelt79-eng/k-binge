import { useEffect, useRef, useState } from 'react';
import { Check, Search as SearchIcon } from 'lucide-react';
import { fetchShow, popularShows, searchShows } from '../api';
import { useLibrary } from '../store';
import { useActions } from '../actions';
import { useToast } from '../components/Toast';
import { Poster } from '../components/Poster';
import { back, go, useDebounced, useOnline } from '../hooks';
import { platformSummary } from '../merge';
import type { SearchResult, Status } from '../types';

const STATUS_LABEL: Record<Status, string> = { want: 'Want', watching: 'Watching', watched: 'Watched' };

// Kept across visits so going back from a preview returns to the same results.
let lastQuery = '';
const resultCache = new Map<string, SearchResult[]>();

export function Search() {
  const [q, setQ] = useState(lastQuery);
  const query = useDebounced(q.trim(), 300);
  const online = useOnline();
  const [lib] = useLibrary();
  const actions = useActions();
  const toast = useToast();
  const [results, setResults] = useState<SearchResult[] | undefined>(() => resultCache.get(lastQuery.trim()));
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState<number>();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { lastQuery = q; }, [q]);
  useEffect(() => { input.current?.focus(); }, []);

  useEffect(() => {
    if (!online) return;
    const hit = resultCache.get(query);
    if (hit) { setResults(hit); setError(false); return; }
    const ctl = new AbortController();
    setResults(undefined);
    setError(false);
    (query ? searchShows(query, ctl.signal) : popularShows(ctl.signal))
      .then((r) => { resultCache.set(query, r); setResults(r); })
      .catch((e) => { if (e.name !== 'AbortError') setError(true); });
    return () => ctl.abort();
  }, [query, online]);

  const typing = q.trim() !== query;
  const loading = typing || (!results && !error);

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

  const heading = loading ? 'Searching TMDB…' : query ? `${results?.length ?? 0} result${results?.length === 1 ? '' : 's'}` : 'Popular K-dramas in the UK';

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
              placeholder="Search K-dramas"
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
            <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>Her saved shows work offline. Adding new ones needs a connection.</div>
          </div>
        ) : (
          <>
            <div className="label" style={{ padding: '0 20px 10px' }}>{heading}</div>
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton"><div className="a" /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><div className="b" /><div className="c" /></div></div>
              ))
            ) : error ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 14.5, lineHeight: 1.5, color: 'var(--muted)' }}>
                Couldn't reach TMDB just now. Try again in a moment.
              </div>
            ) : (
              <>
                {results!.map((r) => {
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
                {query && results!.length === 0 && (
                  <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 14.5, lineHeight: 1.5, color: 'var(--muted)' }}>
                    No K-dramas match that. Try the English or Korean title.
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
