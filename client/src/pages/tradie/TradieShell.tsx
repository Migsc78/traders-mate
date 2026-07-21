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
  { to: "/t/diary", label: "Diary", Icon: IconDiary },
] as const;

const MORE_TABS = [
  { to: "/t/customers", label: "Customers", Icon: IconCustomers },
  { to: "/t/certificates", label: "Certs", Icon: IconCerts },
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
  const onOnboarding = location.pathname.startsWith("/t/onboarding");

  // Paid but setup incomplete → send to wizard (except settings / billing return)
  if (
    me.data?.onboardingRequired &&
    me.data.accountActive &&
    !onOnboarding &&
    !location.pathname.startsWith("/t/settings")
  ) {
    return <Navigate to="/t/onboarding" replace />;
  }

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

      {me.data?.billingRequired && (
        <p className="t-banner t-banner--danger">
          Pay £{((me.data.trialPricePence ?? 1400) / 100).toFixed(0)} to unlock your{" "}
          {me.data.trialDays ?? 14}-day trial — then £{((me.data.planPricePence ?? 4900) / 100).toFixed(0)} every 30
          days.{" "}
          <NavLink to="/t/settings">Open billing</NavLink>
        </p>
      )}

      {me.data?.accountActive &&
        !me.data.onboardingDivertConfirmedAt &&
        !me.data.billingRequired &&
        !onOnboarding && (
        <p className="t-banner">
          Finish call divert so missed calls are rescued.{" "}
          <NavLink to="/t/onboarding">Continue setup</NavLink>
        </p>
      )}

      {me.data?.status === "TRIAL" && me.data.trialEndsAt && me.data.accountActive && (
        <p className="muted-text t-trial-note">
          Trial ends {new Date(me.data.trialEndsAt).toLocaleDateString("en-GB")} — then £
          {((me.data.planPricePence ?? 4900) / 100).toFixed(0)}/30 days unless you cancel in Settings.
        </p>
      )}

      {me.data && !me.data.accountActive && !me.data.billingRequired && (
        <p className="t-banner t-banner--danger">
          Account inactive — manage billing in Settings to send quotes and invoices.
        </p>
      )}

      <div className="tradie-outlet">
        <Outlet context={{ me: me.data }} />
      </div>

      {!onJobDetail && !onOnboarding && (
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

function IconDiary({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}

function IconCerts({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}
