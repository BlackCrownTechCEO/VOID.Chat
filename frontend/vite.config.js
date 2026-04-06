import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: "http://localhost:3500", changeOrigin: true },
      "/healthz": { target: "http://localhost:3500", changeOrigin: true },
      "/socket.io": { target: "http://localhost:3500", ws: true, changeOrigin: true }
    }
  }
});
