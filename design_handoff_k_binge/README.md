# Handoff: K-Binge — K-drama tracker PWA

## Overview
K-Binge is a mobile-first, installable web app (PWA) for one person in the UK to track the K-dramas she watches. She searches a show by name and adds it in one tap. Each show then carries poster, UK streaming platforms, episode count, premise, main cast, IMDb rating, Rotten Tomatoes score and release date, plus her own status (Want to watch / Watching / Watched), episode progress, half-star rating, one-line note and "Recommended by" friend. Lists filter and sort, shows can be shared via the iPhone share sheet with a poster preview, and the saved list works offline.

Hosting target: **GitHub Pages** for the app (repo not created yet — create it as part of this work), **Cloudflare Workers** (free) for the API proxy and share pages.

## About the design files
The files in `design/` are **design references built in HTML** — working prototypes showing intended look and behaviour, not production code. Recreate them in the stack below. Open `design/K-Binge 1a.dc.html` in a browser (keep `support.js` alongside) — every phone is clickable.

- `K-Binge 1a.dc.html` — **the chosen design.** Turn 3 (top) = font/light-mode specimens; **3a "Playful" was chosen**. Turn 2 = 2a Home, 2b Settings, 2c Offline + install hint, 2d Shared link in Messages, 2e Share page, 2f App icon.
- `K-Binge round 1.dc.html` — earlier exploration (1a grid, 1b shelves, 1c tab bar). **1a was chosen**; others are for reference only.

All show data in the prototypes is **sample data** (ratings/platforms are illustrative). Posters are coloured placeholders — real app uses TMDB images.

## Fidelity
**High-fidelity.** Final colours, type, spacing, copy and interactions. Recreate pixel-close at 390×844 (iPhone 14/15), fluid for other widths.

---

## Tech stack (agreed)
- **App:** React 18 + Vite + TypeScript. No UI library; plain CSS (CSS custom properties for theme, see tokens). `vite-plugin-pwa` (Workbox) for manifest, icons, service worker.
- **Storage:** `localStorage` behind a `Store` interface (`load()`, `save()`, `subscribe()`), so a later backend (Supabase or Worker + D1) replaces one module.
- **Proxy:** one Cloudflare Worker (`worker/`), keys stored as Worker secrets. Cache API + KV-free.
- **Tests:** Vitest for merge/normalise logic.
- **Deploy:** GitHub Actions → GitHub Pages (app); `wrangler deploy` (Worker).

### Suggested repo layout
```
k-binge/
  app/                 Vite React TS app
    src/
      api.ts           calls Worker
      merge.ts         mergeShow() + provider mapping (pure, tested)
      store.ts         localStorage Store
      types.ts
      screens/Home.tsx Detail.tsx Search.tsx Settings.tsx
      components/…
    public/icons/      180, 192, 512, 512-maskable
    vite.config.ts     base: '/k-binge/' for GitHub Pages
  worker/
    src/index.ts       /search /show/:id /share/:id
    wrangler.toml
  .github/workflows/pages.yml
```

## Data model
```ts
type ProviderId = 'netflix'|'disney'|'prime'|'appletv'|'iplayer'|'itvx'|'channel4'|'viki';
type Status = 'want'|'watching'|'watched';

interface Show {               // cached API data, refreshable, never edited by her
  tmdbId: number;
  imdbId?: string;
  title: string;
  originalTitle?: string;      // Hangul, e.g. 눈물의 여왕
  posterPath?: string;         // TMDB path
  backdropPath?: string;
  premise?: string;
  firstAirDate?: string;       // ISO
  episodeCount?: number;
  seasons?: number;
  cast: { name: string; character?: string; profilePath?: string }[]; // top 6
  providersGB: ProviderId[];   // flatrate only, mapped to our 8
  imdbRating?: number;         // 0–10
  rtScore?: number;            // 0–100
  fetchedAt: number;
}

interface Entry {              // hers
  tmdbId: number;
  status: Status;
  episodesWatched: number;
  myRating?: number;           // 0.5–5 in 0.5 steps
  note?: string;               // max 90 chars
  recommendedBy?: string;
  platformOverride?: ProviderId[]; // wins over providersGB when non-empty
  addedAt: number;
  updatedAt: number;           // last-write-wins for future sync
}

interface LibraryV1 { version: 1; shows: Record<number, Show>; entries: Record<number, Entry>; }
```
localStorage key `kbinge:v1`. Backup export = `{ app:'k-binge', version:1, exportedAt, shows, entries }`. Import merges per entry, keeping the newer `updatedAt`.

