import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "icons/*.png",
        "og-image.png",
        "robots.txt",
        "sitemap.xml",
        "llms.txt",
        "admin.webmanifest",
        "manifest.webmanifest",
      ],
      // Static public/manifest.webmanifest (no start_url) — VitePWA defaults start_url to "/"
      // which breaks iOS Add to Home Screen for /admin.
      manifest: false,
      workbox: {
        navigateFallback: "/index.html",
        // Public quote/invoice pages are proxied to Railway — never serve the SPA shell for them.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/i\//,
          /^\/q\//,
          /^\/cert\//,
          /^\/uploads\//,
          /^\/sites\//,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
          /^\/llms\.txt$/,
          /^\/og-image\.png$/,
        ],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,txt,xml,woff2,webmanifest}"],
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
