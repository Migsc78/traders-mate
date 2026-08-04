import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, NOTE_TYPES, type NoteType } from "../../../../api/customers";
import { createNote } from "../../../../lib/newCustomer";
import { QueryError } from "../../ui";
import { ChipPicker, Field, Toggle } from "../forms";

/**
 * Sheet 3 screen 6 — a note, typed and linked.
 *
 * Visibility defaults to internal and has to be changed deliberately. The
 * wireframe's principle is "separate internal vs customer-visible", and the
 * failure that actually matters is a private note about a slow payer ending up
 * in front of the slow payer.
 */
export default function AddNotePage() {
  const { customerId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  const [type, setType] = useState<NoteType>("CUSTOMER");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [visible, setVisible] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [assetId, setAssetId] = useState("");

  const properties = record.data?.properties || [];
  const assets = properties.find((p) => p.id === propertyId)?.assets || [];

  const save = useMutation({
    mutationFn: () =>
      createNote(qc, customerId, {
        type,
        body: body.trim(),
        pinned,
        visibility: visible ? "CUSTOMER" : "INTERNAL",
        propertyId: propertyId || null,
        assetId: assetId || null,
      }),
    onSuccess: () => navigate(`/t/customers/${customerId}`, { replace: true }),
  });

  return (
    <div className="t-customer-form">
      <Toggle label="Pin note" hint="Show it at the top of the record" checked={pinned} onChange={setPinned} />

      <ChipPicker label="Note type" options={NOTE_TYPES} value={type} onChange={(v) => v && setType(v)} />

      <p className="t-field-label">Link to</p>
      <Field label="Property">
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
        <Field label="Asset (optional)">
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

      <Field label="Note">
        <textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. Spoke to Bob about upgrading the cylinder thermostat. To follow up with options."
          autoFocus
        />
      </Field>

      <Toggle
        label="Customer can see this"
        hint={visible ? "Shared with the customer" : "Internal only — the safe default"}
        checked={visible}
        onChange={setVisible}
      />

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={body.trim().length < 2 || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}
