import type { APIRoute } from 'astro';
import { getNews, CATEGORIES } from '../lib/news';

/**
 * Hand-rolled sitemap so the project needs zero extra dependencies. If you
 * later add `@astrojs/sitemap`, delete this file and add the integration.
 */
export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('http://localhost:4321')).toString().replace(/\/$/, '');
  const articles = await getNews();

  const staticPaths = ['/', '/trending', '/search'];
  const categoryPaths = CATEGORIES.map((c) => `/category/${c.slug}`);
  const articleEntries = articles.map((a) => ({
    loc: `/news/${a.slug}`,
    lastmod: a.updatedAt,
  }));

  const urls = [
    ...staticPaths.map((p) => ({ loc: p, lastmod: undefined as string | undefined })),
    ...categoryPaths.map((p) => ({ loc: p, lastmod: undefined as string | undefined })),
    ...articleEntries,
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${base}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
