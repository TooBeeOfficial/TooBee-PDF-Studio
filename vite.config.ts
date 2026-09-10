import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

const require = createRequire(import.meta.url);

/**
 * Packages the app can use but does not require.
 *
 * The automatic background removal in the Sign page is the only one so far. Its
 * model pack weighs a couple of hundred megabytes, so it is not something to
 * force on every install, and the app has to work with no network — meaning it
 * cannot be fetched on demand either. It is therefore genuinely optional: the
 * other two cutout methods are always there.
 *
 * Neither Rollup nor the dev server will accept an import it cannot resolve, so
 * when the package is absent it is pointed at a stub module whose body throws.
 * A dynamic import of that stub rejects, which is exactly what the feature's
 * try/catch is written to expect: it turns the failure into a note telling the
 * user the pack is not installed.
 *
 * A plugin rather than `build.rollupOptions.external`, because external applies
 * only to `vite build` and left `npm run dev` failing on the same import. This
 * covers both. Install the package and the list below comes up empty, the
 * plugin stops intercepting, and the import resolves and bundles normally with
 * nothing here to change.
 */
const OPTIONAL_PACKAGES = ["@imgly/background-removal"];

const missingOptionalPackages = OPTIONAL_PACKAGES.filter(id => {
  try {
    require.resolve(id);
    return false;
  } catch {
    return true;
  }
});

/** Marker prefix; the leading NUL is Rollup's convention for a virtual module. */
const STUB = "\0optional-missing:";

function optionalPackages(): Plugin {
  return {
    name: "optional-packages",
    // Ahead of Vite's own resolver, which would otherwise fail first.
    enforce: "pre",

    config() {
      // Keep the dependency pre-bundler from scanning for something that is
      // not there; it reports its own failure before any plugin is consulted.
      return { optimizeDeps: { exclude: missingOptionalPackages } };
    },

    resolveId(id) {
      return missingOptionalPackages.includes(id) ? STUB + id : null;
    },

    load(id) {
      if (!id.startsWith(STUB)) return null;
      const name = id.slice(STUB.length);
      // Throwing at module scope is what makes the dynamic import reject.
      return `throw new Error(${JSON.stringify(
        `Optional package "${name}" is not installed.`,
      )});`;
    },
  };
}

export default defineConfig({
  base: "./",

  plugins: [
    optionalPackages(),
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