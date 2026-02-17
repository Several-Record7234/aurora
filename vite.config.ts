/**
 * Vite build configuration for the Aurora extension.
 *
 * Multi-page setup: three HTML entry points map to the three iframes
 * that Owlbear Rodeo loads for this extension:
 *   - index.html    → action popover (preset library UI)
 *   - menu.html     → context-menu embed (per-item HSLO controls)
 *   - background.html → background page (effect manager + context menus)
 */
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  /* Relative asset paths so the build works when hosted at any sub-path */
  base: "./",

  server: {
    cors: true,
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        menu: resolve(__dirname, "menu.html"),
        background: resolve(__dirname, "background.html"),
      },
    },
  },
});
