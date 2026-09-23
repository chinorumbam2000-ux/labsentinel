/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * GitHub Pages serves this project from a sub-path, not the domain root, so
 * every built asset URL has to be prefixed with the repository name. Change
 * this to '/' if you ever host the app at a domain root instead.
 */
const BASE_PATH = '/labsentinel/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Charting and mapping are the two heavy dependencies; splitting them
        // keeps the initial load reasonable.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          maps: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
