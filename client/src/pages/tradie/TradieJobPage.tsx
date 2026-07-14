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
    },
  });

  const remove = useMutation({
    mutationFn: () => tradieApi.deleteQuote(activeQuote!.id),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
    },
  });

  if (!session) return <Navigate to="/t/auth" replace />;
  if (job.isLoading) return <div className="tradie-shell"><p>Loading…</p></div>;
  if (job.isError) return <div className="tradie-shell"><p className="error">{(job.error as Error).message}</p></div>;

  const enquiry = job.data as {
    id: string;
    name: string;
    phone: string;
    message: string | null;
    postcode: string | null;
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
    <div className="tradie-shell">
      <p><Link to="/t">← Jobs</Link></p>
      <h1>{enquiry.name}</h1>
      <p className="muted-text">
        {enquiry.phone}
        {enquiry.postcode ? ` · ${enquiry.postcode}` : ""}
      </p>
      {enquiry.message && <p>{enquiry.message}</p>}
      {enquiry.photoUrls?.length > 0 && (
        <div className="tradie-photos">
          {enquiry.photoUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img src={u} alt="" />
            </a>
          ))}
        </div>
      )}

      <h2>Create draft quote</h2>
      <textarea
        rows={4}
        placeholder="Or type the job: combi swap, 2 rads upstairs, call-out…"
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
      {fromVoice.isPending && <p className="muted-text">Transcribing & pricing…</p>}

      {activeQuote && (
        <>
          <h2>
            Quote <span className="badge grey">{activeQuote.status}</span> · {formatGbp(activeQuote.totalPence)}
          </h2>
          {activeQuote.assumptions && <p className="muted-text">{activeQuote.assumptions}</p>}
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
                  <p className="tradie-line-source muted-text">{lineSourceHint(l)}</p>
                </div>
              ))}
              <button onClick={addLine}>+ Line</button>
              <div className="tradie-actions">
                <button
                  onClick={() => saveLines.mutate(activeQuote.lines)}
                  disabled={saveLines.isPending}
                >
                  {saveLines.isPending ? "Saving…" : "Save edits"}
                </button>
                <button
                  className="primary"
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                >
                  {approve.isPending ? "Sending…" : "Approve & send"}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm("Delete this draft?")) remove.mutate();
                  }}
                >
                  Delete
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
            <p className="muted-text">Sent to customer. Waiting for accept/decline. Follow-ups are scheduled.</p>
          )}
        </>
      )}
    </div>
  );
}
