import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi, type QuoteDto } from "../../../api/tradie";
import { NeedsSignal, QueryError } from "../ui";
import { useOffline } from "../../../lib/connectivity";

type Channel = "SMS" | "WHATSAPP" | "EMAIL";

function firstName(full: string | undefined | null): string {
  const part = (full || "").trim().split(/\s+/)[0];
  return part || "there";
}

function defaultSendMessage(name: string | undefined | null): string {
  return `Hi ${firstName(name)}, here's your quote. You can view it online and accept in one tap.`;
}

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
  const [channel, setChannel] = useState<Channel>("SMS");
  const [message, setMessage] = useState("");
  const [messageSeeded, setMessageSeeded] = useState(false);
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

  const attach = useMutation({
    mutationFn: (body: { enquiryId?: string; name?: string; phone?: string }) =>
      sendOrQueue({
        label: `Quote customer · ${body.name || "customer"}`,
        path: `/quotes/${quoteId}/customer`,
        method: "PATCH",
        body,
        invalidates: ["tradie-quote", "tradie-quotes"],
      }),
    onMutate: (body) => {
      qc.setQueryData<QuoteDto>(["tradie-quote", quoteId], (q) =>
        q ? { ...q, enquiry: { id: "", name: body.name || "", phone: body.phone || "", email: null } } : q
      );
      setPicking(false);
      setMessage(defaultSendMessage(body.name));
      setMessageSeeded(true);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-quote", quoteId] });
    },
  });

  const send = useMutation({
    mutationFn: () =>
      tradieApi.approve(quoteId, {
        channels: [channel],
        email: quote.data?.enquiry?.email || undefined,
        message: message.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      navigate("/t/quotes", { replace: true });
    },
  });

  const customerEmail = quote.data?.enquiry?.email || null;
  useEffect(() => {
    if (!customerEmail && channel === "EMAIL") setChannel("SMS");
  }, [customerEmail, channel]);

  useEffect(() => {
    if (!quote.data || messageSeeded) return;
    setMessage(defaultSendMessage(quote.data.enquiry?.name));
    setMessageSeeded(true);
  }, [quote.data, messageSeeded]);

  if (quote.isLoading) return <p className="muted-text">Loading…</p>;
  if (!quote.data) return <QueryError error={quote.error} />;

  const q = quote.data;
  const customer = q.enquiry;
  const publicHref = q.publicToken ? `/q/${q.publicToken}` : null;

  const channelRows: {
    id: Channel;
    label: string;
    detail: string;
    disabled: boolean;
    Icon: () => JSX.Element;
  }[] = [
    {
      id: "SMS",
      label: "SMS",
      detail: customer?.phone || "No number yet",
      disabled: !customer?.phone,
      Icon: IconSms,
    },
    {
      id: "WHATSAPP",
      label: "WhatsApp",
      detail: customer?.phone || "No number yet",
      disabled: !customer?.phone,
      Icon: IconWhatsApp,
    },
    {
      id: "EMAIL",
      label: "Email",
      detail: customerEmail || "No email on this customer",
      disabled: !customerEmail,
      Icon: IconEmail,
    },
  ];

  return (
    <div className="t-quote-preview">
      <div className="t-card t-preview-hero">
        <button type="button" className="t-preview-for" onClick={() => setPicking(true)}>
          {customer ? `Quote for ${customer.name}` : "Tap to choose customer"}
        </button>
        <p className="t-preview-amount">{formatGbp(q.totalPence)}</p>
        <p className="t-preview-valid muted-text">Valid for {q.validDays} days</p>

        <div className="t-preview-actions">
          {publicHref ? (
            <a className="t-preview-action" href={publicHref} target="_blank" rel="noreferrer">
              <IconDoc />
              View quote
            </a>
          ) : (
            <Link className="t-preview-action" to={`/t/quotes/${quoteId}/edit`}>
              <IconDoc />
              View quote
            </Link>
          )}
          {publicHref ? (
            <a className="t-preview-action t-preview-action--accept" href={publicHref} target="_blank" rel="noreferrer">
              <IconAccept />
              Accept online
            </a>
          ) : (
            <span className="t-preview-action t-preview-action--accept is-disabled">
              <IconAccept />
              Accept online
            </span>
          )}
        </div>
      </div>

      <p className="t-section-label">Send via</p>
      <div className="t-card t-send-list">
        {channelRows.map(({ id, label, detail, disabled, Icon }) => (
          <button
            key={id}
            type="button"
            className={`t-send-option${channel === id ? " is-on" : ""}`}
            aria-pressed={channel === id}
            disabled={disabled}
            onClick={() => setChannel(id)}
          >
            <span className="t-send-icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="t-send-copy">
              <span className="t-send-label">{label}</span>
              <span className="t-send-detail">{detail}</span>
            </span>
            <span className={`t-send-radio${channel === id ? " is-on" : ""}`} aria-hidden="true">
              {channel === id ? "✓" : ""}
            </span>
          </button>
        ))}
      </div>

      <label className="t-card t-preview-message">
        <span className="sr-only">Message</span>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={defaultSendMessage(customer?.name)}
        />
      </label>

      {!customer && <NeedsSignal>Choose a customer before sending.</NeedsSignal>}
      {offline && <NeedsSignal>Sending a quote needs signal.</NeedsSignal>}
      <QueryError error={send.error || attach.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={offline || !customer || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? "Sending…" : "Send quote"}
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

function IconSms() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="22" height="16" rx="5" fill="#22C55E" />
      <path d="M10 21.5 7 25v-4.2A5 5 0 0 0 8.2 21H10Z" fill="#22C55E" />
      <circle cx="10" cy="13" r="1.4" fill="#fff" />
      <circle cx="14" cy="13" r="1.4" fill="#fff" />
      <circle cx="18" cy="13" r="1.4" fill="#fff" />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12" fill="#25D366" />
      <path
        d="M19.6 16.9c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.1-.3.2-.6.1-1.6-.6-2.7-1.1-3.7-2.6-.2-.3 0-.4.2-.6.2-.2.3-.3.4-.5.1-.2.1-.3 0-.5-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.5.1.2 1.8 2.9 4.5 3.9 1.7.7 2.2.7 2.9.6.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.2.1-1.3-.1 0-.3-.1-.6-.2Z"
        fill="#fff"
      />
    </svg>
  );
}

function IconEmail() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="3.5" y="6.5" width="21" height="15" rx="3" stroke="#64748B" strokeWidth="1.8" />
      <path
        d="m5.5 9.5 8.5 6.5 8.5-6.5"
        stroke="#64748B"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 1.5h5.2L13 4.8V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V3A1.5 1.5 0 0 1 4.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M9.5 1.6V5H13" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconAccept() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m5.2 8.1 2 2 3.6-3.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
