import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Mobile app dev server.
// • Port 5174 so we don't collide with the robot sim on :5173.
// • host: true → bind to all interfaces so a phone on the same Wi-Fi can hit
//   `http://<laptop-ip>:5174/` for the demo.
// • /api/* proxied to the FastAPI backend on :8000 so the frontend can use
//   relative URLs everywhere (and the same code works on the phone — Vite
//   does the proxying server-side, the phone never talks to :8000 directly).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
