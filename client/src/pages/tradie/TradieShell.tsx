import { NavLink, Outlet, Navigate } from "react-router-dom";
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

const TABS = [
  { to: "/t", label: "Jobs", end: true, Icon: IconJobs },
  { to: "/t/quotes", label: "Quotes", Icon: IconQuotes },
  { to: "/t/invoices", label: "Invoices", Icon: IconInvoices },
  { to: "/t/customers", label: "Customers", Icon: IconCustomers },
  { to: "/t/price-book", label: "Rates", Icon: IconRates },
  { to: "/t/settings", label: "Settings", Icon: IconSettings },
] as const;

export default function TradieShell() {
  const session = getTradieSession();
  const me = useQuery({
    queryKey: ["tradie-me"],
    queryFn: () => tradieApi.me(),
    enabled: !!session,
    retry: false,
  });

  if (!session) return <Navigate to="/t/auth" replace />;
  if (me.isError) {
    setTradieSession(null);
    return <Navigate to="/t/auth" replace />;
  }

  const businessName = me.data?.businessName || "TradersMate";
  const subtitle = [me.data?.tradeTitle, me.data?.town].filter(Boolean).join(" · ") || "Quoting & jobs";

  return (
    <div className="tradie-shell tradie-shell--app">
      <header className="t-appbar">
        <div className="t-brand-mark">{initialsOf(businessName)}</div>
        <div className="t-appbar-text">
          <h1>{businessName.replace(/\[SEED\]\s*/i, "")}</h1>
          <p className="t-appbar-sub">
            {subtitle}
            {me.data?.status === "TRIAL" && (
              <StatusPill status="TRIAL" />
            )}
          </p>
        </div>
      </header>

      {me.data?.status === "TRIAL" && me.data.trialEndsAt && me.data.accountActive && (
        <p className="muted-text" style={{ margin: "-14px 0 16px" }}>
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

      <nav className="tradie-bottom-nav" aria-label="Tradie navigation">
        {TABS.map(({ to, label, Icon, ...rest }) => (
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
      </nav>
    </div>
  );
}
