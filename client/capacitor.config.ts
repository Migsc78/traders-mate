import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Local-bundle mode: the app ships inside the binary and boots with no network.
 *
 * This is deliberate, not an oversight. Pointing server.url at the live site made
 * releases instant, but it also meant a cold start with no signal downloaded the
 * whole app before it could show anything — so a tradie in a basement got nothing.
 * On iOS it's worse than a blank screen: WKWebView can hang, because it won't run
 * a service worker without WKAppBoundDomains.
 *
 * Set CAPACITOR_SERVER_URL to point a device at a dev server instead:
 *   Android emulator → http://10.0.2.2:5173/t
 *   Physical device  → http://<your-lan-ip>:5173/t
 */
const devServerUrl = process.env.CAPACITOR_SERVER_URL;
const isLocalHttp = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.)/i.test(
  devServerUrl || ""
);

const config: CapacitorConfig = {
  appId: "uk.co.tradiesmate.app",
  appName: "TradiesMate",
  webDir: "dist",
  // No `server` block in a release build — dist/ is loaded straight off the device.
  ...(devServerUrl ? { server: { url: devServerUrl, cleartext: isLocalHttp } } : {}),
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
