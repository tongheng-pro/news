// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Update this to your real production domain. It is used for canonical URLs,
  // Open Graph tags, the sitemap and robots.txt.
  site: 'https://techpulse.example',
  trailingSlash: 'ignore',
  build: {
    // Emit `/news/foo/index.html` style pages for clean URLs.
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
});
