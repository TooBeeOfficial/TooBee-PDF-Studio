import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  base: "./",

  plugins: [
    react(),

    electron([
      {
        entry: "electron/main.ts",
      },

      {
        entry: "electron/preload.ts",

        onstart(options) {
          options.reload();
        },

        vite: {
          build: {
            // vite-plugin-electron builds this entry in Vite's library mode,
            // which picks the output format from build.lib.formats — and
            // since package.json has "type": "module", its default there is
            // ["es"]. rollupOptions.output.format alone can't override that:
            // Vite's mergeConfig concatenates array configs rather than
            // replacing them, so adding lib.formats: ["cjs"] would merge into
            // ["es", "cjs"] and build both, racing to write the same file.
            // Preload scripts need real CommonJS (Electron's preload loader
            // doesn't support ESM here), so library mode is disabled outright
            // — "false" is a plain value and fully replaces the default.
            lib: false,
            rollupOptions: {
              input: "electron/preload.ts",
              output: {
                format: "cjs",
                entryFileNames: "preload.cjs",
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
    outDir: "dist-renderer",
    emptyOutDir: true,
  },
});