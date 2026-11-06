// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://mits.my',
  vite: {
    plugins: [tailwindcss()],
  },
});
