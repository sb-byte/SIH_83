import { defineConfig } from 'vite';

/**
 * The access-control API (server/) runs as a separate zero-dependency Node
 * process on :4000. Proxying /api through the dev server keeps the browser on a
 * single origin, so there is no CORS to configure and the JWT is sent normally.
 *
 * Run both with one command: `npm run dev`.
 */
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.UNITY_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.UNITY_WS_TARGET || 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
