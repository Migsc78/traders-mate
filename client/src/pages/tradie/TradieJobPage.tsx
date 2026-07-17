import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatGbp,
  getTradieSession,
  tradieApi,
  type QuoteDto,
  type QuoteLineDto,
} from "../../api/tradie";
import { IconPhone, StatusPill, initialsOf } from "./ui";

export default function TradieJobPage() {
  const { enquiryId = "" } = useParams();
  const session = getTradieSession();
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<QuoteDto | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const job = useQuery({
    queryKey: ["tradie-job", enquiryId],
    queryFn: () => tradieApi.job(enquiryId),
    enabled: !!session && !!enquiryId,
  });

  const activeQuote: QuoteDto | null = useMemo(() => {
    if (draft) return draft;
    const quotes = (job.data?.quotes as QuoteDto[] | undefined) || [];
    return quotes.find((q) => q.status === "DRAFT") || quotes[0] || null;
  }, [draft, job.data]);

  const fromNotes = useMutation({
    mutationFn: () => tradieApi.notesToQuote(enquiryId, notes),
    onSuccess: (q: QuoteDto) => {
      setDraft(q);
      qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
    },
  });

  const fromVoice = useMutation({
    mutationFn: async (payload: { contentType: string; dataBase64: string; durationSec: number }) => {
      const r = await tradieApi.voiceToQuote(enquiryId, payload.contentType, payload.dataBase64, payload.durationSec);
      return r.quote;
    },
    onSuccess: (q: QuoteDto) => {
      setDraft(q);
      qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
    },
  });

  const saveLines = useMutation({
    mutationFn: (lines: QuoteLineDto[]) =>
      tradieApi.saveLines(activeQuote!.id, {
        lines: lines.map((l) => ({
          label: l.label,
          qty: Number(l.qty),
          unit: l.unit,
          unitPricePence: Number(l.unitPricePence),
          vatRate: Number(l.vatRate ?? 20),
        })),
      }),
    onSuccess: (q: QuoteDto) => setDraft(q),
  });

  const approve = useMutation({
    mutationFn: () => tradieApi.approve(activeQuote!.id),
    onSuccess: (q: QuoteDto & { publicUrl: string }) => {
      setDraft(q);
      alert(`Quote sent.\n${q.publicUrl}`);
      qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
      qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => tradieApi.deleteQuote(activeQuote!.id),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
    },
  });

  const messages = useQuery({
    queryKey: ["tradie-messages", enquiryId],
    queryFn: () => tradieApi.jobMessages(enquiryId),
    enabled: !!session && !!enquiryId,
  });

  const makeInvoice = useMutation({
    mutationFn: () => tradieApi.invoiceFromQuote(activeQuote!.id),
    onSuccess: async (inv: { id: string }) => {
      if (confirm("Invoice created. Send to customer by SMS now?")) {
        await tradieApi.sendInvoice(inv.id);
      }
      qc.invalidateQueries({ queryKey: ["tradie-invoices"] });
      alert("Invoice ready — see Invoices tab.");
    },
  });

  if (!session) return <Navigate to="/t/auth" replace />;
  if (job.isLoading) return <p>Loading…</p>;
  if (job.isError) return <p className="error">{(job.error as Error).message}</p>;

  const enquiry = job.data as {
    id: string;
    name: string;
    phone: string;
    message: string | null;
    postcode: string | null;
    distanceMiles: number | null;
    photoUrls: string[];
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        fromVoice.mutate({ contentType: blob.type || "audio/webm", dataBase64: dataUrl, durationSec: 0 });
      };
      reader.readAsDataURL(blob);
    };
    mediaRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const updateLine = (idx: number, patch: Partial<QuoteLineDto>) => {
    if (!activeQuote) return;
    const lines = activeQuote.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    setDraft({ ...activeQuote, lines });
  };

  const addLine = () => {
    if (!activeQuote) return;
    setDraft({
      ...activeQuote,
      lines: [
        ...activeQuote.lines,
        { label: "Labour", qty: 1, unit: "JOB", unitPricePence: 0, vatRate: 20, source: "MANUAL" },
      ],
    });
  };

  const lineSourceHint = (l: QuoteLineDto): string => {
    if (l.priceBookItem?.sku || l.priceBookItem?.label) {
      const tag = l.priceBookItem.sku || l.priceBookItem.label;
      return `From price book · ${tag}`;
    }
    if (l.priceBookItemId || l.source === "BOOK" || l.source === "VOICE") {
      if (l.unitPricePence > 0) return "From price book";
      return "No match — enter price";
    }
    if (l.unitPricePence <= 0) return "No match — enter price";
    return "Manual price";
  };

  return (
    <div className="t-job-page">
      <Link className="t-back" to="/t">
        ← Jobs
      </Link>

      <div className="t-card t-contact-card">
        <div className="t-contact-head">
          <span className="t-avatar">{initialsOf(enquiry.name)}</span>
          <div>
            <h1>{enquiry.name}</h1>
            <p className="t-contact-meta">
              <a className="t-tel" href={`tel:${enquiry.phone}`}>
                <IconPhone /> {enquiry.phone}
              </a>
              {enquiry.postcode && <span>· {enquiry.postcode}</span>}
              {enquiry.distanceMiles != null && (
                <span className="t-pill t-pill--slate">~{enquiry.distanceMiles} mi</span>
              )}
            </p>
          </div>
        </div>
        {enquiry.message && <blockquote className="t-quote-msg">{enquiry.message}</blockquote>}
        {enquiry.photoUrls?.length > 0 && (
          <div className="tradie-photos">
            {enquiry.photoUrls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                <img src={u} alt="" />
              </a>
            ))}
          </div>
        )}
      </div>

      <p className="t-section-label">Draft a quote</p>
      <div className="t-card">
        <textarea
          rows={4}
          placeholder="Type the job: combi swap, 2 rads upstairs, call-out…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="tradie-actions">
          <button
            className="primary"
            disabled={fromNotes.isPending || notes.trim().length < 3}
            onClick={() => fromNotes.mutate()}
          >
            {fromNotes.isPending ? "Building…" : "Draft from notes"}
          </button>
          {!recording ? (
            <button onClick={() => void startRecording()} disabled={fromVoice.isPending}>
              Record voice
            </button>
          ) : (
            <button className="danger" onClick={stopRecording}>
              Stop & transcribe
            </button>
          )}
        </div>
        {(fromNotes.isError || fromVoice.isError) && (
          <p className="error">{((fromNotes.error || fromVoice.error) as Error).message}</p>
        )}
        {fromVoice.isPending && <p className="muted-text">Transcribing &amp; pricing…</p>}
      </div>

      {activeQuote && (
        <>
          <p className="t-section-label">Quote</p>
          <div className="t-card">
            <div className="t-quote-head">
              <StatusPill status={activeQuote.status} />
              <span className="t-money">{formatGbp(activeQuote.totalPence)}</span>
            </div>
            {activeQuote.assumptions && <p className="t-quote-assumptions">{activeQuote.assumptions}</p>}

            {activeQuote.status === "DRAFT" && (
              <div className="tradie-lines">
                {activeQuote.lines.map((l, i) => (
                  <div key={l.id || i} className="tradie-line-block">
                    <div className="tradie-line">
                      <input value={l.label} onChange={(e) => updateLine(i, { label: e.target.value })} />
                      <input
                        type="number"
                        step="0.25"
                        value={l.qty}
                        onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                      />
                      <select value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })}>
                        {["JOB", "HOUR", "EACH", "DAY", "METRE"].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="1"
                        value={(l.unitPricePence / 100).toFixed(2)}
                        onChange={(e) => updateLine(i, { unitPricePence: Math.round(Number(e.target.value) * 100) })}
                        title="Unit price £"
                      />
                      <button
                        className="linkish"
                        onClick={() =>
                          setDraft({ ...activeQuote, lines: activeQuote.lines.filter((_, j) => j !== i) })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <p className="tradie-line-source">{lineSourceHint(l)}</p>
                  </div>
                ))}
                <div className="tradie-actions">
                  <button onClick={addLine}>+ Line</button>
                  <button onClick={() => saveLines.mutate(activeQuote.lines)} disabled={saveLines.isPending}>
                    {saveLines.isPending ? "Saving…" : "Save edits"}
                  </button>
                </div>
                <div className="tradie-actions">
                  <button
                    className="primary t-btn--block"
                    onClick={() => approve.mutate()}
                    disabled={approve.isPending}
                  >
                    {approve.isPending ? "Sending…" : "Approve & send to customer"}
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm("Delete this draft?")) remove.mutate();
                    }}
                  >
                    Delete draft
                  </button>
                </div>
                {(saveLines.isError || approve.isError || remove.isError) && (
                  <p className="error">
                    {((saveLines.error || approve.error || remove.error) as Error).message}
                  </p>
                )}
              </div>
            )}

            {activeQuote.status === "SENT" && (
              <p className="muted-text">Sent to customer. Waiting for accept/decline — follow-ups are scheduled.</p>
            )}
            {(activeQuote.status === "ACCEPTED" || activeQuote.status === "SENT") && (
              <div className="tradie-actions">
                <button
                  className="convert t-btn--block"
                  onClick={() => makeInvoice.mutate()}
                  disabled={makeInvoice.isPending}
                >
                  {makeInvoice.isPending ? "Creating…" : "Create invoice"}
                </button>
                {makeInvoice.isError && <p className="error">{(makeInvoice.error as Error).message}</p>}
              </div>
            )}
          </div>
        </>
      )}

      <section>
        <p className="t-section-label">Messages</p>
        {messages.isLoading && <p className="muted-text">Loading…</p>}
        <ul className="tradie-messages">
          {(messages.data || []).map((m: { id: string; direction: string; channel: string; body: string; createdAt: string }) => (
            <li key={m.id} className={m.direction === "INBOUND" ? "in" : "out"}>
              <span className="muted-text">
                {m.direction === "INBOUND" ? "Customer" : "You"} · {m.channel} ·{" "}
                {new Date(m.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
        {messages.data?.length === 0 && <p className="muted-text">No messages logged for this job yet.</p>}
      </section>
    </div>
  );
}
