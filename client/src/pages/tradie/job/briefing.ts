import { tRequest } from "../../../api/tradie";

/**
 * Arrival briefing.
 *
 * The access code is deliberately absent from this payload — it comes only from
 * the separate reveal call, which writes an audit row. A briefing is opened on
 * every job, and shipping the code with it would log a look nobody took.
 */
export type Briefing = {
  jobId: string;
  title: string;
  customer: { id: string; name: string; preferredChannel: string; notes: string | null } | null;
  siteContact: { id: string; name: string; phone: string | null; role: string } | null;
  phone: string | null;
  property: {
    id: string;
    nickname: string | null;
    addressLine1: string | null;
    town: string | null;
    postcode: string | null;
  } | null;
  access: {
    accessMethod: string | null;
    keySafe: boolean;
    keySafeLocation: string | null;
    hasAccessCode: boolean;
    alarm: boolean;
    parking: string | null;
    permitRequired: boolean;
    workingHoursFrom: string | null;
    workingHoursTo: string | null;
    callBeforeArrival: boolean;
    dogOnSite: boolean;
    asbestosKnown: boolean;
    safetyFlags: string[];
    engineerNotes: string | null;
  } | null;
  assets: { id: string; kind: string; name: string | null; model: string | null; location: string | null }[];
  nextVisit: { id: string; startsAt: string; endsAt: string } | null;
};

export const briefingApi = {
  get: (jobId: string) => tRequest<Briefing>(`/jobs/${jobId}/briefing`),
};

export type WarningChip = { icon: string; label: string; tone: "alert" | "warn" | "info" };

/**
 * The handful of things worth interrupting for.
 *
 * Ordered by what ruins the visit: a dog nobody mentioned, then the reasons a
 * tradie can't get in at all, then the ones that only cost time. Anything not on
 * this list stays on the briefing screen rather than shouting from Overview.
 */
export function warningChips(b: Briefing | undefined): WarningChip[] {
  const a = b?.access;
  if (!a) return [];
  const chips: WarningChip[] = [];

  if (a.dogOnSite) chips.push({ icon: "🐕", label: "Dog on site", tone: "alert" });
  if (a.asbestosKnown) chips.push({ icon: "⚠", label: "Asbestos known", tone: "alert" });
  for (const flag of a.safetyFlags || []) chips.push({ icon: "⚠", label: flag, tone: "alert" });

  if (a.callBeforeArrival) chips.push({ icon: "📞", label: "Call before arrival", tone: "warn" });
  if (a.keySafe) chips.push({ icon: "🔑", label: "Key safe", tone: "info" });
  if (a.alarm) chips.push({ icon: "🔔", label: "Alarm", tone: "warn" });
  if (a.permitRequired) chips.push({ icon: "🎫", label: "Parking permit", tone: "warn" });

  return chips;
}
