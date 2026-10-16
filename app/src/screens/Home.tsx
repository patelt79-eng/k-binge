import { useMemo, useState } from 'react';
import { ArrowUpDown, Check, Menu, Plus, Share, X } from 'lucide-react';
import { useLibrary, usePrefs, setPrefs } from '../store';
import { items, visible, type SortKey, type TabKey } from '../library';
import { PROVIDERS, PROVIDER_IDS, effectivePlatforms, platformSummary } from '../merge';
import { Poster } from '../components/Poster';
import { useActions } from '../actions';
import { go, isIosSafari, useOnline } from '../hooks';
import type { Entry, Show } from '../types';

const TABS: [TabKey, string][] = [['all', 'All'], ['watching', 'Watching'], ['want', 'Want to watch'], ['watched', 'Watched']];
const SORTS: [SortKey, string, string][] = [['recent', 'Recent', 'Recently added'], ['rating', 'Your rating', 'Your rating'], ['imdb', 'IMDb', 'IMDb rating'], ['release', 'Newest', 'Release date']];

export const fmtRating = (r?: number) => (r ? `★ ${r % 1 ? r.toFixed(1) : r}` : '');

export function Home() {
  const [lib] = useLibrary();
  const prefs = usePrefs();
  const online = useOnline();
  const actions = useActions();
  const [sortOpen, setSortOpen] = useState(false);
  const [showInstall] = useState(() => isIosSafari());

  const all = useMemo(() => items(lib), [lib]);
  const grid = useMemo(() => visible(all, prefs.tab, prefs.plat, prefs.sort), [all, prefs.tab, prefs.plat, prefs.sort]);
  const cont = useMemo(
    () => all.filter((x) => x.entry.status === 'watching').sort((a, b) => b.entry.updatedAt - a.entry.updatedAt),
    [all],
  );
  const count = (k: TabKey) => (k === 'all' ? all.length : all.filter((x) => x.entry.status === k).length);
  const empty = all.length === 0;
  const open = (id: number) => go(`/show/${id}`);

  return (
    <div className="screen">
      <div className="header">
        <h1>K-Binge</h1>
        <button className="circle-btn" style={{ background: 'var(--s1)' }} onClick={() => go('/settings')} aria-label="Settings">
          <Menu size={20} strokeWidth={2} />
        </button>
        <button className="circle-btn" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }} onClick={() => go('/search')} aria-label="Add a drama">
          <Plus size={20} strokeWidth={2.4} />
        </button>
      </div>

      {!online && (
        <div className="banner">
          <span className="dot" style={{ width: 8, height: 8, background: '#E8B860' }} />
          <span>Offline. Your saved list and progress still work and will sync when you're back online.</span>
        </div>
      )}

      {showInstall && !prefs.installDismissed && (
        <div className="install">
          <div className="tile">K</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, paddingRight: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>Add K-Binge to your Home Screen</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--muted2)' }}>
              Tap <Share size={15} strokeWidth={2.2} color="var(--acc-tx)" style={{ verticalAlign: '-2px' }} /> in Safari, then{' '}
              <b style={{ color: 'var(--text)', fontWeight: 600 }}>Add to Home Screen</b>. It then opens full screen and works offline.
            </div>
          </div>
          <button className="close" onClick={() => setPrefs({ installDismissed: true })} aria-label="Dismiss">
            <X size={14} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {prefs.showContinue && cont.length > 0 && (
        <>
          <div className="label" style={{ padding: '4px 20px 10px', fontSize: 13, lineHeight: 1 }}>Continue watching</div>
          <div className="hscroll cont">
            {cont.map(({ show, entry }) => (
              <ContinueCard key={show.tmdbId} show={show} entry={entry} onOpen={() => open(show.tmdbId)} onPlus={() => actions.setEpisodes(show.tmdbId, entry.episodesWatched + 1)} />
            ))}
          </div>
        </>
      )}

      <div className="hscroll tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={prefs.tab === k} className={`tab${prefs.tab === k ? ' on' : ''}`} onClick={() => setPrefs({ tab: k })}>
            {label}<span>{count(k)}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <div className="hscroll chips">
          <button className={`chip${prefs.plat === 'all' ? ' on' : ''}`} onClick={() => setPrefs({ plat: 'all' })}>All platforms</button>
          {PROVIDER_IDS.map((id) => {
            const on = prefs.plat === id;
            return (
              <button key={id} className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setPrefs({ plat: on ? 'all' : id })}>
                <span className="dot" style={{ background: PROVIDERS[id].dot }} />
                {PROVIDERS[id].label}
              </button>
            );
          })}
        </div>
        <div className="sort">
          <button className="sort-btn" onClick={() => setSortOpen((o) => !o)} aria-haspopup="menu" aria-expanded={sortOpen}>
            <ArrowUpDown size={14} strokeWidth={2.2} />
            {SORTS.find((s) => s[0] === prefs.sort)![1]}
          </button>
          {sortOpen && (
            <div className="menu" role="menu">
              {SORTS.map(([k, , label]) => (
                <button key={k} role="menuitemradio" aria-checked={prefs.sort === k} className={prefs.sort === k ? 'on' : ''} onClick={() => { setPrefs({ sort: k }); setSortOpen(false); }}>
                  <span>{label}</span>
                  {prefs.sort === k && <Check size={15} strokeWidth={3} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {sortOpen && <div className="scrim" onClick={() => setSortOpen(false)} />}

      {grid.length > 0 ? (
        <div className="grid">
          {grid.map(({ show, entry }) => (
            <GridCard key={show.tmdbId} show={show} entry={entry} onOpen={() => open(show.tmdbId)} onCheck={() => actions.toggleWatched(show.tmdbId, entry.status)} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>{empty ? 'Your list is empty' : 'Nothing here yet'}</h2>
          <p>
            {empty
              ? 'Search for a K-drama and add it in one tap. Posters, cast and UK platforms fill in automatically.'
              : prefs.plat !== 'all'
                ? `No shows here on ${PROVIDERS[prefs.plat].label}. Try all platforms.`
                : 'Shows land here as you change their status.'}
          </p>
          <button className="pill-acc" onClick={() => go('/search')}>Find a drama</button>
        </div>
      )}

      <div className="footer-credit">Where to watch powered by JustWatch</div>
    </div>
  );
}

function ContinueCard({ show, entry, onOpen, onPlus }: { show: Show; entry: Entry; onOpen: () => void; onPlus: () => void }) {
  const plat = platformSummary(effectivePlatforms(show, entry));
  const total = show.episodeCount;
  const pct = total ? Math.round((entry.episodesWatched / total) * 100) : 0;
  return (
    <div className="cont-card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Poster title={show.title} path={show.posterPath} size="w185" label={false} style={{ flex: 'none', width: 62, height: 93, borderRadius: 9 }} className="" />
      <div className="meta">
        <div className="ellipsis" style={{ font: '600 15px/1.2 var(--body)' }}>{show.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
          <span className="dot" style={{ background: plat.dot }} />
          <span className="ellipsis">{plat.label}</span>
        </div>
        {total ? <div className="track"><div style={{ width: `${pct}%` }} /></div> : <div style={{ height: 4 }} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13 }}>{total ? `Ep ${entry.episodesWatched} of ${total}` : `Ep ${entry.episodesWatched}`}</span>
          <button className="plus-ep" onClick={(e) => { e.stopPropagation(); onPlus(); }}>+1 ep</button>
        </div>
      </div>
    </div>
  );
}

function GridCard({ show, entry, onOpen, onCheck }: { show: Show; entry: Entry; onOpen: () => void; onCheck: () => void }) {
  const plat = platformSummary(effectivePlatforms(show, entry));
  const watched = entry.status === 'watched';
  const total = show.episodeCount;
  return (
    <div className="card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Poster title={show.title} path={show.posterPath}>
        <button
          className="check-hit"
          onClick={(e) => { e.stopPropagation(); onCheck(); }}
          aria-label={watched ? `Mark ${show.title} as not watched` : `Mark ${show.title} as watched`}
          aria-pressed={watched}
        >
          <span className={`check${watched ? ' on' : ''}`}>{watched && <Check size={15} strokeWidth={3.2} />}</span>
        </button>
        {entry.status === 'watching' && (
          <>
            <div className="ep-badge">{total ? `${entry.episodesWatched}/${total}` : `Ep ${entry.episodesWatched}`}</div>
            {total ? <div className="poster-bar"><div style={{ width: `${Math.round((entry.episodesWatched / total) * 100)}%` }} /></div> : null}
          </>
        )}
      </Poster>
      <div className="card-title">{show.title}</div>
      <div className="card-sub">
        <span className="dot" style={{ background: plat.dot }} />
        <span className="ellipsis" style={{ flex: 1, minWidth: 0 }}>{plat.label}</span>
        {entry.myRating ? <span className="mine">{fmtRating(entry.myRating)}</span> : null}
      </div>
    </div>
  );
}
