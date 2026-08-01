import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import PriceBookEditor from "../../components/PriceBookEditor";
import { sendOrQueue, tradieApi } from "../../api/tradie";
import type { PriceBookRow } from "../../lib/priceBookFile";

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
        templatesHref="/t/rates/templates"
        api={{
          list: () => tradieApi.priceBook(),
          save: async (items) => {
            const r = await sendOrQueue<PriceBookRow[]>({
              label: "Rates update",
              path: "/price-book",
              method: "PUT",
              body: { items },
              invalidates: ["tradie-price-book"],
            });
            // Queued — hand back what the tradie typed so the editor keeps showing
            // their edits until the server's version comes back.
            return r.queued ? (items as PriceBookRow[]) : r.result;
          },
          importRows: (rows) => tradieApi.importPriceBook(rows),
          deactivate: (id) => tradieApi.deactivatePriceBookItem(id),
        }}
      />
    </div>
  );
}
