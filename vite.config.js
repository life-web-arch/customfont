import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // optimizeDeps: wawoff2 removed
  build: {
    target: 'es2020',
  },
});
