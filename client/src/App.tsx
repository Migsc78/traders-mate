import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import SettingsButton from "./components/SettingsButton";
import { clearOperatorToken } from "./lib/operatorAuth";

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: "/admin/search", label: "Search", end: true },
  { to: "/admin/leads", label: "Leads" },
  { to: "/admin/clients", label: "Clients" },
];

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const wide = pathname.startsWith("/admin/leads") || pathname.startsWith("/admin/clients");

  const signOut = () => {
    clearOperatorToken();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="app app--admin">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="brand">
            Tradies<span>Mate</span>
          </div>
          <span className="admin-sidebar-tag">Admin</span>
        </div>

        <nav className="admin-sidebar-nav" aria-label="Admin">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <SettingsButton />
          <button type="button" className="admin-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className={`content content--admin${wide ? " content--wide" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
