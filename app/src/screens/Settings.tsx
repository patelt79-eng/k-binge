import { useRef, useState } from 'react';
import { ChevronLeft, Download, RefreshCw, Upload } from 'lucide-react';
import { useLibrary, usePrefs, setPrefs, store, type Theme } from '../store';
import { importBackup, isBackup, items, refreshShow, toBackup } from '../library';
import { fetchShow } from '../api';
import { useToast } from '../components/Toast';
import { MadeBy } from '../components/MadeBy';
import { back, useOnline } from '../hooks';

export const TMDB_LOGO = 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg';

/** Re-fetches every saved show. Entries are never touched. */
export async function refreshAll(ids: number[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 4) {
    const batch = await Promise.allSettled(ids.slice(i, i + 4).map((id) => fetchShow(id)));
    for (const r of batch) {
      if (r.status === 'fulfilled') {
        store.save(refreshShow(store.load(), r.value));
        n++;
      }
    }
  }
  setPrefs({ lastRefreshAt: Date.now() });
  return n;
}

export function Settings() {
  const [lib, update] = useLibrary();
  const prefs = usePrefs();
  const toast = useToast();
  const online = useOnline();
  const [refreshing, setRefreshing] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const all = items(lib);
  const count = (s: string) => all.filter((x) => x.entry.status === s).length;
  const manual = all.filter((x) => x.entry.platformOverride?.length).map((x) => x.show.title);
  const last = prefs.lastRefreshAt ?? (all.length ? Math.min(...all.map((x) => x.show.fetchedAt)) : undefined);
  const days = last ? Math.floor((Date.now() - last) / 86400000) : undefined;
  const refreshed = refreshing ? 'Refreshing…' : days == null ? 'Nothing to refresh yet' : days < 1 ? 'Refreshed today · cached for 7 days' : `Last refreshed ${days} day${days === 1 ? '' : 's'} ago`;

  async function exportBackup() {
    const name = `k-binge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const json = JSON.stringify(toBackup(lib), null, 2);
    const f = new File([json], name, { type: 'application/json' });
    try {
      // On iPhone the share sheet lets you save to Files or send it on.
      if (navigator.canShare?.({ files: [f] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        await navigator.share({ files: [f], title: 'K-Binge backup' });
        toast('Backup saved');
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup saved');
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!isBackup(data)) throw new Error('not a backup');
      let n = 0;
      update((l) => { const r = importBackup(l, data); n = r.imported; return r.lib; });
      toast(`Imported ${n} show${n === 1 ? '' : 's'}`);
    } catch {
      toast("That file isn't a K-Binge backup");
    }
  }

  async function onRefresh() {
    if (!online) return toast('Needs a connection');
    if (refreshing) return;
    setRefreshing(true);
    const n = await refreshAll(all.map((x) => x.show.tmdbId));
    setRefreshing(false);
    toast(`Refreshed ${n} show${n === 1 ? '' : 's'}`);
  }

  return (
    <div className="view">
      <div className="inner screen">
        <div className="st-head">
          <button className="circle-btn" onClick={() => back('/')} aria-label="Back"><ChevronLeft size={22} strokeWidth={2.4} /></button>
          <h1>Settings</h1>
        </div>
        <div className="st-body">
          <div className="stats">
            {[['watched', 'Watched'], ['watching', 'Watching'], ['want', 'Want to watch']].map(([k, l]) => (
              <div key={k} className="stat"><b>{count(k)}</b><span>{l}</span></div>
            ))}
          </div>

          <section className="stack-8">
            <div className="label" style={{ paddingLeft: 4 }}>Appearance</div>
            <div className="seg" role="radiogroup" aria-label="Appearance">
              {([['system', 'System'], ['dark', 'Dark'], ['light', 'Light']] as [Theme, string][]).map(([k, l]) => (
                <button key={k} role="radio" aria-checked={prefs.theme === k} className={prefs.theme === k ? 'on' : ''} onClick={() => setPrefs({ theme: k })}>{l}</button>
              ))}
            </div>
            <div className="group">
              <button className="row" onClick={() => setPrefs({ showContinue: !prefs.showContinue })} role="switch" aria-checked={prefs.showContinue}>
                <div className="t"><b>Continue watching row</b><span>Shows what you're watching at the top of Home</span></div>
                <span className={`toggle${prefs.showContinue ? ' on' : ''}`} />
              </button>
            </div>
          </section>

          <section className="stack-8">
            <div className="label" style={{ paddingLeft: 4 }}>Backup</div>
            <div className="group">
              <button className="row" onClick={exportBackup}>
                <div className="t"><b>Export backup</b><span>Saves your list as a JSON file</span></div>
                <Download size={18} strokeWidth={2.2} />
              </button>
              <button className="row" onClick={() => file.current?.click()}>
                <div className="t"><b>Import backup</b><span>Restores a saved file, merging with this list</span></div>
                <Upload size={18} strokeWidth={2.2} />
              </button>
              <input ref={file} type="file" accept="application/json,.json" onChange={onImport} hidden />
            </div>
            <div className="note">Your list is stored on this phone only. Sync between devices can be added later.</div>
          </section>

          <section className="stack-8">
            <div className="label" style={{ paddingLeft: 4 }}>Show data</div>
            <div className="group">
              <button className="row" onClick={onRefresh} disabled={refreshing}>
                <div className="t"><b>Refresh ratings &amp; platforms</b><span>{refreshed}</span></div>
                <RefreshCw size={18} strokeWidth={2.2} style={refreshing ? { animation: 'pulse 1s infinite' } : undefined} />
              </button>
              <div className="row">
                <div className="t"><b>Platforms set by hand</b><span>{manual.length ? manual.join(', ') : 'None yet'}</span></div>
              </div>
            </div>
          </section>

          <section className="stack-8">
            <div className="label" style={{ paddingLeft: 4 }}>On your iPhone</div>
            <div className="group" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 15.5 }}>Add to Home Screen</span>
              <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>Open K-Binge in Safari, tap Share, then Add to Home Screen. It opens full screen and works offline.</span>
            </div>
          </section>

          <div className="legal">
            <img src={TMDB_LOGO} alt="TMDB" width={110} height={14} style={{ height: 14, width: 'auto', alignSelf: 'flex-start' }} />
            <span>This product uses the TMDB API but is not endorsed or certified by TMDB. Where to watch powered by JustWatch. IMDb and Rotten Tomatoes scores via OMDb.</span>
            <span>K-Binge {__APP_VERSION__}</span>
            <div style={{ marginLeft: -6 }}><MadeBy /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
