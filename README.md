# TechPulse — Global Technology News

A fast, responsive technology-news front end built with **Astro + TypeScript only**.
No backend, no database, no React/Vue/Svelte, no API keys.

It aggregates **real news** at build time from ~28 free, key-less public feeds:

- **Technology** — Hacker News, DEV, The Verge, Ars Technica, TechCrunch,
  Engadget, 9to5Mac, 9to5Google, BleepingComputer, GameSpot, Neowin,
  The New Stack, Lobsters, Spaceflight News
- **World** — BBC News, The Guardian (World + Climate crisis), NPR

Tech-classifiable stories route to their tech category; general headlines
(politics, conflict, disasters, climate) land in the **World** section. A bundled
set of ~60 mock articles backfills any thin category and serves as an offline
fallback, so `npm install && npm run dev` always works.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:4321  (Node >= 22.12 required)
```

Per this repo's `CLAUDE.md`, you can also run the dev server detached:

```bash
astro dev --background
astro dev status
astro dev logs
astro dev stop
```

### Build & preview

```bash
npm run build      # static output in ./dist
npm run preview    # serve the production build locally
```

The build is 100% static (`output: "static"`): 13 category pages, ~290 article
pages, home, trending, search, plus `sitemap.xml` and `rss.xml`. `npm run build`
fetches the live feeds once (~3s); `npm run dev` does the same on first request.

### Sourcing options (`.env`, all optional — see `.env.example`)

| Var | Default | Effect |
| --- | --- | --- |
| `NEWS_MODE` | `live` | `live` = real feeds + mock backfill · `mock` = bundled dataset only, no network |
| `NEWS_GOOGLE` | `false` | `true` adds Google News RSS per-topic feeds (broadens Apple/Google/Microsoft/Gaming/Mobile/Startups/Cloud/World). Off by default — Google rate-limits datacenter IPs and its feed terms target personal readers. |
| `NEWS_TTL_MINUTES` | `15` | How long fetched news stays fresh in a long-lived process (dev server / SSR) before an automatic background refetch. `0` disables the timer. No effect on a plain static build. |
| `NEWS_OG_IMAGES` | `true` | Hacker News and Lobsters items carry no image from their API. `true` fetches the linked article's real `og:image`/`twitter:image` as a fallback instead of a random stock photo. `false` skips it (faster refresh, no extra requests). |

Set them on the command line or in `.env`:

```bash
NEWS_MODE=mock npm run build          # or npm run dev
echo "NEWS_GOOGLE=true" >> .env
```

Every build/start prints the active mode:

```
[news] mode=live (live feeds ON), google-news OFF
```

**The dev server reads env vars once at startup.** If you use the background
server, restart it after changing `.env` or a var — otherwise the change is
ignored:

```bash
astro dev stop && NEWS_MODE=mock astro dev --background
```

`npm run build` always picks up the current values (new process each run).

---

## Project structure

```
src/
├── components/           Reusable Astro components (all styles scoped)
│   ├── Header.astro          Sticky header: logo, nav, search, theme toggle, mobile drawer
│   ├── Navigation.astro      Category nav (desktop bar + mobile drawer variants)
│   ├── ThemeToggle.astro     Light/dark switch, persisted to localStorage
│   ├── BreakingNews.astro    Animated breaking-news ticker
│   ├── FeaturedArticle.astro Large lead-story unit
│   ├── NewsCard.astro        Card: default / wide / compact variants
│   ├── NewsGrid.astro        Responsive grid of NewsCards
│   ├── NewsImage.astro       Lazy, responsive <img> with gradient fallback
│   ├── TrendingList.astro    Numbered ranking list
│   ├── CategorySection.astro Homepage category rail
│   ├── CategoryHeader.astro  Category page hero
│   ├── SearchBox.astro       Search input
│   ├── Newsletter.astro      Sign-up form (client-side validation only)
│   ├── Breadcrumbs.astro     Breadcrumb trail
│   ├── ArticleHeader.astro   Article title block + hero image + byline
│   ├── ArticleContent.astro  Article body + source attribution + tags
│   ├── ShareButtons.astro    Social share + copy link / native share sheet
│   ├── ReadingProgress.astro Scroll progress bar (article pages)
│   ├── RelatedArticles.astro Related / more-from-category grid
│   ├── BackToTop.astro       Back-to-top button
│   ├── Footer.astro          Site footer
│   └── SEO.astro             <head> metadata: OG, Twitter, canonical, robots, JSON-LD
├── data/
│   └── news.ts           ~60 mock articles (fallback + thin-category backfill)
├── layouts/
│   └── Layout.astro      HTML shell: SEO, no-flash theme script, Header/Footer
├── lib/
│   ├── format.ts         Date / "time ago" / reading-time helpers
│   └── news/             ── THE DATA LAYER ──
│       ├── index.ts          Public API: getNews, getNewsByCategory, getTrendingNews,
│       │                     getFeaturedNews, getBreakingNews, getNewsBySlug,
│       │                     getRelatedNews, searchNews, ...
│       ├── types.ts          RawItem / NewsSource types for aggregation
│       ├── sources.ts        ~28 live source adapters (HN, DEV, RSS feeds, world news, …) + registry
│       └── normalize.ts      RawItem -> Article, plus classify / dedupe / trending score
├── pages/
│   ├── index.astro           /
│   ├── trending.astro        /trending
│   ├── search.astro          /search   (client-side, instant filtering)
│   ├── news/[slug].astro     /news/:slug
│   ├── category/[category].astro   /category/:category
│   ├── rss.xml.ts            /rss.xml
│   ├── sitemap.xml.ts        /sitemap.xml
│   └── 404.astro
├── styles/
│   └── global.css        Design tokens (CSS variables), reset, shared primitives
└── types/
    └── news.ts           `Article`, `Category`, category metadata

