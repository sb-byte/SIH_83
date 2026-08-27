import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Unity EOC Vite Configuration with React support and FastAPI proxying.
 */
export default defineConfig({
  plugins: [react()],
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
