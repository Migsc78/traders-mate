import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://tradiesmate.co.uk/t";
const isLocalHttp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(serverUrl);

const config: CapacitorConfig = {
  appId: "uk.co.tradiesmate.app",
  appName: "TradiesMate",
  webDir: "dist",
  server: {
    // Remote-URL mode: native shell loads the live tradie app only (/t).
    // Override with CAPACITOR_SERVER_URL for local testing (e.g. http://10.0.2.2:5173/t).
    url: serverUrl,
    // Cleartext only for local HTTP; production is HTTPS.
    cleartext: isLocalHttp,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#1f3864",
      showSpinner: false,
    },
    StatusBar: {
      // LIGHT = dark status icons on cream shell background
      style: "LIGHT",
      backgroundColor: "#fff7f2",
    },
  },
};

export default config;
