import { useLocation } from "react-router-dom";
import { SeoHead, SEO_DEFAULTS } from "./SeoHead";

const LANDING_TITLE = "TradiesMate — Turn missed calls into quoted jobs";
const SIGNUP_TITLE = "Start your £14 trial — TradiesMate";
const SIGNUP_DESC =
  "Start TradiesMate for £14 / 14 days. Dedicated UK number, missed-call SMS rescue, quotes from the van, Pay Now, diary and certificates. Then £49 every 30 days.";
const AUTH_TITLE = "Sign in — TradiesMate";
const AUTH_DESC = "Sign in to TradiesMate with a one-time code sent to your phone.";
const APP_TITLE = "TradiesMate";
const ADMIN_TITLE = "TradiesMate Admin";

/** Route-aware SEO: index public pages; noindex app + admin shells. */
export default function RouteSeo() {
  const { pathname } = useLocation();

  if (pathname === "/" || pathname === "") {
    return (
      <SeoHead
        title={LANDING_TITLE}
        description={SEO_DEFAULTS.description}
        path="/"
      />
    );
  }

  if (pathname === "/signup") {
    return <SeoHead title={SIGNUP_TITLE} description={SIGNUP_DESC} path="/signup" />;
  }

  if (pathname === "/t/auth") {
    return <SeoHead title={AUTH_TITLE} description={AUTH_DESC} path="/t/auth" noindex />;
  }

  if (pathname.startsWith("/admin")) {
    return <SeoHead title={ADMIN_TITLE} path={pathname} noindex />;
  }

  if (pathname.startsWith("/t")) {
    return <SeoHead title={APP_TITLE} path={pathname} noindex />;
  }

  return (
    <SeoHead title={LANDING_TITLE} description={SEO_DEFAULTS.description} path={pathname} noindex />
  );
}
