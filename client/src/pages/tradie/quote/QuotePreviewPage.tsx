import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi, type QuoteDto } from "../../../api/tradie";
import { NeedsSignal, QueryError } from "../ui";
import { useOffline } from "../../../lib/connectivity";

type Channel = "SMS" | "WHATSAPP" | "EMAIL";

/**
 * Step 8 — what the customer will get, and how it reaches them.
 *
 * The customer is attached here rather than at the start: capture shouldn't be
 * blocked by data entry when the tradie is standing in someone's kitchen. That
 * does mean a quote can exist with nobody on it, so sending is gated until one
 * is chosen.
 */
export default function QuotePreviewPage() {
  const { quoteId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();
  const [channels, setChannels] = useState<Set<Channel>>(new Set<Channel>(["SMS"]));
  const [picking, setPicking] = useState(false);

  const quote = useQuery({
    queryKey: ["tradie-quote", quoteId],
    queryFn: () => tradieApi.getQuote(quoteId),
    enabled: !!quoteId,
  });

  const customers = useQuery({
    queryKey: ["tradie-customers"],
    queryFn: () => tradieApi.customers(),
    enabled: picking,
  });

  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });

  const attach = useMutation({
    mutationFn: (body: { enquiryId?: string; name?: string; phone?: string }) =>
      sendOrQueue({
        label: `Quote customer · ${body.name || "customer"}`,
        path: `/quotes/${quoteId}/customer`,
        method: "PATCH",
        body,
        invalidates: ["tradie-quote", "tradie-quotes"],
      }),
    // Show the choice straight away — offline there's no server copy to refetch,
    // and the tradie needs to see who it's for before the send options make sense.
    onMutate: (body) => {
      qc.setQueryData<QuoteDto>(["tradie-quote", quoteId], (q) =>
        q ? { ...q, enquiry: { id: "", name: body.name || "", phone: body.phone || "", email: null } } : q
      );
    },
    onSuccess: () => {
      setPicking(false);
      void qc.invalidateQueries({ queryKey: ["tradie-quote", quoteId] });
    },
  });

  const send = useMutation({
    mutationFn: () =>
      tradieApi.approve(quoteId, {
        channels: [...channels],
        email: quote.data?.enquiry?.email || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      navigate("/t/quotes", { replace: true });
    },
  });

  // Email is only offerable once we know an address to send to.
  const customerEmail = quote.data?.enquiry?.email || null;
  useEffect(() => {
    if (!customerEmail) setChannels((prev) => new Set([...prev].filter((c) => c !== "EMAIL")));
  }, [customerEmail]);

  if (quote.isLoading) return <p className="muted-text">Loading…</p>;
  if (!quote.data) return <QueryError error={quote.error} />;

  const q = quote.data;
  const customer = q.enquiry;
  const toggle = (c: Channel) =>
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <div className="t-quote-preview">
      <div className="t-card t-preview-card">
        <div className="t-preview-head">
          <strong>{me.data?.businessName || "Your business"}</strong>
          <span className="muted-text">Quote {q.reference || ""}</span>
        </div>

        <button type="button" className="t-preview-row t-preview-row--btn" onClick={() => setPicking(true)}>
          <span className="muted-text">Customer</span>
          <span>{customer ? customer.name : "Tap to choose"}</span>
        </button>

        <div className="t-preview-row">
          <span className="muted-text">Date</span>
          <span>{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>

        <div className="t-preview-total">
          <span>Total</span>
          <strong>{formatGbp(q.totalPence)}</strong>
        </div>
        <p className="muted-text">
          Valid for {q.validDays} days
          {q.depositPence > 0 ? ` · ${formatGbp(q.depositPence)} deposit on accept` : ""}
        </p>

        <div className="tradie-actions">
          <Link className="t-btn" to={`/t/quotes/${quoteId}/edit`}>
            Edit
          </Link>
          {q.publicToken && (
            <a className="t-btn" href={`/q/${q.publicToken}`} target="_blank" rel="noreferrer">
              View full quote
            </a>
          )}
        </div>
      </div>

      <p className="t-section-label">Send via</p>
      <div className="t-card t-send-list">
        <SendOption
          label="SMS"
          detail={customer?.phone || "No number yet"}
          on={channels.has("SMS")}
          disabled={!customer}
          onToggle={() => toggle("SMS")}
        />
        <SendOption
          label="WhatsApp"
          detail={customer?.phone || "No number yet"}
          on={channels.has("WHATSAPP")}
          disabled={!customer}
          onToggle={() => toggle("WHATSAPP")}
        />
        <SendOption
          label="Email"
          detail={customerEmail || "No email on this customer"}
          on={channels.has("EMAIL")}
          disabled={!customerEmail}
          onToggle={() => toggle("EMAIL")}
        />
      </div>

      {!customer && <NeedsSignal>Choose a customer before sending.</NeedsSignal>}
      {offline && <NeedsSignal>Sending a quote needs signal.</NeedsSignal>}
      <QueryError error={send.error || attach.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={offline || !customer || channels.size === 0 || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? "Sending…" : "Send quote now"}
      </button>

      {picking && (
        <div className="t-more-root" role="presentation" onClick={() => setPicking(false)}>
          <div
            className="t-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Choose customer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-more-handle" aria-hidden="true" />
            <p className="t-more-title">Who&apos;s it for?</p>
            {customers.isLoading && <p className="muted-text">Loading customers…</p>}
            <ul className="t-list">
              {(customers.data || []).map((c) => (
                <li key={c.phoneKey}>
                  <button
                    type="button"
                    className="t-row t-row--btn"
                    disabled={attach.isPending}
                    onClick={() => attach.mutate({ name: c.name, phone: c.phone })}
                  >
                    <div className="t-row-main">
                      <strong>{c.name}</strong>
                      <span className="t-row-sub">{c.phone}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Link className="t-btn t-btn--block" to="/t/customers/new">
              + New customer
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SendOption({
  label,
  detail,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  detail: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`t-send-option${on ? " is-on" : ""}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="t-send-label">{label}</span>
      <span className="t-send-detail">{detail}</span>
      <span className="t-send-tick" aria-hidden="true">
        {on ? "✓" : ""}
      </span>
    </button>
  );
}
