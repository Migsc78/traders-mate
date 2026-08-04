/**
 * Day headings for the Jobs and Quotes lists.
 *
 * All comparisons are done on *local* midnights, not on the raw timestamps. A job
 * logged at 23:30 and read back at 00:30 is yesterday's job to the tradie, and a
 * UTC-based comparison would call it today's for anyone west of Greenwich.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole days between two dates. Rounded, so 23- and 25-hour DST days still count as one. */
function daysAgo(then: Date, now: Date): number {
  return Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / MS_DAY);
}

/** Stable key for grouping — local calendar date, not an ISO instant. */
export function dayKey(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * @param allowFuture true when the date can legitimately be ahead of now — a
 *   booked visit, say. Left false for creation timestamps, where a date in the
 *   future means the phone's clock disagrees with the server's rather than
 *   anything real, and "Today" beats "Tomorrow" for something that just
 *   happened a minute either side of midnight.
 */
export function dayLabel(value: string | Date, now: Date = new Date(), allowFuture = false): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Undated";

  const ago = daysAgo(d, now);

  if (ago === 0) return "Today";
  if (ago < 0) {
    if (!allowFuture) return "Today";
    if (ago === -1) return "Tomorrow";
    if (ago > -7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  } else {
    if (ago === 1) return "Yesterday";
    if (ago < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  }

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    "en-GB",
    sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }
  );
}

export type DayGroup<T> = { key: string; label: string; rows: T[] };

/**
 * Bucket rows under day headings, keeping the order they arrived in.
 *
 * Keyed rather than run-length grouped, so an unsorted list still gets one
 * heading per day instead of the same date appearing three times.
 */
export function groupByDay<T>(
  rows: T[],
  getDate: (row: T) => string | Date | null | undefined,
  now: Date = new Date(),
  opts?: { allowFuture?: boolean }
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();

  for (const row of rows) {
    const raw = getDate(row);
    const key = raw ? dayKey(raw) : "unknown";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: raw ? dayLabel(raw, now, opts?.allowFuture) : "Undated",
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  return [...groups.values()];
}
