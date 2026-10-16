// Prints GB streaming providers for a handful of K-dramas, to see whether
// Viki shows up in TMDB's JustWatch data. Run: npm run check-viki
// Reads TMDB_TOKEN from the environment or worker/.dev.vars.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function token(): string {
  if (process.env.TMDB_TOKEN) return process.env.TMDB_TOKEN;
  const path = fileURLToPath(new URL('../.dev.vars', import.meta.url));
  const line = readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith('TMDB_TOKEN='));
  if (!line) throw new Error('TMDB_TOKEN not set');
  return line.slice('TMDB_TOKEN='.length).trim();
}

const TITLES = [
  'Lovely Runner', 'Twinkling Watermelon', 'Goblin', 'My Mister', 'Queen of Tears',
  'Business Proposal', 'Hometown Cha-Cha-Cha', 'Reply 1988', 'Mr. Queen', 'True Beauty',
];

const headers = { Authorization: `Bearer ${token()}`, accept: 'application/json' };
const tmdb = async (path: string) => {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<any>;
};

let withViki = 0;
for (const title of TITLES) {
  const search = await tmdb(`/search/tv?query=${encodeURIComponent(title)}&language=en-GB`);
  const hit = search.results.find((r: any) => r.origin_country?.includes('KR')) ?? search.results[0];
  if (!hit) { console.log(`${title.padEnd(22)} not found`); continue; }
  const prov = await tmdb(`/tv/${hit.id}/watch/providers`);
  const gb = prov.results?.GB ?? {};
  const names = (k: string) => (gb[k] ?? []).map((p: any) => `${p.provider_name}#${p.provider_id}`).join(', ') || '—';
  const viki = JSON.stringify(gb).toLowerCase().includes('viki');
  if (viki) withViki++;
  console.log(`${title.padEnd(22)} id=${String(hit.id).padEnd(7)} viki=${viki ? 'YES' : 'no '}  flatrate: ${names('flatrate')}`);
  if (gb.ads) console.log(`${''.padEnd(22)} ads: ${names('ads')}`);
  if (gb.free) console.log(`${''.padEnd(22)} free: ${names('free')}`);
}
console.log(`\nViki listed for ${withViki}/${TITLES.length} titles in GB.`);