## Worker API
All responses JSON, CORS restricted to the Pages origin.

| Route | Does | Cache |
|---|---|---|
| `GET /search?q=` | TMDB `/search/tv?query=&language=en-GB`, filtered to `origin_country` includes `KR` (fallback: `original_language=ko`). Returns id, title, originalTitle, year, posterPath. | 1 day |
| `GET /show/:tmdbId` | TMDB `/tv/:id?append_to_response=credits,external_ids,watch/providers` → OMDb `?i=<imdb_id>` → `mergeShow()` → `Show` | 7 days |
| `GET /share/:tmdbId` | Server-rendered HTML page (design 2e) with Open Graph tags; links back to app | 7 days |

Keys: `TMDB_TOKEN` (v4 read access token, `Authorization: Bearer`) and `OMDB_KEY`, set with `wrangler secret put`. Use `caches.default` keyed by URL; add `Cache-Control: public, max-age=…`. This keeps OMDb inside its 1,000/day free limit.

### Provider mapping (TMDB `results.GB.flatrate[].provider_id`)
Map by **provider name** (IDs drift) with an ID fallback table, case-insensitive:
- Netflix (incl. "Netflix basic with Ads") → `netflix`
- Disney Plus → `disney`
- Amazon Prime Video → `prime`
- Apple TV Plus / Apple TV+ → `appletv`
- BBC iPlayer → `iplayer`
- ITVX → `itvx`
- Channel 4 → `channel4`
- Rakuten Viki / Viki → `viki`
Ignore everything else. Rent/buy are ignored.

### Viki check (do this first)
Write `worker/scripts/check-viki.ts` that calls `/tv/:id/watch/providers` for ~10 K-dramas (e.g. Lovely Runner, Twinkling Watermelon, Goblin, My Mister, Queen of Tears, Business Proposal, Hometown Cha-Cha-Cha, Reply 1988, Mr. Queen, True Beauty) and prints GB results. Expected: Viki appears for some and not others. Either way the **manual platform override** (design: detail → "No UK platform found · Set it" / "Set by you · Edit") is required and must survive refreshes.

### Missing data rules (`mergeShow`)
- No poster → placeholder tile coloured from title hash with title text (as in prototype).
- No IMDb id / OMDb `N/A` → `imdbRating` undefined → UI shows "—" in faint colour.
- RT: from OMDb `Ratings[]` where `Source === "Rotten Tomatoes"`, parse `"98%"`. Absent → UI "No score". (Most K-dramas have none.)
- No premise → "No premise available yet."
- `episodeCount` from `number_of_episodes`; if 0/absent → "Episodes TBC", hide progress grid, allow +1 without cap.
- No GB providers and no override → "Platform not set" (grey dot `#6E6879`).
- OMDb failure must not fail `/show`; return TMDB data only.

### Tests (Vitest, `app/src/merge.test.ts`)
- maps provider names → ProviderId, dedupes, ignores unknowns and rent/buy
- RT parsed from OMDb Ratings; missing → undefined; "N/A" imdbRating → undefined
- override wins when non-empty; empty override falls back to TMDB
- refresh replaces `Show` but never touches `Entry`
- reaching last episode sets status `watched`; setting `watched` sets episodesWatched = episodeCount
- import merge keeps newer `updatedAt`
- missing poster/premise/episodes produce defined fallbacks (no crashes)

---

## Screens

Global: phone canvas 390 wide; content horizontal padding **20px**; safe-area top respected (`env(safe-area-inset-top)`, prototype uses 58px). Body font Hanken Grotesk, display font Bricolage Grotesque. Every tappable ≥ 44px.

