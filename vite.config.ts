import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
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
  base: './', //change the base configuration to an object
  },
});
