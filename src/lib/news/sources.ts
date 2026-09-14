/**
 * SOURCE REGISTRY — LIVE
 * ======================
 *
 * These adapters pull REAL technology news from free, key-less public sources
 * (Hacker News and DEV are listed in https://github.com/public-apis/public-apis
 * under "News"; the rest are standard publisher RSS/Atom feeds):
 *
 *   JSON APIs   Hacker News (hn.algolia.com) · DEV/Forem (dev.to/api) ·
 *               Spaceflight News API · Lobsters (lobste.rs/*.json)
 *   RSS / Atom  The Verge · Ars Technica (x3 sections) · TechCrunch · Engadget ·
 *               9to5Mac · 9to5Google · BleepingComputer · GameSpot · Neowin ·
 *               The New Stack
 *   World news  BBC News · The Guardian (World + Climate) · NPR
 *   Opt-in      Google News RSS per-topic feeds (NEWS_GOOGLE=true)
 *
 * No API key, no account, no env var required. Everything is fetched at build
 * time (or on each dev request) and run through `normalizeArticle()`.
 *
 * Fetching is resilient: each source has a timeout and a try/catch, and
 * `getAllRawItems()` uses `Promise.allSettled` so one slow/broken feed never
 * breaks the build. `src/lib/news/index.ts` additionally falls back to the
 * bundled mock dataset if the live feeds return too little.
 *
 * ── Turn live news off ──────────────────────────────────────────────────────
 * Set `NEWS_MODE=mock` in the environment (or `.env`) to ignore these entirely.
 *
 * ── Add your own source ─────────────────────────────────────────────────────
 * Write a `NewsSource` whose `fetch()` returns `Promise<RawItem[]>`, push it
 * into `SOURCES`, done. A generic RSS helper (`rssSource`) is included below.
 */

import type { Category } from '../../types/news';
import type { NewsSource, RawItem } from './types';

/**
 * Read an env var from every place Astro/Vite might surface it:
 *  - `process.env`         — shell vars and `.env` (Astro loads `.env` into it)
 *  - `import.meta.env`     — Vite's view (only PUBLIC_* custom vars land here)
 * Values are trimmed and lower-cased; surrounding quotes are stripped.
 */
function readEnv(name: string): string | undefined {
  const ime = (import.meta as any).env ?? {};
  const raw =
    process.env[name] ??
    process.env[`PUBLIC_${name}`] ??
    ime[name] ??
    ime[`PUBLIC_${name}`];
  if (raw == null) return undefined;
  return String(raw).trim().replace(/^["']|["']$/g, '').toLowerCase();
}

const MODE = readEnv('NEWS_MODE') || 'live';
const LIVE_ENABLED = MODE !== 'mock';
const GOOGLE_ENABLED = readEnv('NEWS_GOOGLE') === 'true';
const OG_IMAGES_ENABLED = readEnv('NEWS_OG_IMAGES') !== 'false';

console.log(
  `[news] mode=${MODE} (live feeds ${LIVE_ENABLED ? 'ON' : 'OFF'}), google-news ${GOOGLE_ENABLED ? 'ON' : 'OFF'}, og-images ${OG_IMAGES_ENABLED ? 'ON' : 'OFF'}`,
);

// NB: some feeds (dev.to) reject User-Agents containing "bot" or "Astro".
const UA = 'TechPulse/1.0 (+https://techpulse.example)';
const TIMEOUT_MS = 9000;

/* ------------------------------------------------------------------ fetching */

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** One retry on transient failure (network blip, 429, 5xx). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await new Promise((r) => setTimeout(r, 600));
    return fn();
  }
}

async function getJson<T = any>(url: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetchWithTimeout(url, 'application/json');
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return (await res.json()) as T;
  });
}

async function getText(url: string): Promise<string> {
  return withRetry(async () => {
    const res = await fetchWithTimeout(url, 'application/rss+xml, application/xml, text/xml');
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return await res.text();
  });
}

