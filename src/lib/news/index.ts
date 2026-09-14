/**
 * PUBLIC NEWS API
 * ===============
 *
 * Every page and component imports from here and nowhere else:
 *
 *   import { getNews, getFeaturedNews, getNewsBySlug } from '../lib/news';
 *
 * Right now `loadArticles()` returns the local mock dataset. When
 * `src/lib/news/sources.ts` has an enabled source, it will instead fetch,
 * normalize, de-duplicate and score live items — without any change to the
 * function signatures below, and therefore without any change to the UI.
 */

import type { Article, Category } from '../../types/news';
import { CATEGORIES, categoryBySlug } from '../../types/news';
import { RAW_ARTICLES } from '../../data/news';
import { getAllRawItems, hasLiveSources } from './sources';
import { dedupe, ensureUniqueSlugs, normalizeArticle, trendingScore } from './normalize';

export type { Article, Category };
export { CATEGORIES, categoryBySlug };

/* ───────────────────────────── freshness / caching ─────────────────────────
 * A single build is a one-shot process, so the cache below just dedupes work
 * within it. But when the code runs in a LONG-LIVED process — the dev server,
 * `astro preview`, or an on-demand (SSR) deployment — the same cache makes the
 * site auto-refresh:
 *
 *   • entries older than NEWS_TTL_MINUTES are considered stale
 *   • a stale read returns the old data immediately AND kicks off a background
 *     refetch (stale-while-revalidate) — no request ever blocks after the first
 *   • a timer also refetches on its own every TTL, so data stays warm even with
 *     no traffic
 *
 * For a purely static deploy, freshness = how often you rebuild. See the
 * "auto-refresh" section of the README (cron / GitHub Action / systemd timer).
 * ------------------------------------------------------------------------- */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name] ?? process.env[`PUBLIC_${name}`];
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const TTL_MS = envInt('NEWS_TTL_MINUTES', 15) * 60_000;

interface CacheEntry {
  articles: Article[];
  at: number;
}
let cache: CacheEntry | null = null;
let inFlight: Promise<Article[]> | null = null;
let timerStarted = false;

/** Minimum live articles per category before we backfill it from the mock set. */
const MIN_PER_CATEGORY = 3;
/** Cap per category so one busy topic (usually AI) can't swamp the site. */
const MAX_PER_CATEGORY = 26;
/** If the live feeds return fewer than this in total, fall back to mock entirely. */
const MIN_LIVE_TOTAL = 12;
/**
 * How long a previously-fetched live article stays eligible to be carried
 * forward into the next refresh, even once it scrolls out of the source
 * feed's current window. See the "permalink 404" note on `buildArticles`.
 */
const MAX_CARRY_FORWARD_AGE_MS = 3 * 86_400_000;

function byNewest(a: Article, b: Article): number {
  return +new Date(b.publishedAt) - +new Date(a.publishedAt);
}

/** Keep the newest `MAX_PER_CATEGORY` of each category. */
function capPerCategory(articles: Article[]): Article[] {
  const counts = new Map<Category, number>();
  const out: Article[] = [];
  for (const a of [...articles].sort(byNewest)) {
    const n = (counts.get(a.category) ?? 0) + 1;
    counts.set(a.category, n);
    if (n <= MAX_PER_CATEGORY) out.push(a);
  }
  return out;
}

/** Promote the strongest recent stories to `featured` so hero slots fill. */
function assignFeatured(articles: Article[], count = 4): void {
  const now = Date.now();
  const ranked = [...articles]
    .filter((a) => now - new Date(a.publishedAt).getTime() < 4 * 86_400_000)
    .sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
  for (const a of ranked.slice(0, count)) a.featured = true;
}

