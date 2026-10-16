import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Minus, Plus, Share } from 'lucide-react';
import { fetchShow } from '../api';
import { useLibrary } from '../store';
import { friendNames } from '../library';
import { useActions } from '../actions';
import { useToast } from '../components/Toast';
import { Poster } from '../components/Poster';
import { PlatformSheet } from '../components/PlatformSheet';
import { back } from '../hooks';
import { shareShow } from '../share';
import { PROVIDERS, effectivePlatforms, episodesLabel, imdbLabel, premiseOf, rtLabel, tmdbImg, yearOf } from '../merge';
import { fmtRating } from './Home';
import type { Entry, Show, Status } from '../types';

export function Detail({ id }: { id: number }) {
  const [lib] = useLibrary();
  const saved = lib.shows[id];
  const entry = lib.entries[id];
  const [fetched, setFetched] = useState<Show>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (saved) return;
    const ctl = new AbortController();
    setFailed(false);
    fetchShow(id, ctl.signal).then(setFetched).catch((e) => e.name !== 'AbortError' && setFailed(true));
    return () => ctl.abort();
  }, [id, saved]);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  const show = saved ?? fetched;
  return (
    <div className="view" key={id}>
      {show ? (
        <DetailBody show={show} entry={entry} />
      ) : (
        <>
          <button className="hero-btn" style={{ left: 16 }} onClick={() => back('/')} aria-label="Back"><ChevronLeft size={22} strokeWidth={2.4} /></button>
          <div className="loading-center">
            {failed ? (
              <div className="notice" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Couldn't load this show</div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>Adding new shows needs a connection.</div>
              </div>
            ) : 'Loading…'}
          </div>
        </>
      )}
    </div>
  );
}