/* --------------------------------------------------------------- HTML helpers */

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Some publishers' feeds only embed the small inline thumbnail their
 * `<description>` HTML uses for a related-links list — not a real hero photo
 * — and CSS then stretches that tiny image to fill a ~900px-wide article
 * header, which is what makes it look blurry. Where the CDN's own resizing
 * convention is known, ask it for a bigger rendition of the *same* image
 * instead of upscaling the thumbnail:
 *   - BBC (ichef.bbci.co.uk): width is a path segment (`/standard/240/`),
 *     unsigned — bumping it is safe and verified to return a bigger image.
 *   - Guardian (i.guim.co.uk) uses the same `?width=` idea, BUT its URL is
 *     HMAC-signed over the query params (`s=...`): changing `width` without
 *     re-signing gets the request rejected outright (401), which is worse
 *     than the small thumbnail. We can't fix their URL, so instead we treat
 *     a small signed Guardian thumbnail as *no image* (empty string) — that
 *     routes it into `backfillOgImages()` below, which fetches the real
 *     full-size photo straight from the article page instead.
 */
function upsizeKnownImage(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'i.guim.co.uk') {
      const w = Number(u.searchParams.get('width') ?? '0');
      return w > 0 && w < 400 ? '' : url;
    }
    if (u.hostname.endsWith('ichef.bbci.co.uk')) {
      return url.replace(/\/standard\/\d+\//, '/standard/1600/');
    }
    for (const param of ['width', 'w']) {
      const val = u.searchParams.get(param);
      if (val && /^\d+$/.test(val) && Number(val) < 400) {
        u.searchParams.set(param, '1200');
        return u.toString();
      }
    }
    return url;
  } catch {
    return url;
  }
}

/* --------------------------------------------------------------- RSS adapter */

/** Minimal, dependency-free RSS 2.0 / Atom item extractor. */
export function parseRss(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) ?? [];
  const pick = (block: string, tag: string): string | undefined => {
    const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return m ? decodeEntities(m[1]).trim() : undefined;
  };
  for (const block of blocks) {
    const title = pick(block, 'title');
    if (!title) continue;
    let link = pick(block, 'link');
    if (!link) {
      const href = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      link = href?.[1];
    }
    if (!link) continue;
    const descRaw = pick(block, 'description') ?? pick(block, 'summary');
    const contentRaw = pick(block, 'content') ?? pick(block, 'content:encoded');
    const source = pick(block, 'source');
    const imgMatch =
      block.match(/<media:content[^>]*\burl=["']([^"']+)["']/i) ||
      block.match(/<media:thumbnail[^>]*\burl=["']([^"']+)["']/i) ||
      block.match(/<enclosure[^>]*\burl=["']([^"']+\.(?:jpe?g|png|webp|avif)[^"']*)["']/i) ||
      block.match(/<img[^>]*\bsrc=["']([^"']+)["']/i);
    const authorRaw = pick(block, 'dc:creator') ?? pick(block, 'author') ?? pick(block, 'name');
    const cats = [
      ...[...block.matchAll(/<category\b[^>]*\bterm=["']([^"']+)["']/gi)].map((m) => m[1]),
      ...[...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => stripTags(m[1])),
    ].filter(Boolean);
    items.push({
      title: stripTags(title),
      link: link.trim(),
      summary: descRaw ? stripTags(descRaw).slice(0, 400) : undefined,
      contentHtml: contentRaw,
      publishedAt: pick(block, 'pubDate') ?? pick(block, 'published') ?? pick(block, 'updated'),
      imageUrl: (imgMatch?.[1] && upsizeKnownImage(imgMatch[1].replace(/&amp;/g, '&'))) || undefined,
      author: authorRaw ? stripTags(authorRaw) : undefined,
      guid: pick(block, 'guid') ?? pick(block, 'id') ?? link.trim(),
      categories: [...(source ? [stripTags(source)] : []), ...cats].slice(0, 8),
    });
  }
  return items;
}

export function rssSource(opts: {
  id: string;
  name: string;
  url: string;
  defaultCategory?: Category;
  enabled?: boolean;
  /** Keep at most this many items (feeds like Google News return 100+). */
  limit?: number;
}): NewsSource {
  return {
    id: opts.id,
    name: opts.name,
    defaultCategory: opts.defaultCategory,
    enabled: opts.enabled ?? true,
    async fetch() {
      const items = parseRss(await getText(opts.url));
      return opts.limit ? items.slice(0, opts.limit) : items;
    },
  };
}

/* ----------------------------------------------------------- Hacker News */

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  story_text?: string | null;
  _tags?: string[];
}

function hnHitToItem(hit: HnHit): RawItem | null {
  if (!hit.title) return null;
  const discussion = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  return {
    title: hit.title,
    link: hit.url || discussion,
    summary: hit.story_text ? stripTags(hit.story_text).slice(0, 400) : undefined,
    author: hit.author || 'Hacker News',
    publishedAt: hit.created_at,
    score: hit.points ?? 0,
    commentCount: hit.num_comments ?? 0,
    guid: `hn-${hit.objectID}`,
  };
}

