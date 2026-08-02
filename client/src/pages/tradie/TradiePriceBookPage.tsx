import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tradieApi } from "../../api/tradie";
import RatesBook from "./rate/RatesBook";

export default function TradiePriceBookPage() {
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const backToSetup = !!me.data?.onboardingRequired;

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Rates</h2>
          <p>Your price book — used when drafting quotes from voice or notes</p>
          {backToSetup ? (
            <p style={{ marginTop: 8 }}>
              <Link to="/t/onboarding" className="linkish">
                ← Back to setup
              </Link>
            </p>
          ) : null}
        </div>
        <Link className="t-add-btn" to="/t/rates/new" aria-label="New rate item">
          +
        </Link>
      </header>

      <RatesBook />
    </div>
  );
}
