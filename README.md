# K-Binge

A K-drama tracker PWA for one person in the UK. Search a show, add it in one tap, then track status, episodes, a half-star rating, a note and who recommended it. Works offline and installs to the iPhone Home Screen.

- `app/`: React 18 + Vite + TypeScript PWA, deployed to GitHub Pages
- `worker/`: Cloudflare Worker that proxies TMDB and OMDb (the keys stay server-side) and serves `/share/:id` preview pages
- `design_handoff_k_binge/`: the design reference

## Viki check (Oct 2026)
`npm --prefix worker run check-viki` checked 10 popular K-dramas: **Viki was listed for 0 of 10 in GB**, and TMDB doesn't list Viki as a GB provider at all. That's why she can set platforms by hand (Detail → "No UK platform found · Set it" / "Edit"). Her choice is stored on her entry and survives data refreshes.

## Local dev
```bash
# worker/.dev.vars (gitignored):  TMDB_TOKEN=…  OMDB_KEY=…
npm --prefix worker install && npm --prefix worker run dev     # http://localhost:8787
npm --prefix app install && npm --prefix app run dev           # http://localhost:5173/k-binge/
npm --prefix app test
```

## Deploy
**Worker**
```bash
cd worker
npx wrangler login
npx wrangler secret put TMDB_TOKEN
npx wrangler secret put OMDB_KEY
npx wrangler deploy        # prints https://kbinge-api.<subdomain>.workers.dev
```
Put that URL in `app/.env.production` as `VITE_API_URL`. CORS origins are set in `worker/wrangler.toml` (`ALLOWED_ORIGIN`).

**App**: pushing to `main` runs `.github/workflows/pages.yml`. In the repo, go to Settings → Pages → Source and choose **GitHub Actions**.

On her iPhone, open `https://patelt79-eng.github.io/k-binge/` in Safari, tap Share, then Add to Home Screen.

## Attribution
This product uses the TMDB API but is not endorsed or certified by TMDB. Where to watch powered by JustWatch. IMDb and Rotten Tomatoes scores via OMDb.
