import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import PriceBookEditor from "../../components/PriceBookEditor";
import { tradieApi } from "../../api/tradie";

export default function TradiePriceBookPage() {
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const backToSetup = !!me.data?.onboardingRequired;

  return (
    <div>
      <header className="t-page-head">
        <h2>Rates</h2>
        <p>Your price book — used when drafting quotes from voice or notes</p>
        {backToSetup ? (
          <p style={{ marginTop: 8 }}>
            <Link to="/t/onboarding" className="linkish">
              ← Back to setup
            </Link>
          </p>
        ) : null}
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
