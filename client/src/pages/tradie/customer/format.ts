/** Shared date formatting for the customer record screens. */

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "in 3 weeks" / "2 days ago" — for reminders and the activity feed. */
export function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.round((then - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return days < 31 ? `in ${days} days` : `in ${Math.round(days / 30)} months`;
  const ago = -days;
  return ago < 31 ? `${ago} days ago` : `${Math.round(ago / 30)} months ago`;
}

/** Overdue service dates are the ones worth colouring. */
export function dueTone(iso: string | null | undefined): "" | "soon" | "overdue" {
  if (!iso) return "";
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= 30) return "soon";
  return "";
}

export function addressOf(p: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  town?: string | null;
  postcode?: string | null;
}): string {
  return [p.addressLine1, p.addressLine2, p.town, p.postcode].filter(Boolean).join(", ");
}
