import { defineConfig } from "vite";

// Tauri expects a fixed dev port and the build output in ../dist (see tauri.conf.json).
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", target: "es2021", sourcemap: false },
});
