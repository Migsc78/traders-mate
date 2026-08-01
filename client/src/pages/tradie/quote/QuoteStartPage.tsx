import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tradieApi } from "../../../api/tradie";
import { startQuote } from "../../../lib/newQuote";
import { QueryError } from "../ui";

/**
 * Step 1 — how do you want to start?
 *
 * Four doors onto the same draft. Templates for repeat work, notes/voice when the
 * job is one-off, blank when the tradie just wants to type. All four work with no
 * signal: the phone mints the quote id itself and queues the write.
 */
export default function QuoteStartPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const templates = useQuery({
    queryKey: ["tradie-quote-templates"],
    queryFn: () => tradieApi.quoteTemplates(),
  });

  const blank = useMutation({
    mutationFn: () =>
      startQuote(qc, {
        label: "New blank quote",
        lines: [{ label: "", qty: 1, unit: "JOB", unitPricePence: 0, vatRate: 20 }],
      }),
    onSuccess: (id) => navigate(`/t/quotes/${id}/edit`, { replace: true }),
  });

  const recent = (templates.data || []).filter((t) => t.lastUsedAt).slice(0, 3);

  return (
    <div>
      <p className="t-quote-lead">Choose how you&apos;d like to start</p>

      <div className="t-start-grid">
        <Link className="t-start-card" to="/t/quotes/new/templates">
          <IconTemplate />
          <strong>Template</strong>
          <span>Use a proven template</span>
        </Link>

        <Link className="t-start-card" to="/t/quotes/new/notes">
          <IconNotes />
          <strong>Notes</strong>
          <span>Turn notes into a quote</span>
        </Link>

        <Link className="t-start-card" to="/t/quotes/new/voice">
          <IconMic />
          <strong>Voice</strong>
          <span>Speak and we&apos;ll write it</span>
        </Link>

        <button
          type="button"
          className="t-start-card"
          disabled={blank.isPending}
          onClick={() => blank.mutate()}
        >
          <IconPlus />
          <strong>Blank</strong>
          <span>{blank.isPending ? "Creating…" : "Start from scratch"}</span>
        </button>
      </div>

      <QueryError error={blank.error} />

      {recent.length > 0 && (
        <>
          <p className="t-section-label">Recent templates</p>
          <ul className="t-list">
            {recent.map((t) => (
              <li key={t.id}>
                <Link className="t-row" to={`/t/quotes/new/templates/${t.id}`}>
                  <div className="t-row-main">
                    <strong>{t.name}</strong>
                  </div>
                  <div className="t-row-side">
                    <span aria-hidden="true">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function IconTemplate() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

function IconNotes() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v3h6V3M9 11h6M9 15h4" />
    </svg>
  );
}

function IconMic() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
