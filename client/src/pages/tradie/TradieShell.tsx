import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTradieSession, setTradieSession, tradieApi } from "../../api/tradie";
import {
  IconCustomers,
  IconInvoices,
  IconJobs,
  IconQuotes,
  IconRates,
  IconSettings,
  StatusPill,
  initialsOf,
} from "./ui";

const PRIMARY_TABS = [
  { to: "/t", label: "Jobs", end: true, Icon: IconJobs },
  { to: "/t/quotes", label: "Quotes", Icon: IconQuotes },
  { to: "/t/invoices", label: "Invoices", Icon: IconInvoices },
  { to: "/t/customers", label: "Customers", Icon: IconCustomers },
] as const;

const MORE_TABS = [
  { to: "/t/price-book", label: "Rates", Icon: IconRates },
  { to: "/t/settings", label: "Settings", Icon: IconSettings },
] as const;

export default function TradieShell() {
  const session = getTradieSession();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const me = useQuery({
    queryKey: ["tradie-me"],
    queryFn: () => tradieApi.me(),
    enabled: !!session,
    retry: false,
  });

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  if (!session) return <Navigate to="/t/auth" replace />;
  if (me.isError) {
    setTradieSession(null);
    return <Navigate to="/t/auth" replace />;
  }

  const businessName = me.data?.businessName || "TradiesMate";
  const subtitle = [me.data?.tradeTitle, me.data?.town].filter(Boolean).join(" · ") || "Quoting & jobs";
  const moreActive = MORE_TABS.some((t) => location.pathname.startsWith(t.to));
  const onJobDetail = location.pathname.startsWith("/t/jobs/");

  return (
    <div className={`tradie-shell tradie-shell--app${onJobDetail ? " tradie-shell--detail" : ""}`}>
      <header className="t-appbar">
        <div className="t-brand-mark">{initialsOf(businessName)}</div>
        <div className="t-appbar-text">
          <h1>{businessName.replace(/\[SEED\]\s*/i, "")}</h1>
          <p className="t-appbar-sub">
            {subtitle}
            {me.data?.status === "TRIAL" && <StatusPill status="TRIAL" />}
          </p>
        </div>
      </header>

      {me.data?.status === "TRIAL" && me.data.trialEndsAt && me.data.accountActive && (
        <p className="muted-text t-trial-note">
          Trial ends {new Date(me.data.trialEndsAt).toLocaleDateString("en-GB")} — subscribe anytime in Settings.
        </p>
      )}

      {me.data && !me.data.accountActive && (
        <p className="t-banner t-banner--danger">
          Account inactive — subscribe in Settings to send quotes and invoices.
        </p>
      )}

      <div className="tradie-outlet">
        <Outlet context={{ me: me.data }} />
      </div>

      {!onJobDetail && (
        <nav className="tradie-bottom-nav" aria-label="Tradie navigation">
          {PRIMARY_TABS.map(({ to, label, Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest ? (rest as { end: boolean }).end : false}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={moreActive || moreOpen ? "active" : undefined}
            aria-label="More"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <IconMore />
            <span>More</span>
          </button>
        </nav>
      )}

      {moreOpen && (
        <div className="t-more-root" role="presentation" onClick={() => setMoreOpen(false)}>
          <div
            id={moreId}
            className="t-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-more-handle" aria-hidden="true" />
            <p className="t-more-title">More</p>
            <div className="t-more-links">
              {MORE_TABS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => (isActive ? "active" : undefined)}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconMore({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
