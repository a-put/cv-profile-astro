// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://a-put.github.io',
  base: '/cv-profile-astro',
  vite: {
    plugins: [tailwindcss()]
  }
});