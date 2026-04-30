/**
 * Vite build configuration for the Aurora extension.
 *
 * Multi-page setup: three HTML entry points map to the three iframes
 * that Owlbear Rodeo loads for this extension:
 *   - index.html    → action popover (preset library UI)
 *   - menu.html     → context-menu embed (per-item HSLO controls)
 *   - background.html → background page (effect manager + context menus)
 *
 * The injectManifestVersion plugin patches public/manifest.json at build
 * time so that the OBR manifest always matches the version in package.json.
 * package.json is the single source of truth for the version number.
 */
/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";

/** Read the version string from package.json at build time */
function getPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));
  return pkg.version;
}

/**
 * Vite plugin that rewrites the "version" field in manifest.json
 * (copied from public/) to match the version in package.json.
 * Runs in the generateBundle hook so it patches the final output.
 */
function injectManifestVersion(): Plugin {
  return {
    name: "inject-manifest-version",
    apply: "build",
    generateBundle(_options, bundle) {
      const asset = bundle["manifest.json"];
      if (asset && asset.type === "asset" && typeof asset.source === "string") {
        const manifest = JSON.parse(asset.source);
        manifest.version = getPackageVersion();
        asset.source = JSON.stringify(manifest, null, 2) + "\n";
      }
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
