import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import SettingsButton from "./components/SettingsButton";
import { clearOperatorToken } from "./lib/operatorAuth";

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: "/admin/search", label: "Search", end: true },
  { to: "/admin/leads", label: "Leads" },
  { to: "/admin/clients", label: "Clients" },
  { to: "/admin/early-access", label: "Early access" },
];

function sectionTitle(pathname: string): string {
  if (pathname.startsWith("/admin/early-access")) return "Early access";
  if (pathname.startsWith("/admin/clients")) return "Clients";
  if (pathname.startsWith("/admin/leads")) return "Leads";
  if (pathname.startsWith("/admin/search")) return "Search";
  return "Admin";
}

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const wide = pathname.startsWith("/admin/leads") || pathname.startsWith("/admin/clients");

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const signOut = () => {
    clearOperatorToken();
    navigate("/admin/login", { replace: true });
  };

  const navLinks = (
    <nav className="admin-sidebar-nav" aria-label="Admin">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => (isActive ? "active" : undefined)}
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="app app--admin">
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={`admin-burger${menuOpen ? " admin-burger--open" : ""}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <div className="admin-topbar-brand">
          <div className="brand">
            Tradies<span>Mate</span>
          </div>
          <span className="admin-topbar-section">{sectionTitle(pathname)}</span>
        </div>
        <div className="admin-topbar-actions">
          <SettingsButton />
        </div>
      </header>

      <aside className="admin-sidebar" aria-label="Admin sidebar">
        <div className="admin-sidebar-brand">
          <div className="brand">
            Tradies<span>Mate</span>
          </div>
          <span className="admin-sidebar-tag">Admin</span>
        </div>
        {navLinks}
        <div className="admin-sidebar-foot">
          <SettingsButton />
          <button type="button" className="admin-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      {menuOpen && (
        <div className="admin-drawer-root" role="presentation" onClick={() => setMenuOpen(false)}>
          <div
            id={menuId}
            className="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-drawer-head">
              <div className="brand">
                Tradies<span>Mate</span>
              </div>
              <button type="button" className="admin-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            {navLinks}
            <div className="admin-drawer-foot">
              <SettingsButton />
              <button type="button" className="admin-signout" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={`content content--admin${wide ? " content--wide" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
