import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves a project repo (not a user/org root page) from
  // /<repo-name>/, so production builds need that base; the dev server
  // stays at the root
  base: command === "build" ? "/cowire/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
