/**
 * How long a lead has been sitting.
 *
 * The wall-clock time it arrived is reference; the age is what drives
 * behaviour. Speed of callback is most of what wins this kind of work, and
 * "12:53" makes the tradie do the arithmetic himself every time he looks at the
 * list. A number that says "42m ago" doesn't.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now" · "42m ago" · "1h 23m ago" · "2d ago" */
export function ageLabel(iso: string | Date, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const ms = now.getTime() - then;
  // Clock skew between the phone and the server, not a lead from the future.
  if (ms < MIN) return "just now";

  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;

  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const mins = Math.floor((ms % HOUR) / MIN);
    // Minutes stop being interesting once it's been most of a day.
    return hours >= 6 || mins === 0 ? `${hours}h ago` : `${hours}h ${mins}m ago`;
  }

  const days = Math.floor(ms / DAY);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks < 5 ? `${weeks}w ago` : `${Math.floor(days / 30)}mo ago`;
}

/**
 * How worried to look about it.
 *
 * An hour is the threshold where a caller has usually started ringing round;
 * four is where the job has almost certainly gone elsewhere. Deliberately blunt
 * — the point is to draw the eye down the list, not to be actuarially precise.
 */
export function ageTone(iso: string | Date, now: Date = new Date()): "" | "warn" | "alert" {
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  if (ms >= 4 * HOUR) return "alert";
  if (ms >= HOUR) return "warn";
  return "";
}

/** "Tue 4 Aug, 12:53 pm" — full and unambiguous, for when the age isn't enough. */
export function stampLabel(iso: string | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s?([ap])m/i, (_m, p) => ` ${String(p).toLowerCase()}m`);
  return `${date}, ${time}`;
}
