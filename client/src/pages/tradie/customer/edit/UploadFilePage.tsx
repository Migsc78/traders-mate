import { useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, FILE_CATEGORIES, type FileCategory } from "../../../../api/customers";
import { uploadCustomerFile } from "../../../../lib/newCustomer";
import { useOffline } from "../../../../lib/connectivity";
import { QueryError } from "../../ui";
import { ChipPicker, Field, Toggle, fromDateInput } from "../forms";

const MAX_BYTES = 12 * 1024 * 1024;

/** Strip the "data:...;base64," prefix the FileReader adds. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Sheet 3 screen 7 — upload a file, categorised, linked and dated.
 *
 * The one write in this whole area that genuinely needs signal. The offline queue
 * lives in IndexedDB, and a few megabytes of base64 per certificate would fill it
 * and take the rest of the queue with it — losing quotes and job notes that
 * matter more than a PDF that can wait. So this says so rather than pretending.
 */
export default function UploadFilePage() {
  const { customerId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();
  const fileRef = useRef<HTMLInputElement>(null);

  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  const [category, setCategory] = useState<FileCategory>("CERTIFICATE");
  const [file, setFile] = useState<File | null>(null);
  const [propertyId, setPropertyId] = useState(params.get("propertyId") || "");
  const [assetId, setAssetId] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");

  const properties = record.data?.properties || [];
  const assets = properties.find((p) => p.id === propertyId)?.assets || [];

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a file first");
      if (file.size > MAX_BYTES) throw new Error("That file is over 12 MB — try a smaller scan or photo.");
      await uploadCustomerFile(customerId, {
        filename: file.name,
        contentType: file.type || "application/pdf",
        dataBase64: await toBase64(file),
        category,
        propertyId: propertyId || null,
        assetId: assetId || null,
        issuedAt: fromDateInput(issuedAt),
        expiresAt: fromDateInput(expiresAt),
        visibility: visible ? "CUSTOMER" : "INTERNAL",
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-customer", customerId] });
      void qc.invalidateQueries({ queryKey: ["tradie-property", propertyId] });
      navigate(`/t/customers/${customerId}?tab=files`, { replace: true });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="t-customer-form">
      <ChipPicker
        label="File category"
        options={FILE_CATEGORIES}
        value={category}
        onChange={(v) => v && setCategory(v)}
      />

      <p className="t-field-label">File</p>
      <button type="button" className="t-picker-row" onClick={() => fileRef.current?.click()}>
        <span className={file ? undefined : "muted-text"}>{file ? file.name : "Choose a photo or PDF"}</span>
        <span className="muted-text">{file ? `${Math.round(file.size / 1024)} KB` : "Browse"}</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError("");
        }}
      />

      <Field label="Link to property">
        <select
          value={propertyId}
          onChange={(e) => {
            setPropertyId(e.target.value);
            setAssetId("");
          }}
        >
          <option value="">Whole customer</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname || p.postcode || "Property"}
            </option>
          ))}
        </select>
      </Field>

      {assets.length > 0 && (
        <Field label="Link to asset (optional)">
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">None</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.kind}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="t-two-fields">
        <label>
          Issue date
          <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </label>
        <label>
          Expiry / reminder
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
      </div>

      <Toggle
        label="Customer can see this"
        hint={visible ? "Shared with the customer" : "Internal only — the safe default"}
        checked={visible}
        onChange={setVisible}
      />

      {error && <p className="error">{error}</p>}
      <QueryError error={upload.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={!file || offline || upload.isPending}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? "Uploading…" : "Upload file"}
      </button>

      {offline && (
        <p className="t-needs-signal">
          Uploads need signal — everything else on this customer saves offline and syncs later.
        </p>
      )}
    </div>
  );
}