function hackerNewsFrontPage(): NewsSource {
  return {
    id: 'hn-front-page',
    name: 'Hacker News',
    enabled: true,
    async fetch() {
      const data = await getJson<{ hits: HnHit[] }>(
        'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40',
      );
      return data.hits.map(hnHitToItem).filter((x): x is RawItem => x !== null);
    },
  };
}

/**
 * HN topic feed. Algolia's `query` is token search, not boolean — "x OR y"
 * matches nothing — so pass an array of single terms and we merge the results.
 */
function hackerNewsTopic(id: string, terms: string[], defaultCategory: Category): NewsSource {
  return {
    id: `hn-${id}`,
    name: 'Hacker News',
    defaultCategory,
    enabled: true,
    async fetch() {
      const since = Math.floor(Date.now() / 1000) - 10 * 86400; // last ~10 days
      const filter = encodeURIComponent(`points>20,created_at_i>${since}`);
      const perTerm = await Promise.all(
        terms.map(async (term) => {
          const url =
            `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(term)}` +
            `&tags=story&numericFilters=${filter}&hitsPerPage=10`;
          try {
            const data = await getJson<{ hits: HnHit[] }>(url);
            return data.hits;
          } catch {
            return [];
          }
        }),
      );
      const seen = new Set<string>();
      const merged: RawItem[] = [];
      for (const hit of perTerm.flat()) {
        if (seen.has(hit.objectID)) continue;
        seen.add(hit.objectID);
        const item = hnHitToItem(hit);
        if (item) merged.push(item);
      }
      return merged;
    },
  };
}

/* ------------------------------------------------------------------ DEV.to */

interface DevArticle {
  title: string;
  description: string;
  url: string;
  cover_image: string | null;
  social_image: string | null;
  published_timestamp: string;
  edited_at: string | null;
  positive_reactions_count: number;
  public_reactions_count: number;
  comments_count: number;
  reading_time_minutes: number;
  tag_list: string[];
  user: { name: string };
}

function devToTag(tag: string, defaultCategory: Category): NewsSource {
  return {
    id: `devto-${tag}`,
    name: 'DEV Community',
    defaultCategory,
    enabled: true,
    async fetch() {
      const data = await getJson<DevArticle[]>(
        `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=12&top=7`,
      );
      return data.map((a) => ({
        title: a.title,
        link: a.url,
        summary: a.description,
        imageUrl: a.cover_image || a.social_image || undefined,
        author: a.user?.name || 'DEV Community',
        publishedAt: a.published_timestamp,
        updatedAt: a.edited_at ?? a.published_timestamp,
        score: a.public_reactions_count ?? a.positive_reactions_count ?? 0,
        commentCount: a.comments_count ?? 0,
        readingMinutes: a.reading_time_minutes,
        tags: a.tag_list,
        categories: a.tag_list,
        guid: a.url,
      }));
    },
  };
}

/* -------------------------------------------------------- Spaceflight News */

interface SpaceflightArticle {
  title: string;
  url: string;
  image_url: string;
  news_site: string;
  summary: string;
  published_at: string;
  updated_at: string;
  authors: { name: string }[];
}

function spaceflightNews(): NewsSource {
  return {
    id: 'spaceflight-news',
    name: 'Spaceflight News',
    defaultCategory: 'Science',
    enabled: true,
    async fetch() {
      const data = await getJson<{ results: SpaceflightArticle[] }>(
        'https://api.spaceflightnewsapi.net/v4/articles/?limit=20&ordering=-published_at',
      );
      return data.results.map((a) => ({
        title: a.title,
        link: a.url,
        summary: stripTags(a.summary).slice(0, 400),
        imageUrl: a.image_url || undefined,
        author: a.authors?.[0]?.name || a.news_site || 'Spaceflight News',
        publishedAt: a.published_at,
        updatedAt: a.updated_at,
        guid: a.url,
      }));
    },
  };
}

/* ------------------------------------------------------------------ Lobsters */

interface LobstersStory {
  title: string;
  url: string;
  short_id_url: string;
  comments_url: string;
  score: number;
  comment_count: number;
  created_at: string;
  description_plain?: string;
  tags: string[];
}

