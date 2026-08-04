import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatGbp,
  sendOrQueue,
  tradieApi,
  type QuoteDto,
  type QuoteLineDto,
} from "../../../../api/tradie";
import type { JobDetail } from "../../../../api/jobs";
import { NeedsSignal, QueryError, StatusPill } from "../../ui";
import { MoneyInput, NumberInput } from "../../../../components/NumericInput";
import { useOffline } from "../../../../lib/connectivity";

/**
 * Drafting and pricing, moved wholesale from the old single-page job screen.
 *
 * Deliberately a move, not a rewrite: voice capture, the price-book provenance
 * hints, the offline queueing and the deposit-on-accept field all work and had
 * no reason to be re-derived. What's new is only that it lives behind a tab.
 */
export default function QuoteTab({ detail }: { detail: JobDetail }) {
  const qc = useQueryClient();
  const offline = useOffline();
  const jobId = detail.id;
  const who = detail.job.customer?.name || detail.name || "job";

  const [notes, setNotes] = useState("");
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<QuoteDto | null>(null);
  const [depositPercent, setDepositPercent] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const depositSeeded = useRef(false);

  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });

  useEffect(() => {
    if (!me.data || depositSeeded.current) return;
    depositSeeded.current = true;
    if (me.data.defaultDepositPercent) setDepositPercent(me.data.defaultDepositPercent);
  }, [me.data]);

  const activeQuote: QuoteDto | null = useMemo(() => {
    if (draft) return draft;
    const quotes = (detail.quotes as unknown as QuoteDto[]) || [];
    return quotes.find((q) => q.status === "DRAFT") || quotes[0] || null;
  }, [draft, detail.quotes]);

  // Drafting needs Claude/Whisper server-side, so with no signal the write is
  // queued instead: the tradie captures on site, the quote is built the moment
  // they're back in range. The audio itself is already local, so nothing is lost.
  const fromNotes = useMutation({
    mutationFn: () =>
      sendOrQueue<QuoteDto>({
        label: `Quote from notes · ${who}`,
        path: `/jobs/${jobId}/notes`,
        method: "POST",
        body: { transcript: notes },
        invalidates: ["tradie-job", "tradie-quotes", "tradie-jobs"],
      }),
    onSuccess: (r) => {
      if (r.queued) {
        setNotes("");
        return;
      }
      setDraft(r.result);
      void qc.invalidateQueries({ queryKey: ["tradie-job", jobId] });
    },
  });

  const fromVoice = useMutation({
    mutationFn: (payload: { contentType: string; dataBase64: string; durationSec: number }) =>
      sendOrQueue<{ quote: QuoteDto }>({
        label: `Voice note · ${who}`,
        path: `/jobs/${jobId}/voice`,
        method: "POST",
        body: payload,
        invalidates: ["tradie-job", "tradie-quotes", "tradie-jobs"],
      }),
    onSuccess: (r) => {
      if (r.queued) return;
      setDraft(r.result.quote);
      void qc.invalidateQueries({ queryKey: ["tradie-job", jobId] });
    },
  });

  const saveLines = useMutation({
    mutationFn: (lines: QuoteLineDto[]) =>
      sendOrQueue<QuoteDto>({
        label: `Quote edits · ${who}`,
        path: `/quotes/${activeQuote!.id}/lines`,
        method: "PUT",
        body: {
          lines: lines.map((l) => ({
            label: l.label,
            qty: Number(l.qty),
            unit: l.unit,
            unitPricePence: Number(l.unitPricePence),
            vatRate: Number(l.vatRate ?? 20),
          })),
        },
        invalidates: ["tradie-job", "tradie-quotes"],
      }),
    onSuccess: (r) => {
      if (!r.queued) setDraft(r.result);
    },
  });

  const approve = useMutation({
    mutationFn: () => tradieApi.approve(activeQuote!.id, { depositPercent }),
    onSuccess: (q: QuoteDto & { publicUrl: string }) => {
      setDraft(q);
      alert(`Quote sent.\n${q.publicUrl}`);
      void qc.invalidateQueries({ queryKey: ["tradie-job", jobId] });
      void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: `Delete draft · ${who}`,
        path: `/quotes/${activeQuote!.id}`,
        method: "DELETE",
        body: {},
        invalidates: ["tradie-job", "tradie-quotes", "tradie-jobs"],
      }),
    onSuccess: (r) => {
      setDraft(null);
      if (!r.queued) void qc.invalidateQueries({ queryKey: ["tradie-job", jobId] });
    },
  });

  /**
   * Turn the accepted quote into the job's commercial baseline.
   *
   * Only offered once the customer has actually accepted — that is the moment
   * the price stops being a proposal and starts being what the job is worth.
   */
  const buildJob = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: `Create job · ${who}`,
        path: `/jobs/from-quote/${activeQuote!.id}`,
        method: "POST",
        body: {},
        invalidates: ["tradie-job", "tradie-jobs"],
      }),
    onSuccess: (r) => {
      if (!r.queued) {
        void qc.invalidateQueries({ queryKey: ["tradie-job", jobId] });
        void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      }
    },
  });

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

  const alreadyBuilt = !!detail.job.latestQuote && detail.job.commercial !== "UNQUOTED";

  return (
    <section>
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
            {fromNotes.isPending ? "Building…" : offline ? "Save notes for later" : "Draft from notes"}
          </button>
          {!recording ? (
            <button onClick={() => void startRecording()} disabled={fromVoice.isPending}>
              Record voice
            </button>
          ) : (
            <button className="danger" onClick={stopRecording}>
              {offline ? "Stop & save" : "Stop & transcribe"}
            </button>
          )}
        </div>
        {offline && (
          <NeedsSignal>
            Saved on your phone — we&apos;ll price it up the moment you&apos;re back in range.
          </NeedsSignal>
        )}
        <QueryError error={fromNotes.error || fromVoice.error} />
        {fromVoice.isPending && (
          <p className="muted-text">{offline ? "Saving…" : "Transcribing & pricing…"}</p>
        )}
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
                      <NumberInput value={l.qty} onValue={(qty) => updateLine(i, { qty })} />
                      <select value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })}>
                        {["JOB", "HOUR", "EACH", "DAY", "METRE"].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <MoneyInput
                        pence={l.unitPricePence}
                        onPence={(unitPricePence) => updateLine(i, { unitPricePence })}
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
                <label>
                  Deposit on accept (%)
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={depositPercent === 0 ? "" : String(depositPercent)}
                    placeholder="0"
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (raw === "") {
                        setDepositPercent(0);
                        return;
                      }
                      const n = Math.min(100, Math.max(0, parseInt(raw, 10)));
                      setDepositPercent(Number.isFinite(n) ? n : 0);
                    }}
                  />
                </label>
                <div className="tradie-actions">
                  <button
                    className="primary t-btn--block"
                    onClick={() => approve.mutate()}
                    disabled={offline || approve.isPending}
                  >
                    {approve.isPending ? "Sending…" : "Approve & send to customer"}
                  </button>
                  <button
                    className="danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm("Delete this draft?")) remove.mutate();
                    }}
                  >
                    Delete draft
                  </button>
                </div>
                {offline && (
                  <NeedsSignal>Edits are saved on your phone. Sending and deleting need signal.</NeedsSignal>
                )}
                <QueryError error={saveLines.error || approve.error || remove.error} />
              </div>
            )}

            {activeQuote.status === "SENT" && (
              <p className="muted-text">
                Sent to customer. Waiting for accept/decline — follow-ups are scheduled.
              </p>
            )}

            {activeQuote.status === "ACCEPTED" && (
              <div className="tradie-actions" style={{ marginTop: 12 }}>
                {alreadyBuilt ? (
                  <p className="muted-text">
                    This quote is the job&apos;s agreed price. Extras are added on the Costs tab so the
                    accepted total stays readable.
                  </p>
                ) : (
                  <>
                    <button
                      className="convert t-btn--block"
                      onClick={() => buildJob.mutate()}
                      disabled={buildJob.isPending}
                    >
                      {buildJob.isPending ? "Creating…" : "Create job from this quote"}
                    </button>
                    <QueryError error={buildJob.error} />
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