public/
├── robots.txt
├── og-default.svg        Default social share image
└── favicon.svg / favicon.ico
```

---

## How it's wired

Every page and component imports **only** from `src/lib/news`:

```ts
import { getNews, getFeaturedNews, getNewsBySlug } from '../lib/news';
```

Nothing in `components/` or `pages/` knows where the data comes from. The whole
pipeline runs once per build (cached for the process) inside `loadArticles()`:

```
                    src/lib/news/sources.ts          src/lib/news/normalize.ts
                    ┌───────────────────────┐        ┌──────────────────────────┐
public feeds  ─────▶│ ~28 adapters          │ ─────▶ │ normalizeArticle()       │
(HN, RSS, JSON)     │ fetch() → RawItem[]    │ Raw    │ classifyCategory()       │
                    │ Promise.allSettled    │ Item[] │ dedupe()                 │
                    │ + 1 retry, 9s timeout │        │ capPerCategory()         │
                    └───────────────────────┘        │ trendingScore()          │
                                                     └────────────┬─────────────┘
     src/data/news.ts (mock) ──▶ backfill thin categories ────────┤
                              ──▶ full fallback if feeds fail      ▼
                                              getNews / getNewsByCategory / … ──▶ Astro
```

- **`sources.ts`** — the source registry. Each `NewsSource` has a `fetch()` that
  returns `Promise<RawItem[]>`. A failing source is logged and skipped
  (`Promise.allSettled`), so one dead feed never breaks the build.
- **`normalize.ts`** — `RawItem → Article`, plus `classifyCategory()` (two-tier
  keyword rules: strong signals anywhere, weak signals headline-only),
  `dedupe()` (same URL / same title), `ensureUniqueSlugs()`, `trendingScore()`
  (recency + source points/comments).
- **`index.ts`** — orchestration: fetch → normalize → dedupe → cap per category
  (`MAX_PER_CATEGORY`) → backfill thin categories from the mock set
  (`MIN_PER_CATEGORY`) → fall back to mock entirely if `< MIN_LIVE_TOTAL`.

### Adding another source

```ts
// in the SOURCES array in src/lib/news/sources.ts

// a publisher RSS/Atom feed (parser is built in, no dependency):
rss('techmeme', 'Techmeme', 'https://www.techmeme.com/feed.xml', 'Startups'),

