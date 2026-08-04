import type { QueryClient } from "@tanstack/react-query";
import { sendOrQueue, type PriceBookItem } from "../api/tradie";
import { newOutboxId } from "./outbox";

export type RateDraft = {
  label: string;
  sku: string | null;
  category: string;
  unit: string;
  unitPricePence: number;
  costPricePence: number | null;
  vatRate: number;
  isCallout: boolean;
  active: boolean;
};

/**
 * Add one rate to the price book, signal or not.
 *
 * Same shape as startQuote and startTemplate: the phone mints the id, drops the
 * row straight into the cached price book so the Rates screen shows it on the way
 * back, and queues the write. A tradie pricing up in a basement can add the rate
 * they just realised they were missing and carry on quoting with it.
 */
export async function createRate(qc: QueryClient, draft: RateDraft): Promise<string> {
  const id = newOutboxId();

  const optimistic: PriceBookItem = {
    id,
    label: draft.label,
    sku: draft.sku,
    category: draft.category,
    unit: draft.unit,
    unitPricePence: draft.unitPricePence,
    costPricePence: draft.costPricePence,
    vatRate: draft.vatRate,
    isCallout: draft.isCallout,
    active: draft.active,
  };
  qc.setQueryData<PriceBookItem[]>(["tradie-price-book"], (prev) => [...(prev || []), optimistic]);

  await sendOrQueue({
    label: `New rate · ${draft.label}`,
    path: "/price-book/items",
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-price-book"],
  });

  return id;
}
