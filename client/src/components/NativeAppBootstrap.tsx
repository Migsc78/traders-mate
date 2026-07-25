import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNativeApp, isTradiePath, pathFromDeepLink } from "../lib/nativeApp";

/**
 * Native-only bootstrap: status bar, splash, deep links, Android back, tradie-only redirects.
 * No-ops entirely in desktop/mobile browsers.
 */
export function NativeAppBootstrap() {
  const navigate = useNavigate();
  const location = useLocation();

  // Keep the shell on /t/* (or signup) when running as a native app.
  useEffect(() => {
    if (!isNativeApp()) return;
    if (isTradiePath(location.pathname)) return;
    navigate("/t", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let backHandle: { remove: () => Promise<void> } | undefined;
    let urlHandle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;

    void (async () => {
      try {
        document.documentElement.classList.add("native-app");
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: "#fff7f2" }).catch(() => undefined);
        await SplashScreen.hide().catch(() => undefined);
      } catch {
        // Plugins may be missing in web preview — ignore.
      }

      if (cancelled) return;

      backHandle = await CapApp.addListener("backButton", ({ canGoBack }) => {
        const path = window.location.pathname;
        const atRoot = path === "/t" || path === "/t/" || path === "/t/auth";
        if (canGoBack && !atRoot) {
          window.history.back();
          return;
        }
        void CapApp.exitApp();
      });

      urlHandle = await CapApp.addListener("appUrlOpen", ({ url }) => {
        const path = pathFromDeepLink(url);
        if (path) navigate(path, { replace: true });
      });

      // Cold start: if launched via a deep link, App.getLaunchUrl may have it.
      try {
        const launch = await CapApp.getLaunchUrl();
        if (launch?.url) {
          const path = pathFromDeepLink(launch.url);
          if (path) navigate(path, { replace: true });
        }
      } catch {
        // unsupported
      }
    })();

    return () => {
      cancelled = true;
      document.documentElement.classList.remove("native-app");
      void backHandle?.remove();
      void urlHandle?.remove();
    };
  }, [navigate]);

  return null;
}