### Home (2a)
Vertical scroll:
1. **Header** (padding 6 20 14): "K-Binge" Bricolage 800 30px/1, letter-spacing −0.02em. Right: menu button 44×44 circle `s1` (opens Settings) and add button 44×44 circle accent `#C9B8FF` with dark plus (opens Search). Gap 8.
2. **Offline banner** (only when `!navigator.onLine`): margin 0 20 14, padding 10 14, radius 12, bg `s2`, 13.5px, amber dot `#E8B860` 8px. Copy: "Offline. Her saved list and progress still work and will sync when she's back online."
3. **Install card** (iOS Safari, not standalone, not dismissed): radius 18, padding 16, gradient 150° `promo1→promo2`; 48px K icon tile; title "Add K-Binge to your Home Screen" 700 15.5; body 13.5 muted2: "Tap [share icon] in Safari, then **Add to Home Screen**. It then opens full screen and works offline." Close ✕ 36px hit top-right; persist dismissal.
4. **Continue watching** (only if any Watching; hideable): label 13px 600 uppercase tracking .06em muted. Horizontal scroller, gap 12, cards 270w, padding 10, radius 16, bg `s1`: poster 62×93 r9 | title 600 15 ellipsis, platform dot 7px + name 12.5 muted, progress bar 4px (track fg 12%, fill accent), row "Ep 9 of 16" 13px + "+1 ep" pill (padding 8 13, r15, bg accent 16%, text accent, 700 13). Sorted by `updatedAt` desc.
5. **Status tabs**: horizontal pills height 40, padding 0 15, r20, 600 14.5, gap 6. Labels "All", "Watching", "Want to watch", "Watched" + count at 70% opacity. Active: bg `inv` text `inv-fg`; inactive bg `s1`.
6. **Filter row**: platform chips (scroll) height 36, r10, 1px border fg 10%, 13px 500, 7px brand dot; "All platforms" first. Active: bg accent 14%, border accent 60%, text `acc-tx`. Tapping active chip resets to All. Right: sort button height 36 r10 bg `s1` 600 13 with ↑↓ icon + current label (Recent / Her rating / IMDb / Newest). Opens a **menu** 200w, r14, bg `s3`, shadow 0 14 36 rgba(0,0,0,.55), rows 46h: "Recently added", "Her rating", "IMDb rating", "Release date", active row accent text + check. Tap outside closes.
7. **Grid**: 2 columns, gap 20 row / 14 col. Card: poster 2:3 r14 (placeholder: title Bricolage 700 19/1.02 at bottom-left 12px); **watched checkbox** top-right — 30px circle in a 46px hit area; unchecked: border 2px white 75%, bg rgba(15,13,20,.45); checked: accent fill with dark tick. Tap toggles Watched ↔ Want (toast). Watching cards: "9/16" pill top-left (bg rgba(15,13,20,.7), 700 12, `#D9CCFF`) and 5px progress bar at poster bottom. Below: title 600 15/1.25 two-line clamp; platform dot + name 12.5 muted (+N if multiple); her rating "★ 4.5" in accent text right-aligned.
8. **Empty state**: dashed 1px border fg 14%, r20, padding 36 24, title Bricolage 700 21 ("Her list is empty" / "Nothing here yet"), body 14 muted, CTA "Find a drama" accent pill 46h.
9. Footer: "Where to watch powered by JustWatch" 11.5 faint, centred.

### Search
Full screen. Input row: 48h r14 bg `s1`, 1px border accent 35%, magnifier, autofocus, placeholder "Search K-dramas"; "Cancel" accent text. Section label uppercase 12px: "Popular K-dramas in the UK" (empty query — use TMDB `/discover/tv?with_origin_country=KR&watch_region=GB&sort_by=popularity.desc`), "Searching TMDB…" (debounce 300ms, show 4 pulsing skeleton rows), "N results". Rows: poster 52×78 r8, title 700 15.5, meta "2024 · 16 episodes · IMDb 8.2" 13 muted, platform line, right "Add" accent pill 40h or "✓ Watching" muted if already in list. Tap row → **Preview** (detail without personal sections, with "Add to her list as" three 52h buttons: Want to watch [accent] / Watching / Watched). No results: "No K-dramas match that. Try the English or Korean title." Offline: card "Search needs a connection / Her saved shows work offline. Adding new ones needs a connection." Footer "Search by TMDB · Where to watch powered by JustWatch".

