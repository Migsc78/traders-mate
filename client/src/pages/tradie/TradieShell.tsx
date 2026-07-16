import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTradieSession, setTradieSession, tradieApi } from "../../api/tradie";

const TABS = [
  { to: "/t", label: "Jobs", end: true },
  { to: "/t/quotes", label: "Quotes" },
  { to: "/t/invoices", label: "Invoices" },
  { to: "/t/customers", label: "Customers" },
  { to: "/t/price-book", label: "Rates" },
  { to: "/t/settings", label: "Settings" },
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

  return (
    <div className="tradie-shell tradie-shell--app">
      <header className="tradie-top">
        <div>
          <h1>{me.data?.businessName || "TradersMate"}</h1>
          <p className="muted-text">
            {me.data?.status === "TRIAL" && me.data.trialEndsAt
              ? `Trial ends ${new Date(me.data.trialEndsAt).toLocaleDateString("en-GB")}`
              : me.data?.tradeTitle || "Quoting & jobs"}
          </p>
        </div>
      </header>

      {me.data && !me.data.accountActive && (
        <p className="error tradie-banner">
          Account inactive — subscribe in Settings to send quotes and invoices.
        </p>
      )}

      <div className="tradie-outlet">
        <Outlet context={{ me: me.data }} />
      </div>

      <nav className="tradie-bottom-nav" aria-label="Tradie navigation">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={"end" in t ? t.end : false}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