function DetailBody({ show, entry }: { show: Show; entry?: Entry }) {
  const [lib] = useLibrary();
  const actions = useActions();
  const toast = useToast();
  const [platEdit, setPlatEdit] = useState(false);
  const id = show.tmdbId;
  const inLib = !!entry;
  const plats = effectivePlatforms(show, entry);
  const byUser = !!entry?.platformOverride?.length;
  const total = show.episodeCount;
  const year = yearOf(show);
  const released = show.firstAirDate ? new Date(show.firstAirDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  const meta = [year ?? 'Year unknown', episodesLabel(total), released && `Released ${released}`].filter(Boolean).join(' · ');
  const backdrop = tmdbImg(show.backdropPath, 'w780');
  const posterBg = tmdbImg(show.posterPath, 'w342');

  return (
    <>
      <div className="hero">
        {backdrop ? (
          <div className="backdrop" style={{ backgroundImage: `url(${backdrop})` }} />
        ) : posterBg ? (
          <div className="backdrop blur" style={{ backgroundImage: `url(${posterBg})` }} />
        ) : (
          <Poster title={show.title} label={false} lightness={0.3} className="backdrop" style={{ position: 'absolute' }} />
        )}
        <div className="fade" />
        <Poster title={show.title} path={show.posterPath} className="poster hero-poster" lightness={0.44} style={{ position: 'absolute' }} />
        <button className="hero-btn" style={{ left: 16 }} onClick={() => back('/')} aria-label="Back"><ChevronLeft size={22} strokeWidth={2.4} /></button>
        <button className="hero-btn" style={{ right: 16 }} onClick={() => shareShow(show, plats, toast)} aria-label="Share"><Share size={19} strokeWidth={2.2} /></button>
      </div>

      <div className="detail">
        <div className="d-head">
          <h1>{show.title}</h1>
          {show.originalTitle && show.originalTitle !== show.title && <div className="orig" lang="ko">{show.originalTitle}</div>}
          <div className="d-meta">{meta}</div>
          <div className="d-plats">
            {plats.map((p) => (
              <div key={p} className="d-plat"><span className="dot" style={{ background: PROVIDERS[p].dot }} />{PROVIDERS[p].label}</div>
            ))}
            {inLib && plats.length > 0 && (
              <button className={`d-edit${byUser ? '' : ' muted'}`} onClick={() => setPlatEdit(true)}>{byUser ? 'Set by you · Edit' : 'Edit'}</button>
            )}
            {plats.length === 0 && (
              inLib
                ? <button className="d-noplat" onClick={() => setPlatEdit(true)}>No UK platform found · Set it</button>
                : <div className="d-noplat" style={{ cursor: 'default' }}>No UK platform found yet</div>
            )}
          </div>
          {entry?.recommendedBy && <div className="d-rec">Recommended by {entry.recommendedBy}</div>}
        </div>

        <div className="tiles">
          <div className="tile"><span className="k">IMDb</span><span className={`v${show.imdbRating == null ? ' faint' : ''}`}>{imdbLabel(show.imdbRating)}</span></div>
          <div className="tile"><span className="k">Rotten Tomatoes</span><span className={`v${show.rtScore == null ? ' faint word' : ''}`}>{rtLabel(show.rtScore)}</span></div>
          <div className="tile hers"><span className="k">Hers</span><span className={`v${entry?.myRating ? '' : ' word'}`}>{entry?.myRating ? fmtRating(entry.myRating) : 'Not yet'}</span></div>
        </div>

        {!inLib ? (
          <div className="stack-8">
            <div className="label">Add to her list as</div>
            <div className="add-as">
              {([['want', 'Want to watch'], ['watching', 'Watching'], ['watched', 'Watched']] as [Status, string][]).map(([k, l], i) => (
                <button key={k} className={i === 0 ? 'primary' : ''} onClick={() => actions.add(show, k)}>{l}</button>
              ))}
            </div>
          </div>
        ) : (
          <Personal show={show} entry={entry} friends={friendNames(lib)} />
        )}

        <div className="stack-8">
          <div className="label">Premise</div>
          <p className="premise">{premiseOf(show)}</p>
        </div>

        {show.cast.length > 0 && (
          <div className="stack">
            <div className="label">Main cast</div>
            <div className="hscroll cast">
              {show.cast.map((c) => {
                const face = tmdbImg(c.profilePath, 'w185');
                return (
                  <div key={c.name} className="cast-m">
                    <div className="face" style={face ? { backgroundImage: `url(${face})` } : undefined}>
                      {!face && c.name.split(/[\s-]/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('')}
                    </div>
                    <div className="n">{c.name}</div>
                    {c.character && <div className="r">{c.character}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button className="share-btn" onClick={() => shareShow(show, plats, toast)}><Share size={18} strokeWidth={2.3} />Share with a friend</button>

        <div className="credits">
          <span>Where to watch powered by JustWatch · Show data from TMDB · Ratings via OMDb</span>
          {inLib && (
            <button className="danger-link" onClick={() => { actions.remove(id); back('/'); }}>Remove from list</button>
          )}
        </div>
      </div>

      {platEdit && entry && (
        <PlatformSheet
          selected={plats}
          onToggle={(p) => actions.edit(id, { platformOverride: plats.includes(p) ? plats.filter((x) => x !== p) : [...plats, p] })}
          onClose={() => setPlatEdit(false)}
        />
      )}
    </>
  );
}

function Personal({ show, entry, friends }: { show: Show; entry: Entry; friends: string[] }) {
  const actions = useActions();
  const id = show.tmdbId;
  const total = show.episodeCount;
  const n = entry.episodesWatched;
  const watched = entry.status === 'watched';

  const [note, setNote] = useState(entry.note ?? '');
  const [rec, setRec] = useState(entry.recommendedBy ?? '');
  useEffect(() => {
    if (note === (entry.note ?? '')) return;
    const t = setTimeout(() => actions.edit(id, { note: note || undefined }), 300);
    return () => clearTimeout(t);
  }, [note]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (rec.trim() === (entry.recommendedBy ?? '')) return;
    const t = setTimeout(() => actions.edit(id, { recommendedBy: rec.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [rec]); // eslint-disable-line react-hooks/exhaustive-deps

  const sugs = useMemo(() => {
    const typed = rec.trim().toLowerCase();
    return friends.filter((f) => f !== rec.trim() && (!typed || f.toLowerCase().startsWith(typed))).slice(0, 8);
  }, [friends, rec]);

  const rating = entry.myRating ?? 0;
  const setRating = (v: number) => actions.edit(id, { myRating: rating === v ? undefined : v });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stack">
        <div className="seg" role="radiogroup" aria-label="Status">
          {([['want', 'Want'], ['watching', 'Watching'], ['watched', 'Watched']] as [Status, string][]).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={entry.status === k} className={entry.status === k ? 'on' : ''} onClick={() => actions.setStatus(id, k)}>{l}</button>
          ))}
        </div>
        <button className="watched-row" onClick={() => actions.setStatus(id, watched ? 'watching' : 'watched')} aria-pressed={watched}>
          <span className={`box${watched ? ' on' : ''}`}>{watched && <Check size={16} strokeWidth={3.4} />}</span>
          {watched ? 'Watched it' : 'Mark as watched'}
        </button>
      </div>

      {entry.status === 'watching' && (
        <div className="progress">
          <div className="top">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="label">Progress</span>
              <span className="big">{total ? `Episode ${n} of ${total}` : `Episode ${n}`}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="round" style={{ background: 'var(--s3)' }} onClick={() => actions.setEpisodes(id, n - 1)} aria-label="One episode back" disabled={n === 0}>
                <Minus size={18} strokeWidth={2.6} />
              </button>
              <button className="round" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }} onClick={() => actions.setEpisodes(id, n + 1)} aria-label="One more episode">
                <Plus size={18} strokeWidth={2.6} />
              </button>
            </div>
          </div>
          {total && total <= 80 ? (
            <div className="eps">
              {Array.from({ length: total }, (_, i) => (
                <button key={i} className={i < n ? 'on' : ''} onClick={() => actions.setEpisodes(id, i + 1 === n ? i : i + 1)} aria-label={`Watched up to episode ${i + 1}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          ) : total ? (
            <div className="track"><div style={{ width: `${Math.round((n / total) * 100)}%` }} /></div>
          ) : null}
        </div>
      )}

      <div className="stack">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="label">Her rating</span>
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>Tap the left half of a star for ½</span>
        </div>
        <div className="stars" role="group" aria-label={`Her rating: ${rating || 'none'}`}>
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="star">
              <svg width="38" height="38" viewBox="0 0 24 24" style={{ fill: 'rgba(var(--fg-rgb),.16)' }}><path d={STAR} /></svg>
              <div className="fill" style={{ width: rating >= s ? 38 : rating >= s - 0.5 ? 19 : 0 }}>
                <svg width="38" height="38" viewBox="0 0 24 24" style={{ fill: 'var(--star)' }}><path d={STAR} /></svg>
              </div>
              <button className="half" style={{ left: 0 }} onClick={() => setRating(s - 0.5)} aria-label={`${s - 0.5} stars`} />
              <button className="half" style={{ left: 25 }} onClick={() => setRating(s)} aria-label={`${s} star${s > 1 ? 's' : ''}`} />
            </div>
          ))}
        </div>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={90} placeholder="One-line note" aria-label="One-line note" />
      </div>

      <div className="stack">
        <div className="label">Recommended by</div>
        <input className="field" value={rec} onChange={(e) => setRec(e.target.value)} placeholder="A friend's name" aria-label="Recommended by" autoCapitalize="words" />
        {sugs.length > 0 && (
          <div className="sugs">
            {sugs.map((f) => <button key={f} onClick={() => setRec(f)}>{f}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

const STAR = 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z';
