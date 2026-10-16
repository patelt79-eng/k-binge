// Library changes that also say something to her (toasts).
import { useMemo } from 'react';
import { addShow, removeShow, setEpisodes, setStatus, updateEntry } from './library';
import { useLibrary } from './store';
import { useToast } from './components/Toast';
import type { Entry, Show, Status } from './types';

const ADDED: Record<Status, string> = { want: 'Added to Want to watch', watching: 'Added to Watching', watched: 'Added to Watched' };

export function useActions() {
  const [, update] = useLibrary();
  const toast = useToast();
  return useMemo(() => ({
    add(show: Show, status: Status = 'want') {
      update((lib) => addShow(lib, show, status));
      toast(ADDED[status]);
    },
    remove(id: number) {
      update((lib) => removeShow(lib, id));
      toast('Removed from list');
    },
    setStatus(id: number, status: Status) {
      update((lib) => setStatus(lib, id, status));
    },
    toggleWatched(id: number, current: Status) {
      if (current === 'watched') {
        update((lib) => setStatus(lib, id, 'want'));
        toast('Moved back to Want to watch');
      } else {
        update((lib) => setStatus(lib, id, 'watched'));
        toast('Marked as watched');
      }
    },
    setEpisodes(id: number, n: number) {
      let finished = false;
      update((lib) => { const r = setEpisodes(lib, id, n); finished = r.finished; return r.lib; });
      if (finished) toast('Finished! Marked as watched');
    },
    edit(id: number, patch: Partial<Pick<Entry, 'myRating' | 'note' | 'recommendedBy' | 'platformOverride'>>) {
      update((lib) => updateEntry(lib, id, patch));
    },
  }), [update, toast]);
}
