/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset paths, so the build works on GitHub Pages (sub-path) and Cloudflare Pages (root).
  base: './',
  plugins: [react(), tailwindcss()],
  test: { environment: 'node' },
});
