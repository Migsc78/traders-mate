import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { clearOperatorToken, hasOperatorSession } from "../lib/operatorAuth";

/**
 * Gates /admin/* behind an operator token when the API requires one.
 * If the API has no OPERATOR_API_TOKEN (local/dev), allow through.
 */
export default function AdminAuthGate() {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "ok" | "login">("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const health = await api.health();
        if (!health.operatorAuthRequired) {
          if (!cancelled) setState("ok");
          return;
        }

        if (!hasOperatorSession()) {
          if (!cancelled) setState("login");
          return;
        }

        await api.operatorSession();
        if (!cancelled) setState("ok");
      } catch {
        clearOperatorToken();
        if (!cancelled) setState("login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state === "loading") {
    return (
      <div className="admin-auth-loading">
        <p>Checking admin access…</p>
      </div>
    );
  }

  if (state === "login") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