### Show detail
Full screen scroll. Hero 330h: backdrop (blurred poster or TMDB backdrop) with bottom fade 180px to `bg`; centred poster 132×198 r14 at top 70, shadow 0 18 40 rgba(0,0,0,.5). Back (left) and Share (right) 44px circles rgba(15,13,20,.6), white icons, top 58 (safe area).
Content padding 0 20 40, margin-top −20, gap 20:
- Title Bricolage 800 28/1.05 centred, balance. Meta 14 muted: "2024 · 16 episodes · Released 9 Mar". Platform chips 32h r16 `s1` 600 13.5 with 8px dot; "Edit" / "Set by you · Edit" link; or dashed "No UK platform found · Set it". "Recommended by Mina" 13.5 accent if set.
- Ratings: 3 tiles, gap 8, padding 12, r14: IMDb / Rotten Tomatoes (bg `s1`) / "Hers" (bg accent 12%, accent text). Label 11.5 600, value Bricolage 700 22.
- Status segmented: container `s1` r16 padding 4, 3 × 44h r12 700 14.5; active accent bg dark text.
- Watched checkbox row 56h r16 `s1`: 28px rounded-8 box + "Mark as watched" / "Watched it".
- Progress card (Watching only) `s1` r18 p16: "PROGRESS" + "Episode 9 of 16" Bricolage 700 22; − and + 48px circles (− `s3`, + accent). Episode grid 8 columns gap 5, cells 34h r8, 700 12.5; watched cells accent/dark text. Tap cell n sets watched = n (tap the current last cell to step back one).
- Her rating: 5 stars 50px hit, 38px glyph; left half = n−0.5, right half = n; tapping the current value clears. Hint "Tap the left half of a star for ½". Note input 50h r14 placeholder "One-line note", maxlength 90.
- Recommended by: input placeholder "A friend's name" + suggestion chips (36h r18 `s3`) from names used before.
- Premise 15.5/1.55 `text2`. Main cast horizontal: 62px circle (TMDB profile or initials), name 600 12.5, character 11.5 muted.
- Share button 54h r16 `inv`/`inv-fg` "Share with a friend".
- Credits 11.5 faint: "Where to watch powered by JustWatch · Show data from TMDB · Ratings via OMDb". "Remove from list" 13 danger.

**Platform sheet**: bottom sheet r28 top, bg `sheet`, grabber 40×5; "Where does she watch it?" Bricolage 700 21; "Saved for this show and kept when the data refreshes." 13.5 muted; 2-col grid of 8 platforms 48h r14 toggles (selected: border 1.5 accent, bg accent 14%); "Done" 52h accent. Backdrop rgba(5,4,8,.6).

### Settings (2b)
Back chevron + "Settings" Bricolage 800 26. Stats: 3 tiles (Watched / Watching / Want to watch). Grouped lists (r16 `s1`, rows ≥58h, 1px divider fg 6%), section labels uppercase 12:
- **Appearance**: segmented System / Dark / Light (default System in production).
- **Backup**: "Export backup — Saves her list as a JSON file" (downloads `k-binge-backup-YYYY-MM-DD.json`; on iOS use Web Share with a File if available); "Import backup — Restores a saved file, merging with this list". Note: "Her list is stored on this phone only. Sync between devices can be added later."
- **Show data**: "Refresh ratings & platforms — Last refreshed N days ago" (re-fetch each show, keep entries); "Platforms set by hand — <titles>".
- **On her iPhone**: Add to Home Screen instructions.
- Footer: "This product uses the TMDB API but is not endorsed or certified by TMDB. Where to watch powered by JustWatch. IMDb and Rotten Tomatoes scores via OMDb." + version. Add the TMDB logo per their attribution guidelines.

