import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tradieApi } from "../../../../api/tradie";
import { NeedsSignal, QueryError } from "../../ui";
import { useOffline } from "../../../../lib/connectivity";

/**
 * The customer conversation, moved off Overview into its own tab.
 *
 * Behaviour is unchanged from the old single-page job screen — same endpoints,
 * same offline rules. What's changed is that a long thread no longer pushes the
 * job's actual details off the bottom of the screen.
 */
export default function MessagesTab({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const offline = useOffline();
  const [smsText, setSmsText] = useState("");

  const messages = useQuery({
    queryKey: ["tradie-messages", jobId],
    queryFn: () => tradieApi.jobMessages(jobId),
    enabled: !!jobId,
  });

  const sendSms = useMutation({
    mutationFn: () => tradieApi.sendJobMessage(jobId, smsText.trim()),
    onSuccess: () => {
      setSmsText("");
      void qc.invalidateQueries({ queryKey: ["tradie-messages", jobId] });
    },
  });

  return (
    <section>
      {messages.isLoading && <p className="muted-text">Loading…</p>}
      <ul className="tradie-messages">
        {(messages.data || []).map(
          (m: { id: string; direction: string; channel: string; body: string; createdAt: string }) => (
            <li key={m.id} className={m.direction === "INBOUND" ? "in" : "out"}>
              <span className="muted-text">
                {m.direction === "INBOUND" ? "Customer" : "You"} · {m.channel} ·{" "}
                {new Date(m.createdAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <p>{m.body}</p>
            </li>
          )
        )}
      </ul>
      {messages.data?.length === 0 && <p className="muted-text">No messages logged for this job yet.</p>}

      <div className="t-card" style={{ marginTop: 12 }}>
        <label>
          Reply by SMS
          <textarea
            rows={3}
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            placeholder="Type a message to the customer…"
          />
        </label>
        <button
          type="button"
          className="primary t-btn--block"
          disabled={offline || !smsText.trim() || sendSms.isPending}
          onClick={() => sendSms.mutate()}
        >
          {sendSms.isPending ? "Sending…" : "Send SMS"}
        </button>
        {offline && <NeedsSignal>Texting the customer needs signal.</NeedsSignal>}
        <QueryError error={sendSms.error} />
      </div>

      <div className="tradie-actions" style={{ marginTop: 12 }}>
        <Link className="t-btn--block" to={`/t/diary/new?enquiryId=${jobId}`}>
          Book in diary →
        </Link>
        <Link className="t-btn--block" to={`/t/certificates?enquiryId=${jobId}`}>
          File certificate →
        </Link>
      </div>
    </section>
  );
}
