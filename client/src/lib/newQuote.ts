import type { QueryClient } from "@tanstack/react-query";
import { sendOrQueue, type QuoteDto, type QuoteLineDto } from "../api/tradie";
import { newOutboxId } from "./outbox";

export type NewQuoteLine = {
  label: string;
  qty: number;
  unit: string;
  unitPricePence: number;
  vatRate: number;
};

/**
 * Start a draft that works with or without signal.
 *
 * The phone picks the quote id, writes an optimistic copy into the cache, and
 * queues the create. That's what lets the tradie be looking at their new quote
 * a moment later in a plant room — and because every later write (lines, terms,
 * customer) is addressed by the same id, the whole edit history replays in order
 * when the queue drains.
 */
export async function startQuote(
  qc: QueryClient,
  opts: { lines: NewQuoteLine[]; templateId?: string; label: string }
): Promise<string> {
  const id = newOutboxId();
  const now = new Date().toISOString();

  const subtotal = opts.lines.reduce((sum, l) => sum + l.unitPricePence * l.qty, 0);
  const vat = opts.lines.reduce(
    (sum, l) => sum + (l.unitPricePence * l.qty * (l.vatRate ?? 20)) / 100,
    0
  );

  // Stand-in the edit screen can render immediately. The server's version
  // replaces it as soon as the create lands.
  const optimistic: QuoteDto = {
    id,
    status: "DRAFT",
    vatInclusive: true,
    subtotalPence: Math.round(subtotal),
    vatPence: Math.round(vat),
    totalPence: Math.round(subtotal + vat),
    customerNote: null,
    assumptions: null,
    publicToken: "",
    reference: null,
    depositPercent: 0,
    depositPence: 0,
    validDays: 30,
    earliestStartAt: null,
    estimatedDuration: null,
    termsNote: null,
    enquiry: null,
    lines: opts.lines.map((l, i) => ({ ...l, id: `${id}-${i}`, source: "BOOK" }) as QuoteLineDto),
  };
  qc.setQueryData(["tradie-quote", id], optimistic);
  qc.setQueryData<{ id: string }[]>(["tradie-quotes"], (rows) => [
    { ...optimistic, sentAt: null, createdAt: now, enquiry: null } as never,
    ...(rows || []),
  ]);

  // Don't wait on the network — the edit screen renders from the optimistic
  // cache above. sendOrQueue still runs (or parks in the outbox) so later line /
  // terms / customer writes address the same id when the create lands.
  void sendOrQueue<QuoteDto>({
    label: opts.label,
    path: "/quotes",
    method: "POST",
    body: { id, templateId: opts.templateId, lines: opts.lines },
    invalidates: ["tradie-quote", "tradie-quotes"],
  }).then((result) => {
    if (!result.queued) {
      qc.setQueryData(["tradie-quote", id], result.result);
      void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
    }
  });

  return id;
}
