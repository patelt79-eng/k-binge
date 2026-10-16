import { useEffect } from 'react';
import { Home } from './screens/Home';
import { Search } from './screens/Search';
import { Detail } from './screens/Detail';
import { Settings, refreshAll } from './screens/Settings';
import { ToastProvider } from './components/Toast';
import { useRoute } from './hooks';
import { usePrefs, store } from './store';

const WEEK = 7 * 86400000;

export function App() {
  const route = useRoute();
  const { theme } = usePrefs();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    const light = theme === 'light' || (theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#F6F4F9' : '#0F0D14');
  }, [theme]);

  // Quietly refresh shows whose cached data is over a week old.
  useEffect(() => {
    if (!navigator.onLine) return;
    const stale = Object.values(store.load().shows).filter((s) => Date.now() - s.fetchedAt > WEEK).map((s) => s.tmdbId);
    if (stale.length) refreshAll(stale.slice(0, 20)).catch(() => {});
  }, []);

  // Keep Home still underneath full-screen views.
  const overlay = route.name !== 'home';
  useEffect(() => {
    document.body.style.overflow = overlay ? 'hidden' : '';
  }, [overlay]);

  return (
    <ToastProvider>
      <div className="app">
        <div aria-hidden={overlay || undefined}>
          <Home />
        </div>
        {route.name === 'search' && <Search />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'show' && <Detail id={route.id} />}
      </div>
    </ToastProvider>
  );
}