function lobsters(): NewsSource {
  return {
    id: 'lobsters',
    name: 'Lobsters',
    defaultCategory: 'Programming',
    enabled: true,
    async fetch() {
      const data = await getJson<LobstersStory[]>('https://lobste.rs/newest.json');
      return data
        .filter((s) => s.url) // skip text-only "ask" posts
        .map((s) => ({
          title: s.title,
          link: s.url,
          summary: s.description_plain?.slice(0, 400) || undefined,
          author: undefined,
          publishedAt: s.created_at,
          score: s.score ?? 0,
          commentCount: s.comment_count ?? 0,
          tags: s.tags,
          categories: s.tags,
          guid: s.short_id_url,
        }));
    },
  };
}

/* ------------------------------------------------------------- OG image fallback */

/**
 * Some sources carry no image at all — Hacker News and Lobsters just link out
 * to the discussion/story, no thumbnail — so those items fell back to a
 * random `picsum.photos` stock photo picked by `normalizeArticle()`. That
 * reads as fake/demo, not a real photo of the actual story. For any raw item
 * with no `imageUrl`, fetch the linked article's `<head>` and pull its
 * `og:image` (falling back to `twitter:image`) — the same image the real
 * publisher shows when the link is shared anywhere else.
 *
 * Bounded so a slow/hostile site can't stall a refresh: a short per-request
 * timeout, only the first ~60KB read (the meta tags are always in `<head>`),
 * and limited concurrency across all lookups in one refresh. Failures just
 * leave `imageUrl` unset — `normalizeArticle()`'s placeholder still applies,
 * so this can only improve on the old behavior, never break it. Results are
 * cached by URL for the life of the process since the same HN/Lobsters story
 * keeps reappearing across TTL refreshes.
 */
const OG_TIMEOUT_MS = 5000;
const OG_MAX_BYTES = 60_000;
const OG_CONCURRENCY = 10;

const ogImageCache = new Map<string, string | null>();

async function fetchOgImage(pageUrl: string): Promise<string | null> {
  if (ogImageCache.has(pageUrl)) return ogImageCache.get(pageUrl) ?? null;
  const result = await lookupOgImage(pageUrl);
  ogImageCache.set(pageUrl, result);
  return result;
}

