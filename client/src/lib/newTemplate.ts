import type { QueryClient } from "@tanstack/react-query";
import { sendOrQueue, type QuoteTemplateDetail, type TemplateDraft } from "../api/tradie";
import { newOutboxId } from "./outbox";

/**
 * Create a template that works with or without signal.
 *
 * Same shape as startQuote: the phone picks the id, seeds the cache so the next
 * screen can read it immediately, and queues the write. Templates are built from
 * the price book, which is already cached, so there's nothing here that actually
 * needs the network.
 */
export async function startTemplate(qc: QueryClient, draft: TemplateDraft): Promise<string> {
  const id = newOutboxId();

  const optimistic: QuoteTemplateDetail = {
    id,
    name: draft.name,
    category: draft.category ?? null,
    description: draft.description ?? null,
    tags: draft.tags ?? [],
    defaultDurationMins: draft.defaultDurationMins ?? null,
    useForAiDrafting: draft.useForAiDrafting ?? true,
    vatRate: draft.vatRate ?? 20,
    depositPercent: draft.depositPercent ?? null,
    notes: draft.notes ?? null,
    included: [],
    addOns: [],
  };
  qc.setQueryData(["tradie-quote-template", id], optimistic);

  await sendOrQueue({
    label: `New template · ${draft.name}`,
    path: "/templates",
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-quote-templates", "tradie-quote-template"],
  });

  return id;
}

/** Save edits to a template — items replace the whole set. */
export async function saveTemplate(
  qc: QueryClient,
  id: string,
  patch: TemplateDraft
): Promise<void> {
  // Show the tradie their own edits straight away; offline there's no server copy
  // coming back to replace this.
  qc.setQueryData<QuoteTemplateDetail>(["tradie-quote-template", id], (prev) =>
    prev
      ? {
          ...prev,
          ...patch,
          included: (patch.items ?? []).filter((i) => !i.isAddOn).map((i, n) => ({ ...i, id: `${id}-i${n}` })),
          addOns: (patch.items ?? []).filter((i) => i.isAddOn).map((i, n) => ({ ...i, id: `${id}-a${n}` })),
        }
      : prev
  );

  await sendOrQueue({
    label: `Template · ${patch.name || "update"}`,
    path: `/templates/${id}`,
    method: "PATCH",
    body: patch,
    invalidates: ["tradie-quote-templates", "tradie-quote-template"],
  });
}
