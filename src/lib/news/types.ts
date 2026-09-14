/**
 * Types for the news *aggregation* layer.
 *
 * `Article` (the normalized, UI-facing shape) lives in `src/types/news.ts`.
 * The types here describe the raw, per-source input that adapters produce and
 * `normalizeArticle()` turns into an `Article`.
 */

import type { Article, Category } from '../../types/news';

export type { Article, Category };

/**
 * The loosely-typed shape a source adapter returns for one item. Every field is
 * optional except the ones we genuinely cannot invent (`title`, `link`).
 * `normalizeArticle()` fills the gaps.
 */
export interface RawItem {
  title: string;
  /** Canonical URL of the story on the source site. */
  link: string;
  summary?: string;
  contentHtml?: string;
  contentText?: string;
  author?: string;
  /** Anything Date can parse, or an ISO string. */
  publishedAt?: string | number | Date;
  updatedAt?: string | number | Date;
  imageUrl?: string;
  categories?: string[];
  tags?: string[];
  /** Free-form id from the feed (GUID). Used for de-duplication. */
  guid?: string;
  /** Popularity signal from the source (HN points, dev.to reactions, …). */
  score?: number;
  /** Number of comments/discussion on the source. */
  commentCount?: number;
  /** Reading time in minutes, if the source provides one. */
  readingMinutes?: number;

  /** Internal: stamped by `getAllRawItems()` from the owning source. */
  __sourceName?: string;
  /** Internal: the owning source's default category. */
  __defaultCategory?: Category;
}

export interface NewsSource {
  /** Stable identifier, e.g. "google-news-ai". */
  id: string;
  /** Human-readable name shown as the article's `source`. */
  name: string;
  /** Default category for items that cannot be classified. */
  defaultCategory?: Category;
  /** Whether this source is currently active. */
  enabled: boolean;
  /**
   * Fetch and parse this source into raw items.
   * Adapters live in `sources.ts`. For the mock build there are none.
   */
  fetch(): Promise<RawItem[]>;
}