async function lookupOgImage(pageUrl: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OG_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'text/html' },
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let bytes = 0;
    try {
      while (bytes < OG_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    const m =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i);
    if (!m) return null;
    return new URL(decodeEntities(m[1]), pageUrl).toString();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Backfill `imageUrl` for items whose source didn't supply one. Mutates in place. */
async function backfillOgImages(items: RawItem[]): Promise<void> {
  if (!OG_IMAGES_ENABLED) return;
  const missing = items.filter((it) => !it.imageUrl && /^https?:\/\//.test(it.link));
  if (!missing.length) return;
  await mapLimit(missing, OG_CONCURRENCY, async (it) => {
    const image = await fetchOgImage(it.link);
    if (image) it.imageUrl = image;
  });
}

/* --------------------------------------------------------- source registry */

/**
 * Google News RSS — per topic. Handy for filling the company/consumer
 * categories, BUT: Google rate-limits datacenter IPs hard (you'll get a single
 * item back once throttled) and its feed terms target personal feed readers.
 * So it's OPT-IN: set NEWS_GOOGLE=true to include it.
 */
function gnews(id: string, q: string, defaultCategory: Category): NewsSource {
  return rssSource({
    id: `gnews-${id}`,
    name: 'Google News',
    defaultCategory,
    limit: 12,
    url:
      `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}` +
      `&hl=en-US&gl=US&ceid=US:en`,
    enabled: GOOGLE_ENABLED,
  });
}

const rss = (
  id: string,
  name: string,
  url: string,
  defaultCategory?: Category,
  limit = 20,
): NewsSource => rssSource({ id, name, url, defaultCategory, limit });

export const SOURCES: NewsSource[] = LIVE_ENABLED
  ? [
      // ── Aggregators / community (JSON APIs, very reliable) ────────────────
      hackerNewsFrontPage(),
      hackerNewsTopic('ai', ['LLM', 'OpenAI', 'Anthropic'], 'AI'),
      hackerNewsTopic('security', ['vulnerability', 'ransomware', 'breach'], 'Cybersecurity'),
      hackerNewsTopic('programming', ['compiler', 'rust', 'typescript'], 'Programming'),
      hackerNewsTopic('startups', ['funding', 'raised', 'startup'], 'Startups'),
      hackerNewsTopic('hardware', ['GPU', 'semiconductor', 'nvidia'], 'Hardware'),
      lobsters(),

      devToTag('ai', 'AI'),
      devToTag('security', 'Cybersecurity'),
      devToTag('programming', 'Programming'),
      devToTag('devops', 'Cloud'),

      // ── Publisher feeds (RSS/Atom, published for feed readers). We show only
      //    headline + snippet + a link to the original. ─────────────────────
      rss('the-verge', 'The Verge', 'https://www.theverge.com/rss/index.xml'),
      rss('ars-technica', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'),
      rss('ars-gadgets', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/gadgets', 'Hardware'),
      rss('ars-tech-lab', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/technology-lab', 'Programming'),
      rss('techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/', 'Startups'),
      rss('engadget', 'Engadget', 'https://www.engadget.com/rss.xml', 'Mobile'),
      rss('the-new-stack', 'The New Stack', 'https://thenewstack.io/feed/', 'Cloud', 18),
      rss('neowin', 'Neowin', 'https://www.neowin.net/news/rss/', 'Microsoft', 24),
      rss('bleepingcomputer', 'BleepingComputer', 'https://www.bleepingcomputer.com/feed/', 'Cybersecurity', 15),
      rss('9to5mac', '9to5Mac', 'https://9to5mac.com/feed/', 'Apple', 14),
      rss('9to5google', '9to5Google', 'https://9to5google.com/feed/', 'Google', 14),
      rss('gamespot', 'GameSpot', 'https://www.gamespot.com/feeds/mashup/', 'Gaming', 15),
      spaceflightNews(),

      // ── World / general news (beyond technology) ────────────────────────
      //    Tech-classifiable stories still route to their tech category; the
      //    rest (politics, conflict, disasters, climate) land in "World".
      rss('bbc-world', 'BBC News', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'World', 16),
      rss('guardian-world', 'The Guardian', 'https://www.theguardian.com/world/rss', 'World', 16),
      rss('npr-world', 'NPR', 'https://feeds.npr.org/1004/rss.xml', 'World', 10),
      rss('guardian-climate', 'The Guardian', 'https://www.theguardian.com/environment/climate-crisis/rss', 'Science', 12),

      // ── Optional: NEWS_GOOGLE=true ──────────────────────────────────────
      gnews('apple', 'Apple iPhone OR Mac OR iOS OR "Apple Intelligence"', 'Apple'),
      gnews('google', 'Google Android OR Pixel OR Gemini OR Chrome', 'Google'),
      gnews('microsoft', 'Microsoft Windows OR Copilot OR Xbox OR Azure', 'Microsoft'),
      gnews('gaming', 'video game OR PlayStation OR Nintendo OR Steam', 'Gaming'),
      gnews('mobile', 'smartphone OR 5G OR foldable OR "Samsung Galaxy"', 'Mobile'),
      gnews('startups', 'tech startup OR "raises" OR "venture capital"', 'Startups'),
      gnews('cloud', 'AWS OR Azure OR "Google Cloud" OR datacenter', 'Cloud'),
      gnews('world', 'breaking world news OR disaster OR election OR conflict', 'World'),
    ]
  : [];

/** Whether any real source is wired up and enabled. */
export function hasLiveSources(): boolean {
  return SOURCES.some((s) => s.enabled);
}

/**
 * Fetch every enabled source concurrently. A failing source is logged and
 * skipped rather than breaking the whole build.
 */
export async function getAllRawItems(): Promise<RawItem[]> {
  const enabled = SOURCES.filter((s) => s.enabled);
  const results = await Promise.allSettled(
    enabled.map(async (source) => {
      const items = await source.fetch();
      return items.map((it) => ({
        ...it,
        __sourceName: it.__sourceName ?? source.name,
        __defaultCategory: source.defaultCategory,
      }));
    }),
  );

  const items: RawItem[] = [];
  let ok = 0;
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      ok++;
      items.push(...(r.value as RawItem[]));
    } else {
      console.warn(`[news] source "${enabled[i]?.id}" failed: ${r.reason}`);
    }
  }
  console.log(`[news] fetched ${items.length} items from ${ok}/${enabled.length} live sources`);

  const beforeImages = items.filter((it) => !it.imageUrl).length;
  if (beforeImages) {
    await backfillOgImages(items);
    const filled = beforeImages - items.filter((it) => !it.imageUrl).length;
    console.log(`[news] og-image backfill: ${filled}/${beforeImages} filled`);
  }

  return items;
}