### Share (2d, 2e)
`navigator.share({ title, text, url })` where text = `"{title} ({year}). {premise} Watch on {platforms} in the UK."` and url = `https://<worker>/share/{tmdbId}`. Fallback: copy to clipboard + toast "Share text copied".
`/share/:id` HTML (2e): dark page, poster hero, "Shared from K-Binge", title, "2024 · 16 episodes · IMDb 8.2", "Watch in the UK on" chips, premise, cast line, JustWatch credit. Head:
```html
<meta property="og:title" content="Queen of Tears: watch on Netflix">
<meta property="og:description" content="{premise}">
<meta property="og:image" content="https://image.tmdb.org/t/p/w780{backdrop_path or poster_path}">
<meta property="og:type" content="video.tv_show">
<meta name="twitter:card" content="summary_large_image">
```
(Optional later: generate a 1200×630 composite like 2d with `@cloudflare/pages-plugin-vercel-og`/Satori.)

### Toasts
Bottom 48px centred, padding 12 18, r14, `inv` bg, 600 14, auto-hide 1.9s. Copy used: "Added to Want to watch / Watching / Watched", "Marked as watched", "Moved back to Want to watch", "Finished! Marked as watched", "Removed from list", "Share text copied", "Backup saved", "Imported N shows", "That file isn't a K-Binge backup", "Refreshed N shows", "Needs a connection".

## Interactions & behaviour
- +1 episode (Continue card, detail +): increments; at last episode → status Watched + toast. Setting Watching from Watched resets progress to 0.
- Status changes and edits update `updatedAt`. Notes/rec save on change (debounce 300ms).
- Filters/sort persist in localStorage. Sort keys: added desc, her rating desc, IMDb desc, first air date desc; undefined values sort last.
- Detail/search/settings open as full-screen views with routes (`#/show/:id`, `#/search`, `#/settings`) — hash routing works on GitHub Pages without 404 tricks.
- Transitions: 200ms ease-out slide-up for sheets, fade for toasts. Respect `prefers-reduced-motion`.

## Offline / PWA
- `manifest.webmanifest`: name "K-Binge", short_name "K-Binge", display `standalone`, background_color & theme_color `#0F0D14`, start_url & scope `/k-binge/`, icons 192/512/512-maskable. Plus `<link rel="apple-touch-icon" href="icons/180.png">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style="black-translucent"`.
- Workbox: precache app shell; runtime `CacheFirst` for `image.tmdb.org` (max 300 entries, 60 days); `NetworkFirst` (3s timeout) for Worker `/show`; library comes from localStorage so it always works offline.
- Icon (2f): 3a chosen fonts — "K" Bricolage Grotesque 800, ~74% of tile, `#1B1530` on lavender `#C9B8FF` (**Lavender variant chosen**). Maskable version with 20% padding.

## Design tokens
CSS custom properties on `:root`, swapped by `[data-theme]` (System = `prefers-color-scheme`).

| Token | Dark | Light |
|---|---|---|
| --bg | #0F0D14 | #F6F4F9 |
| --s1 (cards) | #18161F | #FFFFFF |
| --s2 | #221F2B | #EDE9F3 |
| --s3 | #24212D | #E8E3F0 |
| --sheet | #1C1924 | #FFFFFF |
| --text | #F4F1F8 | #1B1530 |
| --text2 | #E2DDEA | #352E44 |
| --muted | #A8A2B4 | #635C72 |
| --muted2 | #C4BECE | #4F485F |
| --faint | #8C869A | #767085 |
| --acc (fills) | #C9B8FF | #C9B8FF |
| --acc-tx (accent text/icons) | #C9B8FF | #5B3FD0 |
| --star | #C9B8FF | #7B5CF0 |
| --inv / --inv-fg | #F4F1F8 / #1B1530 | #1B1530 / #F6F4F9 |
| --fg-rgb (for alpha borders) | 255,255,255 | 27,21,48 |
| --promo1 / --promo2 | #2A2340 / #1C1926 | #E9E0FF / #F7F3FF |
| --danger | #E08A9A | #B8334F |
| on-accent text | #1B1530 | #1B1530 |

