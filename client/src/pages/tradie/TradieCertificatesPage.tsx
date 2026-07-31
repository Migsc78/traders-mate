import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, tradieApi, type CertificateDto } from "../../api/tradie";
import { QueryError } from "../../components/QueryError";

const KINDS = [
  { value: "GAS_SAFETY" as const, label: "Gas safety record" },
  { value: "MINOR_WORKS" as const, label: "Minor works" },
  { value: "EICR" as const, label: "EICR" },
  { value: "OTHER" as const, label: "Other paperwork" },
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromDateInput(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function defaultDueDate(issued: string): string {
  const d = issued ? new Date(`${issued}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + 11);
  return d.toISOString().slice(0, 10);
}

function kindLabel(kind: string) {
  return KINDS.find((k) => k.value === kind)?.label || kind;
}

function statusLabel(status: string) {
  if (status === "FILED" || status === "SIGNED") return "Filed";
  if (status === "SENT") return "Shared";
  return status;
}

async function readFileAsPayload(file: File): Promise<{ contentType: string; dataBase64: string }> {
  const contentType = file.type || "application/octet-stream";
  if (!/^image\/(jpeg|jpg|png|webp|heic)$/i.test(contentType) && contentType !== "application/pdf") {
    throw new Error("Use a photo (JPEG/PNG/WebP) or a PDF");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("File too large (max 12 MB)");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return { contentType, dataBase64: dataUrl };
}

export default function TradieCertificatesPage() {
  const session = getTradieSession();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiryId");
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("id"));
  const [kind, setKind] = useState<"GAS_SAFETY" | "MINOR_WORKS" | "EICR" | "OTHER">("GAS_SAFETY");
  const [siteAddress, setSiteAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [schemeRef, setSchemeRef] = useState("");
  const [notes, setNotes] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceDueAt, setServiceDueAt] = useState(() => defaultDueDate(new Date().toISOString().slice(0, 10)));
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");

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
    if (!job.data || selectedId) return;
    setCustomerName((job.data.name as string) || "");
    setCustomerPhone((job.data.phone as string) || "");
    setSiteAddress((job.data.postcode as string) || "");
  }, [job.data, selectedId]);

  useEffect(() => {
    if (!issuedAt || selectedId) return;
    setServiceDueAt(defaultDueDate(issuedAt));
  }, [issuedAt, selectedId]);

  const detail = useQuery({
    queryKey: ["tradie-certificate", selectedId],
    queryFn: () => tradieApi.getCertificate(selectedId!),
    enabled: !!selectedId,
  });

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setKind((d.kind as typeof kind) || "GAS_SAFETY");
    setSiteAddress(d.siteAddress || "");
    setCustomerName(d.customerName || "");
    setCustomerPhone(d.customerPhone || "");
    setSchemeRef(d.schemeRef || "");
    setNotes(String(d.formData?.notes || ""));
    setIssuedAt(toDateInput(d.issuedAt) || toDateInput(d.createdAt));
    setServiceDueAt(toDateInput(d.serviceDueAt) || defaultDueDate(toDateInput(d.issuedAt) || ""));
    setFile(null);
    setFileError("");
  }, [detail.data]);

  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a photo or PDF of the certificate");
      const payload = await readFileAsPayload(file);
      return tradieApi.createCertificate({
        kind,
        enquiryId: enquiryId || null,
        siteAddress: siteAddress || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        schemeRef: schemeRef || null,
        notes: notes || null,
        issuedAt: fromDateInput(issuedAt),
        serviceDueAt: fromDateInput(serviceDueAt),
        file: payload,
      });
    },
    onSuccess: (row: CertificateDto) => {
      setSelectedId(row.id);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["tradie-certificates"] });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      let filePayload: { contentType: string; dataBase64: string } | undefined;
      if (file) filePayload = await readFileAsPayload(file);
      return tradieApi.updateCertificate(selectedId!, {
        kind,
        siteAddress: siteAddress || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        schemeRef: schemeRef || null,
        notes: notes || null,
        issuedAt: fromDateInput(issuedAt),
        serviceDueAt: fromDateInput(serviceDueAt),
        ...(filePayload ? { file: filePayload } : {}),
      });
    },
    onSuccess: () => {
      setFile(null);
      qc.invalidateQueries({ queryKey: ["tradie-certificate", selectedId] });
      qc.invalidateQueries({ queryKey: ["tradie-certificates"] });
    },
  });

  const send = useMutation({
    mutationFn: () => tradieApi.sendCertificate(selectedId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-certificates"] }),
  });

  if (!session) return null;

  const previewUrl = detail.data?.pdfUrl;
  const previewIsImage =
    !!previewUrl &&
    ((detail.data?.fileContentType || "").startsWith("image/") ||
      /\.(jpe?g|png|webp|heic)(\?|$)/i.test(previewUrl));

  return (
    <div>
      <header className="t-page-head">
        <h2>Certs &amp; paperwork</h2>
        <p>
          Store a photo or PDF of the real certificate you issued (Gas Safe pad, electrical software, etc.). We
          remind you when it&apos;s due — we don&apos;t generate official CP12/EICR forms.
        </p>
      </header>

      {!selectedId && (
        <>
          <div className="t-card form">
            <label>
              Document type
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
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" />
            </label>
            <label>
              Site address / postcode
              <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
            </label>
            <label>
              Date done
              <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </label>
            <label>
              Reminder / next due
              <input type="date" value={serviceDueAt} onChange={(e) => setServiceDueAt(e.target.value)} />
            </label>
            <label>
              Gas Safe / scheme no. (optional)
              <input
                value={schemeRef}
                onChange={(e) => setSchemeRef(e.target.value)}
                placeholder="e.g. engineer or business registration"
              />
            </label>
            <label>
              Notes (optional)
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <label>
              Photo or PDF
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => {
                  setFileError("");
                  setFile(e.target.files?.[0] || null);
                }}
              />
            </label>
            {file && <p className="muted-text">Selected: {file.name}</p>}
            <button
              type="button"
              className="primary t-btn--block"
              disabled={create.isPending}
              onClick={() => {
                setFileError("");
                create.mutate(undefined, {
                  onError: (err: unknown) =>
                    setFileError(err instanceof Error ? err.message : "Could not save"),
                });
              }}
            >
              {create.isPending ? "Saving…" : "Save certificate file"}
            </button>
            {(fileError || create.isError) && (
              <p className="error">{fileError || (create.error as Error).message}</p>
            )}
          </div>

          <p className="t-section-label">Filed</p>
          {(list.data || []).length === 0 && (
            <p className="muted-text">No certificates filed yet.</p>
          )}
          {(list.data || []).map((c: CertificateDto) => (
            <button
              key={c.id}
              type="button"
              className="t-card"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8 }}
              onClick={() => setSelectedId(c.id)}
            >
              <strong>{kindLabel(c.kind)}</strong>
              <div className="muted-text">
                {c.customerName || "—"} · {statusLabel(c.status)}
                {c.serviceDueAt ? ` · due ${new Date(c.serviceDueAt).toLocaleDateString("en-GB")}` : ""}
              </div>
            </button>
          ))}
        </>
      )}

      {selectedId && (
        <div className="t-card form">
          <button type="button" className="linkish" onClick={() => setSelectedId(null)}>
            ← All paperwork
          </button>
          <p className="muted-text">Status: {statusLabel(detail.data?.status || "…")}</p>

          {previewUrl && (
            <div className="t-cert-preview">
              {previewIsImage ? (
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <img src={previewUrl} alt="Certificate file" />
                </a>
              ) : (
                <a className="t-btn" href={previewUrl} target="_blank" rel="noreferrer">
                  Open filed PDF
                </a>
              )}
            </div>
          )}

          <label>
            Document type
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
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" />
          </label>
          <label>
            Site
            <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
          </label>
          <label>
            Date done
            <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </label>
          <label>
            Reminder / next due
            <input type="date" value={serviceDueAt} onChange={(e) => setServiceDueAt(e.target.value)} />
          </label>
          <label>
            Gas Safe / scheme no. (optional)
            <input value={schemeRef} onChange={(e) => setSchemeRef(e.target.value)} />
          </label>
          <label>
            Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label>
            Replace file (optional)
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={(e) => {
                setFileError("");
                setFile(e.target.files?.[0] || null);
              }}
            />
          </label>
          {file && <p className="muted-text">New file: {file.name}</p>}

          <button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>

          {detail.data?.pdfUrl && (
            <button
              type="button"
              className="convert t-btn--block"
              onClick={() => send.mutate()}
              disabled={send.isPending || !customerPhone.trim()}
            >
              {send.isPending ? "Sending…" : "SMS link to customer"}
            </button>
          )}

          <QueryError error={save.error} />
          <QueryError error={send.error} />
          {enquiryId && <Link to={`/t/jobs/${enquiryId}`}>Back to job</Link>}
        </div>
      )}
    </div>
  );
}
