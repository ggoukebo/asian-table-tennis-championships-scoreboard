import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5180,
    proxy: {
      "/api": "http://localhost:3010"
    }
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true
  }
});
