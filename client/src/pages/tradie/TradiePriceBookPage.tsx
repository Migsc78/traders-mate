import PriceBookEditor from "../../components/PriceBookEditor";
import { tradieApi } from "../../api/tradie";

export default function TradiePriceBookPage() {
  return (
    <div>
      <header className="t-page-head">
        <h2>Rates</h2>
        <p>Your price book — used when drafting quotes from voice or notes</p>
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
