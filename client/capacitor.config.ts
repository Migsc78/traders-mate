import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "uk.co.tradersmate.app",
  appName: "TradersMate",
  webDir: "dist",
  server: {
    // Remote-URL mode for store shells until a fully bundled offline build is ready.
    // Override with CAPACITOR_SERVER_URL for local testing.
    url: process.env.CAPACITOR_SERVER_URL || "https://traders-mate-lyart.vercel.app/t",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#1f3864",
    },
  },
};

export default config;
