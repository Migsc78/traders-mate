import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendOrQueue } from "../../../api/tradie";
import { QueryError } from "../ui";
import { startQuote } from "../../../lib/newQuote";
import { useOffline } from "../../../lib/connectivity";

/**
 * Step 4 — paste or type the job, let the model turn it into priced lines.
 *
 * Two writes, in order: create the draft, then build lines into it. Offline both
 * queue, so the tradie gets a quote they can open and keep editing straight away
 * and the priced lines appear underneath once there's signal — rather than the
 * notes being lost because the model couldn't be reached.
 */
export default function QuoteNotesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();
  const [notes, setNotes] = useState("");

  const generate = useMutation({
    mutationFn: async () => {
      const transcript = notes.trim();
      const id = await startQuote(qc, {
        label: `Quote from notes`,
        // The typed notes ride along as the only line until the model prices it,
        // so an offline draft is never an empty screen.
        lines: [{ label: transcript.slice(0, 120), qty: 1, unit: "JOB", unitPricePence: 0, vatRate: 20 }],
      });
      await sendOrQueue({
        label: "Price up notes",
        path: `/quotes/${id}/from-notes`,
        method: "POST",
        body: { transcript },
        invalidates: ["tradie-quote", "tradie-quotes"],
      });
      return id;
    },
  });

  return (
    <div>
      <p className="t-quote-lead">Paste or type your notes</p>

      <textarea
        className="t-notes-area"
        rows={7}
        placeholder={"New combi boiler for 3 bed semi.\nRemove old boiler and tank.\nInclude magnetic filter and thermostat.\nCustomer available weekdays."}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={generate.isPending || generate.isSuccess}
      />

      {!generate.isSuccess && (
        <button
          type="button"
          className="t-btn t-btn--block t-generate-btn"
          disabled={generate.isPending || notes.trim().length < 3}
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? "Building draft…" : "✦ Generate quote draft"}
        </button>
      )}

      <QueryError error={generate.error} />

      {generate.isSuccess && (
        <div className="t-draft-done">
          <p className="t-draft-done-title">✓ {offline ? "Notes saved" : "Draft generated"}</p>
          <p className="muted-text">
            {offline
              ? "We'll price it up the moment you're back in range."
              : "We've created a draft quote based on your notes."}
          </p>
          <button
            type="button"
            className="t-btn t-btn--block"
            onClick={() => navigate(`/t/quotes/${generate.data}/edit`, { replace: true })}
          >
            Review draft
          </button>
        </div>
      )}
    </div>
  );
}
