import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import PriceBookEditor from "../../components/PriceBookEditor";
import { getTradieSession, setTradieSession, tradieApi } from "../../api/tradie";

export default function TradiePriceBookPage() {
  const session = getTradieSession();
  const me = useQuery({
    queryKey: ["tradie-me"],
    queryFn: () => tradieApi.me(),
    enabled: !!session,
    retry: false,
  });

  useEffect(() => {
    if (me.isError) setTradieSession(null);
  }, [me.isError]);

  if (!session || me.isError) return <Navigate to="/t/auth" replace />;

  return (
    <div className="tradie-shell">
      <header className="tradie-top">
        <div>
          <p>
            <Link to="/t">← Jobs</Link>
          </p>
          <h1>Price book</h1>
          <p className="muted-text">{me.data?.businessName || "Your rates"}</p>
        </div>
      </header>

      <PriceBookEditor
        queryKey={["tradie-price-book"]}
        api={{
          list: () => tradieApi.priceBook(),
          save: (items) => tradieApi.savePriceBook(items),
          importRows: (rows) => tradieApi.importPriceBook(rows),
          deactivate: (id) => tradieApi.deactivatePriceBookItem(id),
        }}
      />
    </div>
  );
}
