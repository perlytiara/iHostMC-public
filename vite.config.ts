/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx", "./index.html"],
    },
  },
  optimizeDeps: {
    entries: ["src/main.tsx"],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
