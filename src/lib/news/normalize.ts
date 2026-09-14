/**
 * NORMALIZATION
 * =============
 *
 * Turns a loosely-typed `RawItem` from any source into the strict `Article`
 * shape the whole UI consumes. Also hosts the small helpers that a real
 * aggregation pipeline needs: slugging, category classification, reading-time
 * estimation, de-duplication and a trending score.
 *
 * None of this runs in the mock build (there are no sources), but it is written
 * and typed so that flipping on a source in `sources.ts` Just Works.
 */

import type { Article, Category } from '../../types/news';
import { CATEGORIES } from '../../types/news';
import type { RawItem } from './types';

const VALID_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.name));

/** URL-safe slug from arbitrary text. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/** Strip HTML to plain text for excerpts and reading-time math. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function makeExcerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(' ', max)).trim() + '…';
}

/**
 * Best-effort category classification.
 *
 * Two tiers of signal:
 *  - "strong" patterns are specific enough to trust anywhere in the text.
 *  - "weak" patterns (single ambiguous words like "AI", "game", "chip") are
 *    only trusted when they appear in the *headline*, because in 2026 half of
 *    all tech articles mention "AI" somewhere in the body.
 *
 * Order matters: the first category to match wins, so company/topic buckets
 * are listed before the catch-all AI bucket.
 *
 * Replace with a real classifier (embeddings / a small model) later — the
 * signature is all `coerceCategory()` depends on.
 */
interface Rule {
  cat: Category;
  strong?: RegExp;
  weak?: RegExp;
}

const RULES: Rule[] = [
  {
    cat: 'Apple',
    strong: /\b(iphone|ipad|macbook|macos|ipados|watchos|visionos|vision pro|apple watch|airpods|app store|tim cook|apple intelligence|apple silicon|m[1-5] (chip|pro|max|ultra))\b/i,
    weak: /\bapple\b/i,
  },
  {
    cat: 'Google',
    strong: /\b(android \d|pixel \d|google pixel|chromeos|google search|alphabet|waymo|deepmind|google gemini|gemini \d|google cloud next|google i\/o)\b/i,
    weak: /\b(google|android|youtube)\b/i,
  },
  {
    cat: 'Microsoft',
    strong: /\b(windows 1[01]|microsoft copilot|microsoft 365|xbox|surface (pro|laptop|book)|satya nadella|\bazure\b|\.net\b|visual studio)\b/i,
    weak: /\bmicrosoft\b/i,
  },
  {
    cat: 'Cybersecurity',
    strong: /\b(data breach|ransomware|vulnerabilit|cve-\d|zero[- ]day|malware|phishing|infostealer|spyware|cyberattack|exploited in the wild|supply[- ]chain attack|credential (theft|stuffing))\b/i,
    weak: /\b(hacked|breach|exploit|hackers?)\b/i,
  },
  {
    // Non-tech global headlines. Sits after the company buckets (so "EU fines
    // Apple" stays Apple) but before the tech topics.
    cat: 'World',
    strong: /\b(earthquake|flash flood|flooding|wildfire|hurricane|typhoon|cyclone|tsunami|landslide|mudslide|glacier collapse|volcan|death toll|magnitude [\d.]+ quake|mass evacuation|ceasefire|air ?strike|missile strike|drone strike|invasion|militants?|\bcoup\b|civil war|war[- ]torn|the war in|refugees?|genocide|humanitarian crisis|prime minister|general election|referendum|\bsanctions\b|peace talks|hostages?|state of emergency|martial law)\b/i,
    weak: /\b(general election|wildfires?|war crimes|peace deal)\b/i,
  },
  {
    cat: 'Gaming',
    strong: /\b(video game|playstation|\bps5\b|xbox|nintendo switch|steam deck|game studio|game pass|epic games|unreal engine|indie game|esports)\b/i,
    weak: /\b(gaming|\bgame\b|\bgames\b|valve|ubisoft)\b/i,
  },
  {
    cat: 'Science',
    strong: /\b(quantum comput|nuclear fusion|\bnasa\b|spacex|blue origin|rocket launch|\bsatellite|space telescope|astronom|particle physics|biotech|crispr|genome|climate (tech|change|model))\b/i,
    weak: /\b(fusion|physics|spacecraft|orbital)\b/i,
  },
  {
    cat: 'Startups',
    strong: /\b(raises \$[\d.]+ ?[mb]|raised \$[\d.]+ ?[mb]|series [a-e] (round|funding)|seed round|venture capital firm|y combinator|\$[\d.]+ ?(million|billion) (round|raise|funding)|term sheet|pre[- ]seed)\b/i,
    weak: /\b(startup|founders?|venture capital)\b/i,
  },
  {
    cat: 'Cloud',
    strong: /\b(amazon web services|\baws\b|microsoft azure|google cloud|kubernetes|serverless|data ?cent(er|re)|cloudflare|s3 bucket|cloud region|hyperscaler)\b/i,
    weak: /\b(cloud infrastructure|devops)\b/i,
  },
  {
    cat: 'Hardware',
    strong: /\b(semiconductor|\bgpu\b|\bcpu\b|nvidia|\bamd\b|\bintel\b|\btsmc\b|qualcomm|snapdragon|arm holdings|chipmaker|fabrication plant|\bfab\b|wafer|raspberry pi|3d print)\b/i,
    weak: /\b(chip|chips|silicon|processor|robotics?)\b/i,
  },
  {
    cat: 'Mobile',
    strong: /\b(smartphone|\b5g\b|\b6g\b|foldable phone|galaxy s\d|galaxy z (fold|flip)|mobile carrier|\besim\b)\b/i,
    weak: /\b(android phone|iphone|handset)\b/i,
  },
  {
    cat: 'Programming',
    strong: /\b(programming language|\brust\b|golang|\bgo 1\.|typescript|javascript|\bpython\b|compiler|webassembly|linux kernel|open[- ]source (project|release|library)|package manager|\bgit\b|github|\bapi\b|framework release)\b/i,
    weak: /\b(developer|coding|codebase|software engineer|frameworks?|libraries)\b/i,
  },
  {
    cat: 'AI',
    strong: /\b(artificial intelligence|machine learning|large language model|\bllm\b|\bllms\b|gpt-?\d|chatgpt|openai|anthropic|claude|generative ai|diffusion model|neural network|foundation model|ai agent|agentic|ai model|inference (cost|speed)|hugging face)\b/i,
    weak: /\b(\bai\b|\bml\b|chatbot)\b/i,
  },
];

