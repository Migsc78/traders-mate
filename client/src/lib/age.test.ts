/**
 * Run: npx tsx src/lib/age.test.ts
 *
 * The inbox is read at a glance while the tradie is holding something else, so
 * the age has to be right at the boundaries — an hour-old lead reading "0h ago"
 * or a fresh one reading "1m ago" is the sort of thing that stops it being
 * trusted, and once it isn't trusted it may as well not be there.
 */
import { ageLabel, ageTone, stampLabel } from "./age.js";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, actual === expected, `expected ${expected}, got ${actual}`);
}

const now = new Date(2026, 7, 5, 14, 30, 0); // Wed 5 Aug 2026, 14:30
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ---------------------------------------------------------------- labels */

eq("seconds old", ageLabel(ago(20_000), now), "just now");
eq("just under a minute", ageLabel(ago(59_000), now), "just now");
eq("a minute", ageLabel(ago(MIN), now), "1m ago");
eq("forty-two minutes", ageLabel(ago(42 * MIN), now), "42m ago");
eq("fifty-nine minutes", ageLabel(ago(59 * MIN), now), "59m ago");

// The boundary that matters most — this is the one a tradie checks against.
eq("exactly an hour", ageLabel(ago(HOUR), now), "1h ago");
eq("an hour and change", ageLabel(ago(HOUR + 23 * MIN), now), "1h 23m ago");
eq("nearly six hours keeps the minutes", ageLabel(ago(5 * HOUR + 40 * MIN), now), "5h 40m ago");
// Past six hours the minutes are noise; nobody acts differently at 7h 12m.
eq("six hours drops them", ageLabel(ago(6 * HOUR + 40 * MIN), now), "6h ago");
eq("just under a day", ageLabel(ago(23 * HOUR), now), "23h ago");

eq("a day", ageLabel(ago(DAY), now), "1d ago");
eq("six days", ageLabel(ago(6 * DAY), now), "6d ago");
eq("a week", ageLabel(ago(7 * DAY), now), "1w ago");
eq("four weeks", ageLabel(ago(28 * DAY), now), "4w ago");
eq("beyond a month", ageLabel(ago(60 * DAY), now), "2mo ago");

// A phone whose clock is a minute fast must not produce "-1m ago".
eq("clock skew reads as fresh", ageLabel(new Date(now.getTime() + 30_000), now), "just now");
eq("rubbish in, nothing out", ageLabel("not a date", now), "");

/* ------------------------------------------------------------------ tone */

eq("fresh is quiet", ageTone(ago(10 * MIN), now), "");
eq("under the hour is still quiet", ageTone(ago(59 * MIN), now), "");
// An hour is roughly when a caller starts ringing round.
eq("an hour warns", ageTone(ago(HOUR), now), "warn");
eq("three hours warns", ageTone(ago(3 * HOUR), now), "warn");
// Four hours and the job has probably gone to whoever answered.
eq("four hours alerts", ageTone(ago(4 * HOUR), now), "alert");
eq("yesterday alerts", ageTone(ago(DAY), now), "alert");

/* ------------------------------------------------------------- timestamp */

{
  const s = stampLabel(new Date(2026, 7, 4, 12, 53));
  eq("afternoon carries pm", s, "Tue 4 Aug, 12:53 pm");
}
{
  // The one that's genuinely ambiguous without a suffix.
  const s = stampLabel(new Date(2026, 7, 4, 0, 5));
  eq("just after midnight", s, "Tue 4 Aug, 12:05 am");
}
{
  const s = stampLabel(new Date(2026, 7, 4, 9, 7));
  eq("morning", s, "Tue 4 Aug, 9:07 am");
}
eq("rubbish in, nothing out", stampLabel("nope"), "");

if (failures > 0) throw new Error(`${failures} age-label failure(s)`);
console.log("OK: lead age and timestamps (28 assertions)");