/** Pure pipeline: fetch every source, normalize, dedupe, cap, backfill, sort. */
async function buildArticles(): Promise<Article[]> {
  let articles: Article[];

  if (hasLiveSources()) {
    // ── REAL DATA PATH ─────────────────────────────────────────────────────
    // Fetch every enabled public API, normalize to `Article`, de-duplicate.
    const raw = await getAllRawItems();
    const fresh = dedupe(raw.map(normalizeArticle));

    // Each source feed only exposes its *current* window (HN front page,
    // an RSS feed's latest N items, ...). Every TTL a story that's still
    // perfectly valid can simply scroll out of that window and vanish from
    // `fresh` — and because `/news/[slug]` derives its whole path list from
    // this same article set, that instantly 404s anyone with the permalink,
    // often within minutes of it being shared. Carry forward still-recent
    // live articles from the previous cache so a slug stays resolvable until
    // it naturally ages out (below) or is capped out by `capPerCategory`,
    // not the moment a feed rotates. `dedupe` keeps the `fresh` copy when a
    // story appears in both (fresher counts/timestamps).
    const carried = (cache?.articles ?? []).filter(
      (a) => !a.isMock && Date.now() - new Date(a.publishedAt).getTime() < MAX_CARRY_FORWARD_AGE_MS,
    );
    const live = ensureUniqueSlugs(capPerCategory(dedupe([...fresh, ...carried])));

    if (live.length < MIN_LIVE_TOTAL) {
      console.warn(`[news] only ${live.length} live articles — using mock dataset instead`);
      articles = [...RAW_ARTICLES].sort(byNewest);
    } else {
      // Backfill thin categories with mock stories so every section looks full.
      const perCat = new Map<Category, number>();
      for (const a of live) perCat.set(a.category, (perCat.get(a.category) ?? 0) + 1);

      const usedSlugs = new Set(live.map((a) => a.slug));
      const backfill: Article[] = [];
      for (const cat of CATEGORIES) {
        const have = perCat.get(cat.name) ?? 0;
        if (have >= MIN_PER_CATEGORY) continue;
        const fillers = RAW_ARTICLES.filter(
          (a) => a.category === cat.name && !usedSlugs.has(a.slug),
        ).slice(0, MIN_PER_CATEGORY - have);
        for (const f of fillers) usedSlugs.add(f.slug);
        backfill.push(...fillers);
      }

      articles = [...live, ...backfill].sort(byNewest);
      assignFeatured(articles);
      console.log(
        `[news] ${live.length} live + ${backfill.length} mock backfill = ${articles.length} articles`,
      );
    }
  } else {
    // ── MOCK-ONLY PATH (NEWS_MODE=mock) ────────────────────────────────────
    articles = [...RAW_ARTICLES].sort(byNewest);
  }

  return articles;
}

