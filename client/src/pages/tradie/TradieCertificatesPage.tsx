import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, tradieApi, type CertificateDto } from "../../api/tradie";

const KINDS = [
  { value: "GAS_SAFETY" as const, label: "Gas Safety Record (CP12)" },
  { value: "MINOR_WORKS" as const, label: "Minor Works Certificate" },
  { value: "EICR" as const, label: "EICR" },
];

export default function TradieCertificatesPage() {
  const session = getTradieSession();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiryId");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<"GAS_SAFETY" | "MINOR_WORKS" | "EICR">("GAS_SAFETY");
  const [siteAddress, setSiteAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [appliance, setAppliance] = useState("");
  const [result, setResult] = useState("Pass");
  const [notes, setNotes] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const list = useQuery({
    queryKey: ["tradie-certificates"],
    queryFn: () => tradieApi.certificates(),
    enabled: !!session,
  });

  const job = useQuery({
    queryKey: ["tradie-job", enquiryId],
    queryFn: () => tradieApi.job(enquiryId!),
    enabled: !!session && !!enquiryId,
  });

  useEffect(() => {
    if (!job.data) return;
    setCustomerName((job.data.name as string) || "");
    setCustomerPhone((job.data.phone as string) || "");
    setSiteAddress((job.data.postcode as string) || "");
  }, [job.data]);

  const detail = useQuery({
    queryKey: ["tradie-certificate", selectedId],
    queryFn: () => tradieApi.getCertificate(selectedId!),
    enabled: !!selectedId,
  });

  const create = useMutation({
    mutationFn: () =>
      tradieApi.createCertificate({
        kind,
        enquiryId: enquiryId || null,
        siteAddress: siteAddress || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        formData: { appliance, result, notes },
      }),
    onSuccess: (row: CertificateDto) => {
      setSelectedId(row.id);
      qc.invalidateQueries({ queryKey: ["tradie-certificates"] });
    },
  });

  const save = useMutation({
    mutationFn: () =>
      tradieApi.updateCertificate(selectedId!, {
        siteAddress: siteAddress || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        formData: { appliance, result, notes },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-certificate", selectedId] }),
  });

  const sign = useMutation({
    mutationFn: () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("No signature pad");
      return tradieApi.signCertificate(selectedId!, canvas.toDataURL("image/png"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tradie-certificate", selectedId] });
      qc.invalidateQueries({ queryKey: ["tradie-certificates"] });
    },
  });

  const send = useMutation({
    mutationFn: () => tradieApi.sendCertificate(selectedId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-certificates"] }),
  });

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setSiteAddress(d.siteAddress || "");
    setCustomerName(d.customerName || "");
    setCustomerPhone(d.customerPhone || "");
    const fd = d.formData || {};
    setAppliance(String(fd.appliance || ""));
    setResult(String(fd.result || "Pass"));
    setNotes(String(fd.notes || ""));
  }, [detail.data]);

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>, type: "down" | "move" | "up") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (type === "down") {
      drawing.current = true;
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (type === "move" && drawing.current) {
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0f172a";
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      drawing.current = false;
    }
  };

  if (!session) return null;

  return (
    <div>
      <header className="t-page-head">
        <h2>Certificates</h2>
        <p>Gas Safety, Minor Works, EICR — sign on site, SMS the PDF, auto service reminder in ~11 months.</p>
      </header>

      {!selectedId && (
        <>
          <div className="t-card form">
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </label>
            <label>
              Phone
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </label>
            <label>
              Site address / postcode
              <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
            </label>
            <button type="button" className="primary t-btn--block" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Start certificate"}
            </button>
            {create.isError && <p className="error">{(create.error as Error).message}</p>}
          </div>

          <p className="t-section-label">Recent</p>
          {(list.data || []).map((c: CertificateDto) => (
            <button
              key={c.id}
              type="button"
              className="t-card"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8 }}
              onClick={() => setSelectedId(c.id)}
            >
              <strong>{KINDS.find((k) => k.value === c.kind)?.label || c.kind}</strong>
              <div className="muted-text">
                {c.customerName || "—"} · {c.status}
                {c.serviceDueAt ? ` · service due ${new Date(c.serviceDueAt).toLocaleDateString("en-GB")}` : ""}
              </div>
            </button>
          ))}
        </>
      )}

      {selectedId && (
        <div className="t-card form">
          <button type="button" className="linkish" onClick={() => setSelectedId(null)}>
            ← All certificates
          </button>
          <p className="muted-text">Status: {detail.data?.status || "…"}</p>
          <label>
            Customer
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <label>
            Phone
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </label>
          <label>
            Site
            <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
          </label>
          <label>
            Appliance / circuit
            <input value={appliance} onChange={(e) => setAppliance(e.target.value)} />
          </label>
          <label>
            Result
            <select value={result} onChange={(e) => setResult(e.target.value)}>
              <option>Pass</option>
              <option>Fail</option>
              <option>Pass with advisory</option>
            </select>
          </label>
          <label>
            Notes
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save details"}
          </button>

          {detail.data?.status === "DRAFT" && (
            <>
              <p className="t-section-label">Customer / engineer signature</p>
              <canvas
                ref={canvasRef}
                width={320}
                height={120}
                style={{ width: "100%", maxWidth: 320, height: 120, border: "1px solid #cbd5e1", borderRadius: 8, touchAction: "none", background: "#fff" }}
                onPointerDown={(e) => pointer(e, "down")}
                onPointerMove={(e) => pointer(e, "move")}
                onPointerUp={(e) => pointer(e, "up")}
                onPointerLeave={(e) => pointer(e, "up")}
              />
              <button type="button" className="primary t-btn--block" onClick={() => sign.mutate()} disabled={sign.isPending}>
                {sign.isPending ? "Signing…" : "Sign & generate PDF"}
              </button>
            </>
          )}

          {detail.data?.pdfUrl && (
            <p>
              <a href={detail.data.pdfUrl} target="_blank" rel="noreferrer">
                Download PDF
              </a>
            </p>
          )}

          {(detail.data?.status === "SIGNED" || detail.data?.status === "SENT") && (
            <button type="button" className="convert t-btn--block" onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? "Sending…" : "SMS certificate to customer"}
            </button>
          )}
          {sign.isError && <p className="error">{(sign.error as Error).message}</p>}
          {send.isError && <p className="error">{(send.error as Error).message}</p>}
          {enquiryId && (
            <Link to={`/t/jobs/${enquiryId}`}>Back to job</Link>
          )}
        </div>
      )}
    </div>
  );
}
