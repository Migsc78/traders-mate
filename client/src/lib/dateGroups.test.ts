/**
 * Run: npx tsx src/lib/dateGroups.test.ts
 *
 * Day headings look trivial and aren't: the bugs here are off-by-one at midnight,
 * UTC vs local, and DST weekends. A job filed last night showing under "Today"
 * is the kind of thing a tradie notices and stops trusting the list over.
 */
import { dayKey, dayLabel, groupByDay } from "./dateGroups.js";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

/** Local-time date, so the tests mean the same thing whatever TZ they run in. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

const now = at(2026, 8, 3, 14, 30); // Monday 3 August 2026, half two

/* ------------------------------------------------------------------- labels */

check("today", dayLabel(at(2026, 8, 3, 9, 0), now) === "Today");
check("yesterday", dayLabel(at(2026, 8, 2, 23, 55), now) === "Yesterday");

// The one that matters: 23:30 last night is Yesterday even though it's only
// fifteen hours ago, and 00:30 this morning is Today even though it's barely any.
check("late last night is yesterday", dayLabel(at(2026, 8, 2, 23, 30), now) === "Yesterday");
check("early this morning is today", dayLabel(at(2026, 8, 3, 0, 30), now) === "Today");

check("two days back names the weekday", dayLabel(at(2026, 8, 1), now) === "Saturday", dayLabel(at(2026, 8, 1), now));
check("six days back still a weekday", dayLabel(at(2026, 7, 28), now) === "Tuesday", dayLabel(at(2026, 7, 28), now));
check("a week back becomes a date", dayLabel(at(2026, 7, 27), now) === "27 Jul", dayLabel(at(2026, 7, 27), now));
check(
  "last year carries the year",
  dayLabel(at(2025, 11, 14), now) === "14 Nov 2025",
  dayLabel(at(2025, 11, 14), now)
);

// Phone clock a few minutes ahead of the server shouldn't date-stamp a new job.
check("future timestamp reads as today", dayLabel(at(2026, 8, 3, 23, 59), now) === "Today");
check("tomorrow reads as today, not a date", dayLabel(at(2026, 8, 4, 1, 0), now) === "Today");

check("garbage input", dayLabel("not a date", now) === "Undated");

/* --------------------------------------------------------------------- keys */

check("key is calendar-local", dayKey(at(2026, 8, 3, 23, 59)) === "2026-08-03", dayKey(at(2026, 8, 3, 23, 59)));
check("key pads single digits", dayKey(at(2026, 1, 5)) === "2026-01-05", dayKey(at(2026, 1, 5)));
check("same day, different times share a key", dayKey(at(2026, 8, 3, 1)) === dayKey(at(2026, 8, 3, 22)));

/* ----------------------------------------------------------------- grouping */

type Row = { id: string; createdAt: Date };

{
  const rows: Row[] = [
    { id: "a", createdAt: at(2026, 8, 3, 10, 30) },
    { id: "b", createdAt: at(2026, 8, 3, 9, 0) },
    { id: "c", createdAt: at(2026, 8, 2, 16, 20) },
    { id: "d", createdAt: at(2026, 7, 20) },
  ];
  const groups = groupByDay(rows, (r) => r.createdAt, now);

  check("three days, three headings", groups.length === 3, `got ${groups.length}`);
  check("headings in order", groups.map((g) => g.label).join("|") === "Today|Yesterday|20 Jul", groups.map((g) => g.label).join("|"));
  check("today holds both of today's rows", groups[0].rows.length === 2);
  check("row order preserved inside a group", groups[0].rows.map((r) => r.id).join("") === "ab");
}

// Out-of-order input must not produce the same heading twice — otherwise a list
// that arrives unsorted grows a second "Today" halfway down.
{
  const rows: Row[] = [
    { id: "a", createdAt: at(2026, 8, 3, 10) },
    { id: "c", createdAt: at(2026, 8, 2, 16) },
    { id: "b", createdAt: at(2026, 8, 3, 8) },
  ];
  const groups = groupByDay(rows, (r) => r.createdAt, now);
  check("unsorted input still yields one heading per day", groups.length === 2, `got ${groups.length}`);
  check("stray row joins its own day", groups[0].rows.map((r) => r.id).join("") === "ab");
}

{
  const groups = groupByDay<{ id: string; createdAt: string | null }>(
    [{ id: "a", createdAt: null }],
    (r) => r.createdAt,
    now
  );
  check("missing date gets its own heading, not a crash", groups[0]?.label === "Undated");
}

check("empty list yields no headings", groupByDay([], () => null, now).length === 0);

/* ------------------------------------------------- future dates (booked visits)

   Creation timestamps are never legitimately ahead of now, so a future one means
   clock skew and still reads "Today". A booked visit is a different matter: the
   Upcoming tab is answering "what am I doing next", and labelling tomorrow's
   first call "Today" would send someone to the wrong house on the wrong day. */

check("future creation date still reads Today (clock skew)", dayLabel(at(2026, 8, 4, 9), now) === "Today");
check("tomorrow, when the future is allowed", dayLabel(at(2026, 8, 4, 9), now, true) === "Tomorrow");
check("today is still today with future allowed", dayLabel(at(2026, 8, 3, 18), now, true) === "Today");
check(
  "later this week names the day",
  dayLabel(at(2026, 8, 6, 9), now, true) === "Thursday",
  dayLabel(at(2026, 8, 6, 9), now, true)
);
check(
  "beyond a week falls back to a date",
  dayLabel(at(2026, 8, 20, 9), now, true) === "20 Aug",
  dayLabel(at(2026, 8, 20, 9), now, true)
);
check("yesterday unaffected by the flag", dayLabel(at(2026, 8, 2, 9), now, true) === "Yesterday");

{
  // Visits arriving out of order must still head up in date order once sorted,
  // one heading per day.
  type V = { id: string; startsAt: string };
  const rows: V[] = [
    { id: "later", startsAt: at(2026, 8, 6, 9).toISOString() },
    { id: "tomorrow", startsAt: at(2026, 8, 4, 8).toISOString() },
    { id: "tomorrow-pm", startsAt: at(2026, 8, 4, 15).toISOString() },
  ];
  const sorted = [...rows].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  const groups = groupByDay(sorted, (r) => r.startsAt, now, { allowFuture: true });
  check("two visit days", groups.length === 2, `got ${groups.length}`);
  check("tomorrow first", groups[0].label === "Tomorrow", groups[0].label);
  check("both of tomorrow's visits together", groups[0].rows.length === 2);
  check("then Thursday", groups[1].label === "Thursday", groups[1].label);
}

if (failures > 0) throw new Error(`${failures} date-group failure(s)`);
console.log("OK: day labels and grouping");
