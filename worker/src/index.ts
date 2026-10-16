// K-Binge API proxy: hides the TMDB/OMDb keys, caches responses, serves share pages.
import { mergeShow, mapProviders, PROVIDERS, tmdbImg, yearOf, episodesLabel, placeholderColor } from '../../app/src/merge';
import type { ResultPage, SearchResult, Show } from '../../app/src/types';

export interface Env {
  TMDB_TOKEN: string;
  OMDB_KEY: string;
  ALLOWED_ORIGIN: string; // comma-separated
  APP_URL: string;
}

const DAY = 86400;
/** Bump when response shapes change so old cache entries are ignored. */
const CACHE_VERSION = 'v5';
const TMDB = 'https://api.themoviedb.org/3';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGIN.split(',').map((s) => s.trim());
    const cors: Record<string, string> =
      origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    }
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);

    try {
      const path = url.pathname.replace(/\/+$/, '');
      let m: RegExpMatchArray | null;
      const page = Math.min(500, Math.max(1, Number(url.searchParams.get('page')) || 1));
      if (path === '/search') {
        const q = (url.searchParams.get('q') ?? '').trim();
        return cached(req, ctx, DAY, cors, () => (q ? search(env, q, page) : browse(env, 'uk', page)).then((r) => json(r)));
      }
      if (path === '/browse') {
        const sp = url.searchParams.get('scope');
        const scope: Scope = sp === 'all' || sp === 'new' ? sp : 'uk';
        return cached(req, ctx, DAY, cors, () => browse(env, scope, page).then((r) => json(r)));
      }
      if (path === '/recommend') {
        const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 6);
        if (!ids.length) return json({ error: 'ids required' }, 400, cors);
        return cached(req, ctx, DAY, cors, () => recommend(env, ids, page).then((r) => json(r)));
      }
      if ((m = path.match(/^\/show\/(\d+)$/))) {
        const id = Number(m[1]);
        return cached(req, ctx, 7 * DAY, cors, () => getShow(env, ctx, id).then((s) => json(s)), (s) => s.imdbId && s.imdbRating == null ? 6 * 3600 : undefined);
      }
      if ((m = path.match(/^\/share\/(\d+)$/))) {
        const id = Number(m[1]);
        return cached(req, ctx, 7 * DAY, {}, async () => html(sharePage(await getShow(env, ctx, id), env.APP_URL)));
      }
      if (path === '' ) return json({ ok: true, routes: ['/search?q=&page=', '/browse?scope=uk|new|all&page=', '/recommend?ids=1,2&page=', '/show/:id', '/share/:id'] }, 200, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 502;
      return json({ error: String(e?.message ?? e) }, status, cors);
    }
  },
};

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}
function html(body: string) {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** Cache API keyed by URL (without CORS headers, which are added per request). */
async function cached(
  req: Request, ctx: ExecutionContext, maxAge: number, cors: Record<string, string>,
  make: () => Promise<Response>, shorter?: (body: any) => number | undefined,
) {
  const u = new URL(req.url);
  u.searchParams.set('_cv', CACHE_VERSION);
  const key = new Request(u.toString(), { method: 'GET' });
  const cache = caches.default;
  let res = await cache.match(key);
  if (!res) {
    res = await make();
    if (res.ok) {
      if (shorter) {
        const text = await res.text();
        maxAge = shorter(JSON.parse(text)) ?? maxAge;
        res = new Response(text, res);
      }
      res = new Response(res.body, res);
      res.headers.set('Cache-Control', `public, max-age=${maxAge}`);
      ctx.waitUntil(cache.put(key, res.clone()));
    }
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

/** Reuses an internal cache entry so /search and /show share fetched shows. */
async function memo<T>(ctx: ExecutionContext, key: string, make: () => Promise<{ value: T; maxAge: number }>): Promise<T> {
  const req = new Request(`https://kbinge.internal/${CACHE_VERSION}/${key}`);
  const hit = await caches.default.match(req);
  if (hit) return hit.json() as Promise<T>;
  const { value, maxAge } = await make();
  ctx.waitUntil(caches.default.put(req, new Response(JSON.stringify(value), { headers: { 'Cache-Control': `public, max-age=${maxAge}` } })));
  return value;
}

async function tmdb(env: Env, path: string): Promise<any> {
  const res = await fetch(TMDB + path, { headers: { Authorization: `Bearer ${env.TMDB_TOKEN}`, accept: 'application/json' } });
  if (res.status === 404) throw new HttpError(404, 'Show not found');
  if (!res.ok) throw new HttpError(502, `TMDB ${res.status}`);
  return res.json();
}

/** undefined = OMDb unavailable (bad key, over limit, down). A "not found" answer is a real result. */
async function omdb(env: Env, imdbId: string): Promise<any | undefined> {
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${env.OMDB_KEY}`);
    if (!res.ok) return undefined;
    const body: any = await res.json();
    if (body.Response === 'False' && !/not found/i.test(body.Error ?? '')) return undefined;
    return body;
  } catch {
    return undefined; // OMDb failure must not fail /show
  }
}

function getShow(env: Env, ctx: ExecutionContext, id: number): Promise<Show> {
  return memo(ctx, `show/${id}`, async () => {
    const t = await tmdb(env, `/tv/${id}?language=en-GB&append_to_response=credits,external_ids,watch/providers`);
    const imdbId = t.external_ids?.imdb_id;
    const o = imdbId ? await omdb(env, imdbId) : undefined;
    // If OMDb was unavailable, retry sooner rather than pinning a ratingless show for a week.
    return { value: mergeShow(t, o), maxAge: imdbId && !o ? 6 * 3600 : 7 * DAY };
  });
}

const isKorean = (r: any) => (r.origin_country ?? []).includes('KR') || r.original_language === 'ko';

/**
 * Adds episode count and UK platforms to a page of TMDB rows. Uses TMDB only (no OMDb), one call per row,
 * so a page of 20 stays inside the free plan's 50-subrequest limit and doesn't eat the OMDb daily quota.
 */
async function toResults(env: Env, rows: any[]): Promise<SearchResult[]> {
  const details = await Promise.all(
    rows.map((r) => tmdb(env, `/tv/${r.id}?language=en-GB&append_to_response=watch/providers`).catch(() => undefined)),
  );
  return rows.map((r, i) => {
    const d = details[i];
    const eps = Number(d?.number_of_episodes);
    return {
      tmdbId: r.id,
      title: r.name,
      originalTitle: r.original_name,
      year: r.first_air_date?.slice(0, 4) || undefined,
      posterPath: r.poster_path ?? undefined,
      episodeCount: eps > 0 ? eps : undefined,
      providersGB: mapProviders(d?.['watch/providers']?.results?.GB),
    };
  });
}

function pageOf(data: any, results: SearchResult[]): ResultPage {
  const page = data.page ?? 1;
  const totalPages = Math.min(500, data.total_pages ?? 1);
  return { results, page, totalPages, totalResults: data.total_results ?? results.length, nextPage: page < totalPages ? page + 1 : null };
}

const SEARCH_PAGE = 20;
const SEARCH_SCAN = 10; // TMDB pages scanned per request: 10 + 20 detail calls stays under the 50-subrequest limit

/**
 * TMDB search mixes every country, so Korean shows can be sparse on a page. Scan forward from `page`
 * until a full page of Korean results is found; `nextPage` is where the next scan starts.
 */
async function search(env: Env, q: string, page: number): Promise<ResultPage> {
  const rows: any[] = [];
  let p = page;
  let totalPages = 1;
  let scanned = 0;
  while (rows.length < SEARCH_PAGE && scanned < SEARCH_SCAN) {
    const data = await tmdb(env, `/search/tv?query=${encodeURIComponent(q)}&language=en-GB&include_adult=false&page=${p}`);
    totalPages = Math.min(500, data.total_pages ?? 1);
    for (const r of data.results ?? []) if (isKorean(r) && !rows.some((x) => x.id === r.id)) rows.push(r);
    scanned++;
    p++;
    if (p > totalPages) break;
  }
  return { results: await toResults(env, rows), page, totalPages, totalResults: rows.length, nextPage: p <= totalPages ? p : null };
}

// Scripted K-dramas: everything Korean except reality, talk, news, kids and animation.
const NOT_DRAMA = '10764|10767|10763|10762|16';
const UK_SERVICES = '8|337|9|350|38|41|103';

type Scope = 'uk' | 'new' | 'all';
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * "uk": on UK subscription services. "new": first aired in the last 90 days or starting in the next 30.
 * "all": every Korean drama on TMDB. Most popular first in each.
 */
async function browse(env: Env, scope: Scope, page: number): Promise<ResultPage> {
  let extra = '';
  if (scope === 'uk') extra = `&watch_region=GB&with_watch_providers=${UK_SERVICES}&with_watch_monetization_types=flatrate`;
  if (scope === 'new') {
    const now = Date.now();
    extra = `&first_air_date.gte=${isoDay(new Date(now - 90 * DAY * 1000))}&first_air_date.lte=${isoDay(new Date(now + 30 * DAY * 1000))}`;
  }
  const data = await tmdb(env, `/discover/tv?with_original_language=ko&without_genres=${NOT_DRAMA}${extra}&sort_by=popularity.desc&include_adult=false&language=en-GB&page=${page}`);
  return pageOf(data, await toResults(env, data.results ?? []));
}

const REC_PAGE = 20;
const NOT_DRAMA_IDS = NOT_DRAMA.split('|').map(Number);

/** TMDB recommendations for each seed show, merged: shows suggested by more of your shows rank higher. */
async function recommend(env: Env, ids: number[], page: number): Promise<ResultPage> {
  // Two pages per seed: 6 seeds x 2 + 20 detail calls stays under the 50-subrequest limit.
  const lists = await Promise.all(
    ids.flatMap((id) => [1, 2].map((p) => tmdb(env, `/tv/${id}/recommendations?language=en-GB&page=${p}`).catch(() => ({ results: [] })))),
  );
  const seeds = new Set(ids);
  const scored = new Map<number, { row: any; score: number }>();
  for (const list of lists) {
    (list.results ?? []).forEach((r: any, i: number) => {
      const rank = (list.page === 2 ? 20 : 0) + i;
      if (seeds.has(r.id) || !isKorean(r) || (r.genre_ids ?? []).some((g: number) => NOT_DRAMA_IDS.includes(g))) return;
      const cur = scored.get(r.id) ?? { row: r, score: 0 };
      cur.score += 1 + (40 - Math.min(rank, 39)) / 40; // appearing for more seeds beats ranking high for one
      scored.set(r.id, cur);
    });
  }
  const ranked = [...scored.values()].sort((a, b) => b.score - a.score || (b.row.popularity ?? 0) - (a.row.popularity ?? 0));
  const slice = ranked.slice((page - 1) * REC_PAGE, page * REC_PAGE).map((x) => x.row);
  const totalPages = Math.max(1, Math.ceil(ranked.length / REC_PAGE));
  return { results: await toResults(env, slice), page, totalPages, totalResults: ranked.length, nextPage: page < totalPages ? page + 1 : null };
}

// ---- share page (design 2e) ----

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function sharePage(s: Show, appUrl: string): string {
  const plats = s.providersGB.map((p) => PROVIDERS[p]);
  const where = plats.length ? plats.map((p) => p.label).join(', ') : '';
  const ogTitle = where ? `${s.title}: watch on ${where}` : s.title;
  const premise = s.premise || 'No premise available yet.';
  const img = tmdbImg(s.backdropPath ?? s.posterPath, 'w780');
  const poster = tmdbImg(s.posterPath, 'w342');
  const meta = [yearOf(s), s.episodeCount ? episodesLabel(s.episodeCount) : null, s.imdbRating != null ? `IMDb ${s.imdbRating.toFixed(1)}` : null].filter(Boolean).join(' · ');
  const cast = s.cast.slice(0, 3).map((c) => c.name).join(' · ');
  const back = `${appUrl.replace(/\/$/, '')}/#/show/${s.tmdbId}`;
  const heroBg = poster ? `url('${poster}') center/cover` : placeholderColor(s.title, 0.3);
  const posterBg = poster ? `url('${poster}') center/cover` : placeholderColor(s.title, 0.44);
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(ogTitle)} · K-Binge</title>
<meta name="description" content="${esc(premise)}">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(premise)}">
${img ? `<meta property="og:image" content="${img}">` : ''}
<meta property="og:type" content="video.tv_show">
<meta property="og:site_name" content="K-Binge">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0F0D14">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0F0D14;--bg0:rgba(15,13,20,0);--s1:#18161F;--text:#F4F1F8;--text2:#E2DDEA;--muted:#A8A2B4;--faint:#8C869A;--acc:#C9B8FF;--acc-tx:#C9B8FF;--display:'Bricolage Grotesque',sans-serif}
@media (prefers-color-scheme: light){:root{--bg:#F6F4F9;--bg0:rgba(246,244,249,0);--s1:#FFFFFF;--text:#1B1530;--text2:#352E44;--muted:#635C72;--faint:#767085;--acc-tx:#5B3FD0}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Hanken Grotesk',system-ui,sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased}
.hero{position:relative;height:300px;overflow:hidden;background:${heroBg}}
.hero::before{content:'';position:absolute;inset:-20px;background:inherit;filter:blur(24px) saturate(1.2);opacity:.8}
.fade{position:absolute;left:0;right:0;bottom:0;height:160px;background:linear-gradient(var(--bg0),var(--bg))}
.poster{position:absolute;left:50%;top:calc(64px + env(safe-area-inset-top));transform:translateX(-50%);width:128px;height:192px;border-radius:14px;background:${posterBg};box-shadow:0 18px 40px rgba(0,0,0,.5);display:flex;align-items:flex-end;padding:12px;font:700 17px/1.02 var(--display);color:rgba(255,255,255,.9)}
main{max-width:520px;margin:-14px auto 0;padding:0 22px 40px;position:relative;display:flex;flex-direction:column;gap:18px;text-align:center;align-items:center}
.from{font-size:13px;color:var(--acc-tx);font-weight:600}
h1{font:800 30px/1.05 var(--display);letter-spacing:-.02em;margin:-8px 0 0;text-wrap:balance}
.meta{font-size:14px;color:var(--muted);margin-top:-8px}
.label{font-size:12px;color:var(--muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.chip{display:flex;align-items:center;gap:7px;height:38px;padding:0 16px;border-radius:19px;background:var(--s1);font-size:15px;font-weight:600}
.dot{width:9px;height:9px;border-radius:5px}
.premise{font-size:15.5px;line-height:1.55;color:var(--text2);text-wrap:pretty;margin:0}
.cast{font-size:14px;color:var(--muted)}
.cta{display:inline-flex;align-items:center;height:46px;padding:0 22px;border-radius:23px;background:var(--acc);color:#1B1530;font-weight:700;font-size:15px;text-decoration:none}
.credit{font-size:11.5px;color:var(--faint)}
</style>
</head>
<body>
<div class="hero"><div class="fade"></div><div class="poster">${poster ? '' : esc(s.title)}</div></div>
<main>
<div class="from">Shared from K-Binge</div>
<h1>${esc(s.title)}</h1>
${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
${plats.length ? `<div style="display:flex;flex-direction:column;gap:8px;align-items:center"><div class="label">Watch in the UK on</div><div class="chips">${plats.map((p) => `<div class="chip"><span class="dot" style="background:${p.dot}"></span>${esc(p.label)}</div>`).join('')}</div></div>` : ''}
<p class="premise">${esc(premise)}</p>
${cast ? `<div class="cast">${esc(cast)}</div>` : ''}
<a class="cta" href="${esc(back)}">Open in K-Binge</a>
<div class="credit">Where to watch powered by JustWatch</div>
</main>
</body>
</html>`;
}
