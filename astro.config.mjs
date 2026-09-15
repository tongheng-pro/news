// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  // Update this to your real production domain. It is used for canonical URLs,
  // Open Graph tags, the sitemap and robots.txt.
  site: 'https://capynews.example',

  trailingSlash: 'ignore',

  // On-demand rendering: pages read the live, in-memory news cache on every
  // request instead of baking it in once at build time, so NEWS_TTL_MINUTES'
  // background refresh (src/lib/news/index.ts) actually keeps content warm.
  output: 'server',

  build: {
    // Emit `/news/foo/index.html` style pages for clean URLs.
    format: 'directory',
  },

  devToolbar: {
    enabled: false,
  },

  adapter: node({
    mode: 'standalone',
  }),
});