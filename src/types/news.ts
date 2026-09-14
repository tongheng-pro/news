/**
 * Shared domain types for the whole site.
 *
 * These types describe a *normalized* article — the shape every UI component
 * consumes. When real RSS/API sources are added later, each source adapter is
 * responsible for producing objects that satisfy `Article` (see
 * `src/lib/news/normalize.ts`). The frontend never needs to change.
 */

export type Category =
  | 'AI'
  | 'Apple'
  | 'Google'
  | 'Microsoft'
  | 'Cybersecurity'
  | 'Programming'
  | 'Gaming'
  | 'Startups'
  | 'Cloud'
  | 'Hardware'
  | 'Science'
  | 'Mobile'
  | 'World';

export interface Article {
  id: number;
  /** URL-safe unique identifier, used for `/news/[slug]`. */
  slug: string;
  title: string;
  /** One or two sentence summary shown on cards and as the meta description. */
  excerpt: string;
  /** Full article body. Plain text paragraphs separated by blank lines. */
  content: string;
  category: Category;
  /** Publication / feed the story came from, e.g. "TechPulse Wire". */
  source: string;
  author: string;
  /** Remote placeholder image URL. Components provide a gradient fallback. */
  image: string;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
  /** Estimated reading time in minutes. */
  readingTime: number;
  featured: boolean;
  trending: boolean;
  tags: string[];
  /** Popularity signal (source points / reactions). 0 when unknown. */
  popularity?: number;
  /** Discussion count on the source, when known. */
  comments?: number;
  /** True when this item came from the local mock dataset rather than a live feed. */
  isMock?: boolean;
  /**
   * Canonical URL of the original article on the source site.
   * For mock data this points back at our own detail page.
   */
  sourceUrl?: string;
}

export interface CategoryMeta {
  slug: string;
  name: Category;
  description: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { slug: 'ai', name: 'AI', description: 'The latest developments in artificial intelligence, machine learning, model releases and the companies building them.' },
  { slug: 'apple', name: 'Apple', description: 'iPhone, Mac, iPad, Vision and everything happening across Apple hardware, software and services.' },
  { slug: 'google', name: 'Google', description: 'Android, Pixel, Search, Gemini, Chrome and Alphabet news from across Google.' },
  { slug: 'microsoft', name: 'Microsoft', description: 'Windows, Surface, Xbox, Azure, Copilot and enterprise news from Redmond.' },
  { slug: 'cybersecurity', name: 'Cybersecurity', description: 'Breaches, vulnerabilities, ransomware, privacy and the defenders working to stop them.' },
  { slug: 'programming', name: 'Programming', description: 'Languages, frameworks, developer tooling, open source and software engineering practice.' },
  { slug: 'gaming', name: 'Gaming', description: 'Consoles, PC, studios, engine technology and the business of interactive entertainment.' },
  { slug: 'startups', name: 'Startups', description: 'Funding rounds, founders, venture capital and the companies trying to build what is next.' },
  { slug: 'cloud', name: 'Cloud', description: 'Hyperscalers, infrastructure, data centers, serverless and the economics of running software at scale.' },
  { slug: 'hardware', name: 'Hardware', description: 'Chips, GPUs, robotics, wearables and the physical technology powering everything else.' },
  { slug: 'science', name: 'Science', description: 'Space, energy, biotech, climate technology and research with a technology edge.' },
  { slug: 'mobile', name: 'Mobile', description: 'Phones, carriers, mobile apps, connectivity and life on the small screen.' },
  { slug: 'world', name: 'World', description: 'Global headlines beyond technology — politics, conflict, climate and disasters shaping the wider world.' },
];

export function categoryBySlug(slug: string): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.slug === slug.toLowerCase());
}

export function categorySlug(name: Category): string {
  return name.toLowerCase();
}
