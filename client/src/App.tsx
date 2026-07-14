import { NavLink, Outlet, useLocation } from "react-router-dom";
import SettingsButton from "./components/SettingsButton";

export default function App() {
  const { pathname } = useLocation();
  const wide = pathname.startsWith("/leads") || pathname.startsWith("/clients");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Traders<span>Mate</span>
        </div>
        <div className="topbar-right">
          <nav>
            <NavLink to="/search" className={({ isActive }) => (isActive ? "active" : "")}>
              Search
            </NavLink>
            <NavLink to="/leads" className={({ isActive }) => (isActive ? "active" : "")}>
              Leads
            </NavLink>
            <NavLink to="/clients" className={({ isActive }) => (isActive ? "active" : "")}>
              Clients
            </NavLink>
          </nav>
          <SettingsButton />
        </div>
      </header>
      <main className={`content${wide ? " content--wide" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
