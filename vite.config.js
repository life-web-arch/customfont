import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['wawoff2'],
    include: ['buffer'],
  },
  define: {
    // Polyfill Buffer for browser — fixes "Buffer is not defined" from ttf2woff
    global: 'globalThis',
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
});
