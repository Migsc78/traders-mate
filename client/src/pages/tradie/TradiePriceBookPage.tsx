import PriceBookEditor from "../../components/PriceBookEditor";
import { tradieApi } from "../../api/tradie";

export default function TradiePriceBookPage() {
  return (
    <div>
      <h2>Price book</h2>
      <p className="muted-text">Rates used when drafting quotes from voice or notes</p>
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