// a JSON API — write a small adapter:
{
  id: 'my-api', name: 'My API', defaultCategory: 'AI', enabled: true,
  async fetch() {
    const data = await getJson('https://example.com/news.json');
    return data.items.map((it) => ({
      title: it.headline, link: it.url, summary: it.blurb,
      publishedAt: it.date, imageUrl: it.image, score: it.upvotes,
    })); // → RawItem[]
  },
},
```

That's the only file you touch. For a **News API with a key**, read it from
`import.meta.env.MY_KEY` (put it in `.env`, never hard-code) inside `fetch()`.

### Keeping it fresh (auto-refresh)

News is fetched when the code runs. There are two layers of freshness:

**1. Live processes refresh themselves.** `src/lib/news/index.ts` keeps a
TTL cache (`NEWS_TTL_MINUTES`, default **15**). In any long-lived process — the
dev server, or an SSR deployment — once the cache goes stale:

- the next read returns the old data **instantly** and refetches in the
  background (stale-while-revalidate — no request ever blocks after the first);
- a timer also refetches on its own every TTL, so data stays warm with zero
  traffic.

So `astro dev --background` already trickles in new stories on its own. Lower it
while testing:

```bash
astro dev stop && NEWS_TTL_MINUTES=2 astro dev --background
```

**2. A static deploy is only as fresh as its last build.** Pick one:

| Method | Setup |
| --- | --- |
| **GitHub Action** | `.github/workflows/refresh.yml` is included — rebuilds + redeploys to GitHub Pages every 15 min (`workflow_dispatch` for manual runs). Swap the deploy step for your host. |
| **Local loop** | `npm run refresh:loop` — rebuilds every `REFRESH_MINUTES` (default 15). Add `-- --deploy "<cmd>"` to push `dist/` somewhere after each build. |
| **cron** | `*/15 * * * * cd /path/to/news && npm run build && rsync -a --delete dist/ /var/www/news/` |
| **systemd timer** | a `news-refresh.service` (`ExecStart=npm run build`) + `news-refresh.timer` (`OnUnitActiveSec=15min`). |
| **Host ISR** | Deploy to Vercel / Netlify / Cloudflare with the matching Astro adapter and `Cache-Control: s-maxage=600, stale-while-revalidate` — the edge regenerates pages automatically. Needs `output: 'server'` + adapter (3-line change). |

All feed queries already request only the last **5–10 days** (`when:5d`,
`created_at_i>…`) and everything is sorted newest-first, so each refresh
surfaces genuinely new stories.

### Longer-term pipeline

```
Hundreds of sources → RSS/API ingestion → normalize → dedupe →
category detection → trending calculation → Astro frontend
```

Ingestion (`sources.ts`) and normalize/dedupe/classify/trending (`normalize.ts`)
are in place. What's left for scale: a persistent store + incremental refresh
instead of fetch-everything-per-build, and a real classifier/dedupe model.

---

## Features

- **Pages:** home, article detail (`/news/[slug]`), 13 category pages, trending, search, 404
- **Real data:** ~290 live articles from ~28 key-less public feeds (tech + world), refreshed every build
- **Dark / light mode** via CSS variables, persisted to `localStorage`, no flash on load
- **SEO:** per-page title/description/canonical, Open Graph, Twitter cards, robots,
  `NewsArticle` + `BreadcrumbList` JSON-LD on article pages, generated `sitemap.xml` & `rss.xml`
- **Responsive:** multi-column desktop → 2-col tablet → single-column mobile, nav collapses to a drawer
- **Performance:** static generation, lazy/responsive images, near-zero JavaScript
  (a few small inline `is:inline` scripts: theme toggle, mobile menu, ticker,
  search filter, reading progress, back-to-top)
- **UX:** card hover lift, image zoom on hover, breaking-news ticker, reading
  progress bar, back-to-top, sticky article sidebar, mobile-friendly share sheet,
  search empty state
- **Zero runtime dependencies** beyond Astro itself

---

## Commands

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server at `localhost:4321` |
| `npm run build` | Static production build to `./dist` |
| `npm run preview` | Preview the production build |
| `astro dev --background` | Run dev server detached (see `CLAUDE.md`) |
# news
