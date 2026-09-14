import type { APIRoute } from 'astro';
import { getNews } from '../lib/news';

/** Minimal RSS 2.0 feed of the latest stories — no dependency required. */
export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('http://localhost:4321')).toString().replace(/\/$/, '');
  const articles = (await getNews()).slice(0, 30);
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const items = articles
    .map(
      (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${base}/news/${a.slug}</link>
      <guid isPermaLink="true">${base}/news/${a.slug}</guid>
      <description>${esc(a.excerpt)}</description>
      <category>${esc(a.category)}</category>
      <dc:creator>${esc(a.author)}</dc:creator>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
    </item>`,
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>TechPulse — Global Technology News</title>
    <link>${base}/</link>
    <description>AI, Apple, Google, Microsoft, cybersecurity, programming, gaming and startups.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