Platform dots: Netflix #E50914, Disney+ #3D6BFF, Prime Video #1FA9E5, Apple TV+ #C9CDD2, BBC iPlayer #FF4FA3, ITVX #D8EC4E, Channel 4 #7FE0C2, Viki #2EC6FF, unknown #6E6879.

**Type** (3a "Playful"): display `Bricolage Grotesque` (500/700/800), body `Hanken Grotesk` (400–700), fallback `Pretendard` (CDN) for Hangul, then system. Set `font-synthesis: none`. Scale: 30/800 app title, 28/800 detail title, 26/800 screen title, 21–22/700 section & numbers, 19/700 poster text, 16 inputs (prevents iOS zoom), 15–15.5 body, 13–14.5 UI, 12 uppercase labels (+.06em), 11.5 credits.

**Radius:** 8, 10, 12, 14, 16, 18, 20–25 pills, 28 sheets, circles. **Spacing:** 4, 6, 8, 10, 12, 14, 16, 20, 24. **Shadows:** menu 0 14 36 rgba(0,0,0,.55); poster 0 18 40 rgba(0,0,0,.5); toast 0 10 30 rgba(0,0,0,.45).

Icons: simple 24-grid stroke icons (2–2.6 stroke, round caps) — use `lucide-react` equivalents: Plus, Menu, Search, ArrowUpDown, Check, ChevronLeft, Share, Download, Upload, RefreshCw, X, Star.

## Assets
None bundled. Posters/backdrops/cast photos from TMDB (`https://image.tmdb.org/t/p/w342|w780|w185`). Fonts from Google Fonts + Pretendard CDN (or self-host for offline). App icons: render from the 2f design.

---

## Getting the API keys
**TMDB (free):**
1. Create an account at themoviedb.org → Settings → API → "Create" → choose Developer, personal/non-commercial, fill the short form.
2. Copy the **API Read Access Token** (v4, long JWT). Use it as `Authorization: Bearer <token>`.
3. Attribution: show the TMDB logo + notice in Settings; JustWatch credit wherever providers appear (already in the designs).

**OMDb (free, 1,000 requests/day):**
1. Go to omdbapi.com → API Key → choose FREE, enter email.
2. Click the activation link in the email. Key is used as `?apikey=…`.

## Deploy (free)
**Worker (Cloudflare):**
```bash
npm i -g wrangler
cd worker && wrangler login
wrangler secret put TMDB_TOKEN
wrangler secret put OMDB_KEY
# wrangler.toml: name = "kbinge-api", vars ALLOWED_ORIGIN = "https://<user>.github.io"
wrangler deploy        # → https://kbinge-api.<subdomain>.workers.dev
```
**App (GitHub Pages):**
1. Create repo `k-binge` on GitHub, push.
2. `app/vite.config.ts`: `base: '/k-binge/'`; `.env.production`: `VITE_API_URL=https://kbinge-api.<subdomain>.workers.dev`.
3. Repo → Settings → Pages → Source: **GitHub Actions**.
4. Add `.github/workflows/pages.yml` (checkout → setup-node 20 → `npm ci && npm run build` in `app/` → `actions/upload-pages-artifact` with `app/dist` → `actions/deploy-pages`).
5. Open `https://<user>.github.io/k-binge/` on her iPhone in Safari → Share → Add to Home Screen.
Custom domain later: add `CNAME`, set `base: '/'`, update manifest scope and `ALLOWED_ORIGIN`.

## Later: sync
Swap `store.ts` for a remote store (Supabase table `entries` keyed by user + tmdbId, or Worker + D1). Entries already carry `updatedAt` for last-write-wins; `Show` stays a cache.

## Files
- `design/K-Binge 1a.dc.html` — chosen design (open in browser with `support.js` next to it)
- `design/K-Binge round 1.dc.html` — first-round explorations
- `design/support.js` — runtime needed to open the design files
