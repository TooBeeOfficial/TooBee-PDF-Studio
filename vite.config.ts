import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'es',
                entryFileNames: '[name].mjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    chunkSizeWarningLimit: 2000,
    outDir: 'dist-renderer',
    emptyOutDir: true,
  }
});