/** Refetch and swap the cache. De-duped so concurrent callers share one run. */
function refresh(): Promise<Article[]> {
  if (inFlight) return inFlight;
  inFlight = buildArticles()
    .then((articles) => {
      cache = { articles, at: Date.now() };
      return articles;
    })
    .catch((err) => {
      console.warn('[news] refresh failed, keeping previous data:', err);
      return cache?.articles ?? [];
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Start a self-refresh timer once, in long-lived processes only. */
function ensureTimer(): void {
  if (timerStarted || TTL_MS === 0) return;
  timerStarted = true;
  // Survive dev-server HMR: clear any interval a previous module instance left.
  const g = globalThis as { __newsTimer?: ReturnType<typeof setInterval> };
  if (g.__newsTimer) clearInterval(g.__newsTimer);
  const t = setInterval(() => {
    refresh().catch(() => {});
  }, TTL_MS);
  // Don't keep a one-shot `astro build` process alive.
  (t as { unref?: () => void }).unref?.();
  g.__newsTimer = t;
}

/**
 * Public accessor used by every query below.
 * - first call: fetch and wait
 * - fresh cache: instant
 * - stale cache: return stale now, refetch in the background
 */
async function loadArticles(): Promise<Article[]> {
  ensureTimer();

  if (!cache) return refresh();

  const age = Date.now() - cache.at;
  if (age > TTL_MS && TTL_MS > 0) {
    void refresh(); // stale-while-revalidate: don't await
  }
  return cache.articles;
}

/** Force a synchronous refetch (used by the `/api/refresh` endpoint). */
export async function forceRefresh(): Promise<{ count: number; at: string }> {
  cache = null;
  const articles = await refresh();
  return { count: articles.length, at: new Date(cache?.at ?? Date.now()).toISOString() };
}

/** Metadata for debugging / a status endpoint. */
export function cacheStatus() {
  return {
    cached: Boolean(cache),
    count: cache?.articles.length ?? 0,
    ageSeconds: cache ? Math.round((Date.now() - cache.at) / 1000) : null,
    ttlMinutes: TTL_MS / 60_000,
    refreshing: Boolean(inFlight),
  };
}

/** For tests / dev tooling only. */
export function _clearCache(): void {
  cache = null;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pageSize,
    total,
    totalPages,
    hasPrev: current > 1,
    hasNext: current < totalPages,
  };
}

/** All articles, newest first. */
export async function getNews(limit?: number): Promise<Article[]> {
  const all = await loadArticles();
  return typeof limit === 'number' ? all.slice(0, limit) : all;
}

/** Articles in one category (accepts a category name or its slug). */
export async function getNewsByCategory(
  category: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<Paginated<Article>> {
  const all = await loadArticles();
  const meta = categoryBySlug(category) ?? CATEGORIES.find((c) => c.name === category);
  const name = meta?.name ?? category;
  const filtered = all.filter((a) => a.category === name);
  return paginate(filtered, opts.page ?? 1, opts.pageSize ?? 9);
}

/** Trending articles, ranked by score (see `trendingScore`). */
export async function getTrendingNews(limit = 10): Promise<Article[]> {
  const all = await loadArticles();
  const now = Date.now();
  return [...all]
    .filter((a) => a.trending || trendingScore(a, now) > 0.35)
    .sort((a, b) => trendingScore(b, now) - trendingScore(a, now))
    .slice(0, limit);
}

/** The single lead story, plus the runners-up for a featured strip. */
export async function getFeaturedNews(limit = 1): Promise<Article[]> {
  const all = await loadArticles();
  const featured = all.filter((a) => a.featured);
  const pool = featured.length >= limit ? featured : [...featured, ...all.filter((a) => !a.featured)];
  return pool.slice(0, limit);
}

/** Breaking = flagged as trending AND published in the last ~36h. */
export async function getBreakingNews(limit = 5): Promise<Article[]> {
  const all = await loadArticles();
  const cutoff = Date.now() - 36 * 3_600_000;
  const recent = all.filter((a) => new Date(a.publishedAt).getTime() >= cutoff);
  const pick = (recent.length ? recent : all).filter((a) => a.trending || a.featured);
  return (pick.length ? pick : all).slice(0, limit);
}

/** One article by slug, or null. */
export async function getNewsBySlug(slug: string): Promise<Article | null> {
  const all = await loadArticles();
  return all.find((a) => a.slug === slug) ?? null;
}

/** Related: same category first, then shared tags, excluding the article itself. */
export async function getRelatedNews(article: Article, limit = 3): Promise<Article[]> {
  const all = await loadArticles();
  const others = all.filter((a) => a.slug !== article.slug);
  const scored = others
    .map((a) => {
      let score = a.category === article.category ? 2 : 0;
      score += a.tags.filter((t) => article.tags.includes(t)).length;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || +new Date(y.a.publishedAt) - +new Date(x.a.publishedAt));
  const picked = scored.slice(0, limit).map((x) => x.a);
  if (picked.length < limit) {
    picked.push(...others.filter((a) => !picked.includes(a)).slice(0, limit - picked.length));
  }
  return picked;
}

/** More from a category, excluding a given article. */
export async function getMoreFromCategory(article: Article, limit = 4): Promise<Article[]> {
  const all = await loadArticles();
  return all.filter((a) => a.category === article.category && a.slug !== article.slug).slice(0, limit);
}

export interface SearchResult extends Article {
  _matched: string[];
}

/**
 * Client- and server-usable search. Matches title, excerpt, category, source,
 * author and tags. Case-insensitive, all terms must match somewhere.
 */
export function searchArticles(articles: Article[], query: string): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return articles
    .map((a) => {
      const fields: Record<string, string> = {
        title: a.title.toLowerCase(),
        excerpt: a.excerpt.toLowerCase(),
        category: a.category.toLowerCase(),
        source: a.source.toLowerCase(),
        author: a.author.toLowerCase(),
        tags: a.tags.join(' ').toLowerCase(),
      };
      const matched = new Set<string>();
      const ok = terms.every((term) => {
        let hit = false;
        for (const [name, value] of Object.entries(fields)) {
          if (value.includes(term)) {
            matched.add(name);
            hit = true;
          }
        }
        return hit;
      });
      return ok ? { ...a, _matched: [...matched] } : null;
    })
    .filter((x): x is SearchResult => x !== null);
}

export async function searchNews(query: string): Promise<SearchResult[]> {
  const all = await loadArticles();
  return searchArticles(all, query);
}

/** Everything the client-side search page needs, as a plain array. */
export async function getSearchIndex(): Promise<Article[]> {
  return loadArticles();
}

/** Distinct categories that actually have at least one article. */
export async function getActiveCategories() {
  const all = await loadArticles();
  const counts = new Map<Category, number>();
  for (const a of all) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  return CATEGORIES.map((c) => ({ ...c, count: counts.get(c.name) ?? 0 }));
}
