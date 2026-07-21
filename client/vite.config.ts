import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "TradiesMate",
        short_name: "TradiesMate",
        description: "Quote faster. Chase by SMS. Get paid.",
        theme_color: "#ff5a1f",
        background_color: "#fff7f2",
        display: "standalone",
        start_url: "/t",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Public quote/invoice pages are proxied to Railway — never serve the SPA shell for them.
        navigateFallbackDenylist: [/^\/api\//, /^\/i\//, /^\/q\//, /^\/uploads\//, /^\/sites\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/sites": "http://localhost:4000",
      "/q": "http://localhost:4000",
      "/i": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
});
