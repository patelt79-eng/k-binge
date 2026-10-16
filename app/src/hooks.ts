import { useEffect, useState, useSyncExternalStore } from 'react';

export function useOnline() {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener('online', fn);
      window.addEventListener('offline', fn);
      return () => {
        window.removeEventListener('online', fn);
        window.removeEventListener('offline', fn);
      };
    },
    () => navigator.onLine,
  );
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Hash routes: #/, #/search, #/settings, #/show/:id */
export type Route = { name: 'home' } | { name: 'search' } | { name: 'settings' } | { name: 'show'; id: number };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const m = h.match(/^\/show\/(\d+)/);
  if (m) return { name: 'show', id: Number(m[1]) };
  if (h.startsWith('/search')) return { name: 'search' };
  if (h.startsWith('/settings')) return { name: 'settings' };
  return { name: 'home' };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    (fn) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); },
    () => location.hash,
  );
  return parseRoute(hash);
}

// In-app history, so Back never leaves the app (e.g. when opened straight from a share link).
let stack: string[] = [location.hash || '#/'];
let replacing = false;
window.addEventListener('hashchange', () => {
  const h = location.hash || '#/';
  if (replacing) { stack = [h]; replacing = false; }
  else if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
  else stack.push(h);
});

export const go = (path: string) => { location.hash = path; };

export function back(fallback = '/') {
  if (stack.length > 1) history.back();
  else { replacing = true; location.replace('#' + fallback); }
}

export function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && !standalone && !otherBrowser;
}