export function classifyCategory(title: string, fullText: string, fallback: Category = 'AI'): Category {
  const t = title.toLowerCase();
  const all = `${title} ${fullText}`.toLowerCase();

  // 1. strong signal anywhere in the text — trusted absolutely.
  for (const r of RULES) if (r.strong?.test(all)) return r.cat;

  // 2. weak signal in the headline. But if that weak signal is just "AI"
  //    mentioned in passing and the source already has a real topic focus
  //    (fallback isn't the generic AI bucket), keep the source's category.
  for (const r of RULES) {
    if (!r.weak?.test(t)) continue;
    if (r.cat === 'AI' && fallback !== 'AI') return fallback;
    return r.cat;
  }

  // 3. no signal — use the source's default.
  return fallback;
}

export function coerceCategory(
  rawCategories: string[] | undefined,
  title: string,
  fullText: string,
  fallback: Category,
): Category {
  // A feed category that exactly names one of ours wins.
  for (const c of rawCategories ?? []) {
    const hit = [...VALID_CATEGORIES].find((v) => v.toLowerCase() === c.trim().toLowerCase());
    if (hit) return hit as Category;
  }
  return classifyCategory(title, fullText, fallback);
}

function toIso(value: unknown, fallback: Date): string {
  if (!value) return fallback.toISOString();
  const d = new Date(value as string | number | Date);
  return isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
}

/** Deterministic gradient data-URI, used when a source has no image. */
export function gradientPlaceholder(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const a = h;
  const b = (h + 50) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='675'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${a} 70% 55%)'/><stop offset='1' stop-color='hsl(${b} 65% 35%)'/></linearGradient></defs><rect width='1200' height='675' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

let autoId = 1_000_000;

/**
 * Slugs must stay stable even when a story's headline changes after we've
 * already linked it. "Live updates" / rolling-coverage pieces (a flood
 * tracker, an election night blog, ...) rewrite their title on every
 * refetch while keeping the same canonical URL — deriving the slug fresh
 * from `raw.title` each time silently swaps a previously-shared permalink
 * out from under anyone who clicked it earlier (404 on next TTL refresh).
 * Remember the first slug assigned to each canonical URL and keep reusing
 * it for the life of the process; only a URL we've genuinely never seen
 * gets a freshly slugified one.
 */
