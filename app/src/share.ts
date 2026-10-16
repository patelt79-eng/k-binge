import { shareUrl } from './api';
import { PROVIDERS, premiseOf, yearOf } from './merge';
import type { ProviderId, Show } from './types';

/** iPhone share sheet with text + /share link (which carries the poster preview). */
export async function shareShow(show: Show, plats: ProviderId[], toast: (m: string) => void) {
  const where = plats.length ? plats.map((p) => PROVIDERS[p].label).join(', ') : null;
  const year = yearOf(show);
  const text = `${show.title}${year ? ` (${year})` : ''}. ${premiseOf(show)}${where ? ` Watch on ${where} in the UK.` : ''}`;
  const url = shareUrl(show.tmdbId);
  if (navigator.share) {
    try {
      await navigator.share({ title: show.title, text, url });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // she closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Share text copied');
  } catch {
    toast("Couldn't share that");
  }
}
