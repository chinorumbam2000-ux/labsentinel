/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * GitHub Pages serves this project from a sub-path, not the domain root, so
 * every built asset URL has to be prefixed with the repository name:
 * https://chinorumbam2000-ux.github.io/signal-by-probesyq/. A full-stack
 * deployment on a static host at a domain root builds with
 * LABSENTINEL_BASE_PATH=/ instead (see docs/deployment.md); the variable keeps
 * its original name for compatibility.
 */
export const PAGES_BASE_PATH = '/signal-by-probesyq/';
const buildEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const BASE_PATH = buildEnv.LABSENTINEL_BASE_PATH?.trim() || PAGES_BASE_PATH;
if (!BASE_PATH.startsWith('/') || !BASE_PATH.endsWith('/')) {
  throw new Error(`LABSENTINEL_BASE_PATH must start and end with "/"; received "${BASE_PATH}".`);
}

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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
