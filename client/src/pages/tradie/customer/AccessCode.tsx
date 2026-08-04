import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { customersApi } from "../../../api/customers";

const HIDE_AFTER_MS = 30_000;

/**
 * A masked access code with a deliberate Reveal.
 *
 * The code is never in the record payload — the server strips it and sends
 * `hasAccessCode` instead — so revealing it is a separate request, made only when
 * someone asks. That's what stops "masked" being a lie anyone can see through by
 * opening the network tab.
 *
 * It re-hides itself after half a minute. Phones get left on kitchen worktops,
 * and this is the code to somebody's front door.
 *
 * Every reveal is recorded. There is one login per account today, so the "who"
 * is not yet interesting — but the history starts now rather than on the day
 * engineer logins ship, which is the day it starts to matter.
 */
export function AccessCode({
  propertyId,
  hasCode,
  jobId,
}: {
  propertyId: string;
  hasCode: boolean;
  /** Set when revealed from a job, so the audit row says which one. */
  jobId?: string;
}) {
  const [code, setCode] = useState<string | null>(null);

  const reveal = useMutation({
    mutationFn: () => customersApi.revealAccessCode(propertyId, jobId),
    onSuccess: (r) => setCode(r.accessCode),
  });

  useEffect(() => {
    if (!code) return;
    const timer = window.setTimeout(() => setCode(null), HIDE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [code]);

  if (!hasCode) return <span className="t-access-value muted-text">Not set</span>;

  if (code) {
    return (
      <span className="t-access-value">
        <strong className="t-code">{code}</strong>
        <button type="button" className="linkish t-reveal" onClick={() => setCode(null)}>
          Hide
        </button>
      </span>
    );
  }

  return (
    <span className="t-access-value">
      <span className="t-code t-code--masked" aria-label="Access code hidden">
        ••••
      </span>
      <button
        type="button"
        className="linkish t-reveal"
        disabled={reveal.isPending}
        onClick={() => reveal.mutate()}
      >
        {reveal.isPending ? "…" : "Reveal"}
      </button>
    </span>
  );
}