const slugByUrl = new Map<string, string>();

function canonicalUrlKey(url: string): string {
  return url.replace(/[#?].*$/, '').toLowerCase();
}

function stableSlug(raw: RawItem): string {
  const key = raw.link ? canonicalUrlKey(raw.link) : '';
  const existing = key ? slugByUrl.get(key) : undefined;
  if (existing) return existing;
  const fresh = slugify(raw.title) || `story-${autoId++}`;
  if (key) slugByUrl.set(key, fresh);
  return fresh;
}

/**
 * The core function. Idempotent for well-formed input.
 */
export function normalizeArticle(raw: RawItem): Article {
  const now = new Date();
  const text =
    raw.contentText ??
    (raw.contentHtml ? htmlToText(raw.contentHtml) : '') ??
    raw.summary ??
    '';
  const classifyText = `${raw.summary ?? ''} ${(raw.categories ?? []).join(' ')} ${(raw.tags ?? []).join(' ')}`;

  const publishedAt = toIso(raw.publishedAt, now);
  const slug = stableSlug(raw);
  const source = raw.__sourceName ?? 'Wire';
  // Real image if the feed gave one; otherwise a deterministic stock photo keyed
  // to the slug (NewsImage falls back again to a CSS gradient if even that fails).
  const image = raw.imageUrl || `https://picsum.photos/seed/${slug}/1200/675`;
  const content = text || raw.summary || raw.title;

  const popularity = Math.max(0, raw.score ?? 0);
  const comments = Math.max(0, raw.commentCount ?? 0);
  // "Trending" straight off the source signal: a well-upvoted or heavily
  // discussed story. Thresholds are deliberately modest.
  const trending = popularity >= 150 || comments >= 80;

  return {
    id: autoId++,
    slug,
    title: stripEntities(raw.title).trim(),
    excerpt: raw.summary ? makeExcerpt(htmlToText(raw.summary)) : makeExcerpt(content),
    content,
    category: coerceCategory(raw.categories, raw.title, classifyText, raw.__defaultCategory ?? 'AI'),
    source,
    author: raw.author?.trim() || source,
    image,
    publishedAt,
    updatedAt: toIso(raw.updatedAt, new Date(publishedAt)),
    readingTime: raw.readingMinutes && raw.readingMinutes > 0 ? raw.readingMinutes : readingTime(content),
    featured: false,
    trending,
    tags: (raw.tags ?? raw.categories ?? [])
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t && t.length < 24)
      .filter((t, i, arr) => arr.indexOf(t) === i)
      .slice(0, 6),
    popularity,
    comments,
    isMock: false,
    sourceUrl: raw.link,
  };
}

function stripEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Ensure every article has a unique slug (live titles can collide once
 * truncated). Keeps the first, suffixes the rest with -2, -3, …
 */
export function ensureUniqueSlugs(articles: Article[]): Article[] {
  const seen = new Map<string, number>();
  for (const a of articles) {
    const n = (seen.get(a.slug) ?? 0) + 1;
    seen.set(a.slug, n);
    if (n > 1) a.slug = `${a.slug}-${n}`;
  }
  return articles;
}

/**
 * De-duplicate a batch. Same canonical URL, same GUID, or a very similar
 * normalized title collapses to the first occurrence.
 */
export function dedupe(articles: Article[]): Article[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    const urlKey = (a.sourceUrl ?? '').replace(/[#?].*$/, '').toLowerCase();
    const titleKey = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if ((urlKey && seenUrl.has(urlKey)) || (titleKey && seenTitle.has(titleKey))) continue;
    if (urlKey) seenUrl.add(urlKey);
    if (titleKey) seenTitle.add(titleKey);
    out.push(a);
  }
  return out;
}

/**
 * Trending score. Recency-weighted, with room to add real engagement signal
 * later (views, comments, velocity). Returns a number; higher = hotter.
 */
export function trendingScore(a: Article, now = Date.now()): number {
  const ageHours = Math.max(1, (now - new Date(a.publishedAt).getTime()) / 3_600_000);
  const recency = 1 / Math.pow(ageHours, 0.6);
  const editorial = (a.featured ? 0.4 : 0) + (a.trending ? 1 : 0);
  const engagement =
    Math.log1p(a.popularity ?? 0) * 0.22 + Math.log1p(a.comments ?? 0) * 0.28;
  return recency + editorial + engagement;
}
