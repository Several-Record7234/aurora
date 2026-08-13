/**
 * Vite build configuration for the Aurora extension.
 *
 * Multi-page setup: three HTML entry points map to the three iframes
 * that Owlbear Rodeo loads for this extension:
 *   - index.html    → action popover (preset library UI)
 *   - menu.html     → context-menu embed (per-item HSLO controls)
 *   - background.html → background page (effect manager + context menus)
 *
 * The injectManifestVersion plugin patches dist/manifest.json at build
 * time so that the OBR manifest always matches the version in package.json.
 * package.json is the single source of truth for the version number.
 */
/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

/**
 * Rewrite dist/manifest.json "version" to match package.json at build time.
 * Uses closeBundle (post-copy) because public/ files bypass the Rollup bundle
 * pipeline and are never present in the generateBundle bundle object.
 */
function injectManifestVersion(): Plugin {
  return {
    name: "inject-manifest-version",
    apply: "build",
    closeBundle() {
      const manifestPath = resolve(__dirname, "dist", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      manifest.version = pkg.version;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    },
  };
}

export default defineConfig({
  /* Relative asset paths so the build works when hosted at any sub-path */
  base: "./",

  server: {
    cors: true,
  },

  plugins: [injectManifestVersion()],

  test: {
    include: ["src/**/*.test.ts"],
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        menu: resolve(__dirname, "menu.html"),
        background: resolve(__dirname, "background.html"),
        whatsNew: resolve(__dirname, "whats-new.html"),
      },
    },
  },
});
