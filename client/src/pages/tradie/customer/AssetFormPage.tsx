import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, type AssetTypeDto } from "../../../api/customers";
import { sendOrQueue } from "../../../api/tradie";
import { createAsset, deleteAsset, saveAsset } from "../../../lib/newCustomer";
import { QueryError } from "../ui";
import { Field, fromDateInput, toDateInput } from "./forms";

/**
 * Add or edit a piece of kit — sheet 2 step 5 and sheet 3 screen 5.
 *
 * The type picker is the researched starter list for the trade, with an "add your
 * own" escape hatch: UK trades don't share a vocabulary, and the tradie who fits
 * something nobody anticipated shouldn't be stuck.
 *
 * Next-due is left blank on purpose when the type has a known interval — the
 * server fills it in from the catalogue. A tradie adding a boiler on a doorstep
 * won't stop to work out what twelve months from today is, and the next-due date
 * is the entire commercial case for the register.
 */
export default function AssetFormPage({ mode }: { mode: "create" | "edit" }) {
  const { propertyId = "", assetId = "" } = useParams();
  const [params] = useSearchParams();
  const inFlow = params.get("flow") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const types = useQuery({ queryKey: ["tradie-asset-types"], queryFn: () => customersApi.assetTypes() });

  // In edit mode the asset is reached through its property, which the record
  // already holds — so this reads from the property rather than adding a
  // single-asset endpoint that would exist for one screen.
  const property = useQuery({
    queryKey: ["tradie-property", propertyId],
    queryFn: () => customersApi.property(propertyId),
    enabled: !!propertyId,
  });

  const existing = useMemo(
    () => (mode === "edit" ? property.data?.assets.find((a) => a.id === assetId) ?? null : null),
    [mode, property.data, assetId]
  );

  const [kind, setKind] = useState("");
  const [customKind, setCustomKind] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [location, setLocation] = useState("");
  const [warrantyUntil, setWarrantyUntil] = useState("");
  const [lastServiceAt, setLastServiceAt] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!existing) return;
    setKind(existing.kind);
    setName(existing.name || "");
    setManufacturer(existing.manufacturer || "");
    setModel(existing.model || "");
    setSerial(existing.serial || "");
    setInstallDate(toDateInput(existing.installDate));
    setLocation(existing.location || "");
    setWarrantyUntil(toDateInput(existing.warrantyUntil));
    setLastServiceAt(toDateInput(existing.lastServiceAt));
    setNextDueAt(toDateInput(existing.nextDueAt));
    setNotes(existing.notes || "");
  }, [existing]);

  const active = (types.data || []).filter((t) => t.active);
  const grouped = useMemo(() => {
    const map = new Map<string, AssetTypeDto[]>();
    for (const t of active) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return [...map.entries()];
  }, [active]);

  const addType = useMutation({
    mutationFn: async () => {
      const label = customKind.trim();
      await sendOrQueue({
        label: `Asset type · ${label}`,
        path: "/asset-types",
        method: "POST",
        body: { label, group: "OTHER" },
        invalidates: ["tradie-asset-types"],
      });
      return label;
    },
    onSuccess: (label) => {
      setKind(label);
      setCustomKind("");
      setAddingType(false);
      void qc.invalidateQueries({ queryKey: ["tradie-asset-types"] });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const draft = {
        kind,
        name: name.trim() || null,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial: serial.trim() || null,
        installDate: fromDateInput(installDate),
        location: location.trim() || null,
        warrantyUntil: fromDateInput(warrantyUntil),
        lastServiceAt: fromDateInput(lastServiceAt),
        nextDueAt: fromDateInput(nextDueAt),
        notes: notes.trim() || null,
      };
      const customerId = property.data?.customer.id || "";
      if (mode === "edit") {
        await saveAsset(qc, customerId, assetId, draft);
        return assetId;
      }
      return createAsset(qc, customerId, propertyId, draft);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-property", propertyId] });
      navigate(
        inFlow ? `/t/customers/${property.data?.customer.id}/reminders?flow=1` : `/t/properties/${propertyId}?tab=assets`,
        { replace: true }
      );
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteAsset(qc, property.data?.customer.id || "", assetId),
    onSuccess: () => navigate(`/t/properties/${propertyId}?tab=assets`, { replace: true }),
  });

  const selectedType = active.find((t) => t.label === kind);

  return (
    <div className="t-customer-form">
      <p className="t-field-label">Asset type</p>
      <div className="t-type-grid">
        {grouped.map(([group, list]) => (
          <div key={group} className="t-type-group">
            <span className="t-type-group-label">{group.toLowerCase()}</span>
            <div className="t-chip-row t-chip-row--wrap">
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={t.label === kind}
                  className={`t-chip${t.label === kind ? " is-active" : ""}`}
                  onClick={() => setKind(t.label)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {addingType ? (
        <div className="t-two-fields" style={{ marginBottom: 16 }}>
          <label>
            New type
            <input
              value={customKind}
              onChange={(e) => setCustomKind(e.target.value)}
              placeholder="e.g. Air handling unit"
              autoFocus
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={customKind.trim().length < 2 || addType.isPending}
            onClick={() => addType.mutate()}
          >
            {addType.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      ) : (
        <button type="button" className="linkish t-rate-add" onClick={() => setAddingType(true)}>
          + Add your own type
        </button>
      )}

      {selectedType?.defaultServiceMonths ? (
        <p className="t-needs-signal">
          Serviced every {selectedType.defaultServiceMonths} months — we&apos;ll set the next due date if you
          leave it blank.
        </p>
      ) : null}

      <Field label="Asset name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Worcester Greenstar 30i" />
      </Field>

      <div className="t-two-fields">
        <label>
          Manufacturer
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Worcester" />
        </label>
        <label>
          Model
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Greenstar 30i" />
        </label>
      </div>

      <Field label="Serial number">
        <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. 8716 1234 5678" />
      </Field>

      <div className="t-two-fields">
        <label>
          Install date
          <input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
        </label>
        <label>
          Location in property
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Kitchen cupboard" />
        </label>
      </div>

      <div className="t-two-fields">
        <label>
          Last service
          <input type="date" value={lastServiceAt} onChange={(e) => setLastServiceAt(e.target.value)} />
        </label>
        <label>
          Next due
          <input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
        </label>
      </div>

      <Field label="Warranty until">
        <input type="date" value={warrantyUntil} onChange={(e) => setWarrantyUntil(e.target.value)} />
      </Field>

      <Field label="Notes">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>

      <QueryError error={save.error || addType.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={!kind || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : mode === "edit" ? "Save asset" : inFlow ? "Next: Reminders" : "Save asset"}
      </button>

      {mode === "edit" && (
        <button
          type="button"
          className="t-btn t-btn--block"
          style={{ marginTop: 8 }}
          disabled={remove.isPending}
          onClick={() => {
            if (confirm("Remove this asset? Its service history goes with it.")) remove.mutate();
          }}
        >
          Remove asset
        </button>
      )}

      {inFlow && mode === "create" && (
        <button
          type="button"
          className="t-btn t-btn--block"
          style={{ marginTop: 8 }}
          onClick={() => navigate(`/t/customers/${property.data?.customer.id}/reminders?flow=1`, { replace: true })}
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
