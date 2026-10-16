// Your library lives behind this interface so a remote store can replace it later.
import { useCallback, useSyncExternalStore } from 'react';
import type { LibraryV1 } from './types';
import { emptyLibrary } from './library';
import type { ProviderId } from './types';
import type { SortKey, TabKey } from './library';

export interface Store {
  load(): LibraryV1;
  save(lib: LibraryV1): void;
  subscribe(fn: () => void): () => void;
}

const KEY = 'kbinge:v1';

export function localStore(key = KEY): Store {
  let cache: LibraryV1 | undefined;
  const listeners = new Set<() => void>();
  const read = (): LibraryV1 => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (v && v.version === 1 && v.shows && v.entries) return v;
    } catch {}
    return emptyLibrary();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return;
    cache = read();
    listeners.forEach((l) => l());
  };
  return {
    load: () => (cache ??= read()),
    save(lib) {
      cache = lib;
      try { localStorage.setItem(key, JSON.stringify(lib)); } catch {}
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      if (!listeners.size) window.addEventListener('storage', onStorage);
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
        if (!listeners.size) window.removeEventListener('storage', onStorage);
      };
    },
  };
}

export const store: Store = localStore();

export function useLibrary(s: Store = store) {
  const lib = useSyncExternalStore(s.subscribe, s.load);
  const update = useCallback((fn: (lib: LibraryV1) => LibraryV1) => s.save(fn(s.load())), [s]);
  return [lib, update] as const;
}

// ---- UI preferences (per device) ----

export type Theme = 'system' | 'dark' | 'light';
export interface Prefs {
  tab: TabKey;
  plat: ProviderId | 'all';
  sort: SortKey;
  theme: Theme;
  showContinue: boolean;
  installDismissed: boolean;
  lastRefreshAt?: number;
}
const PREFS_KEY = 'kbinge:prefs';
const DEFAULT_PREFS: Prefs = { tab: 'all', plat: 'all', sort: 'recent', theme: 'system', showContinue: true, installDismissed: false };

let prefsCache: Prefs | undefined;
const prefListeners = new Set<() => void>();
function loadPrefs(): Prefs {
  if (!prefsCache) {
    try { prefsCache = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }; }
    catch { prefsCache = { ...DEFAULT_PREFS }; }
  }
  return prefsCache!;
}
export function setPrefs(patch: Partial<Prefs>) {
  prefsCache = { ...loadPrefs(), ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache)); } catch {}
  prefListeners.forEach((l) => l());
}
export function usePrefs() {
  return useSyncExternalStore((fn) => { prefListeners.add(fn); return () => prefListeners.delete(fn); }, loadPrefs);
}
