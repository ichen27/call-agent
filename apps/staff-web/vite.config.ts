import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE ?? 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: process.env.VITE_WS_BASE ?? 'ws://localhost:3000',
        ws: true
      }
    }
  }
});
