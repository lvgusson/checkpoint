import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webDir = import.meta.dirname;
// The workspace kit lives outside this app, so its bare imports must resolve to this app's copies
// (also guarantees a single React and a single QueryClient context).
const sharedDeps = [
  'react',
  'react-dom',
  '@tanstack/react-query',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
];

export default defineConfig({
  root: webDir,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: resolve(webDir, 'src') + '/' },
      {
        find: '@checkpoint/ui-react',
        replacement: resolve(webDir, '../../packages/ui-react/src/index.ts'),
      },
      ...sharedDeps.map((name) => ({
        find: new RegExp(`^${name}(/|$)`),
        replacement: resolve(webDir, 'node_modules', name) + '$1',
      })),
    ],
  },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('@dnd-kit')) return 'dnd';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('@tanstack')) return 'query';
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            return 'vendor';
          }
        },
      },
    },
  },
});
