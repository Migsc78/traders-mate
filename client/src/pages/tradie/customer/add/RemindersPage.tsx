import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "../../../../api/customers";
import { createReminder, deleteReminder } from "../../../../lib/newCustomer";
import { QueryError } from "../../ui";
import { fmtDate } from "../format";
import { fromDateInput, toDateInput } from "../forms";

const PRESETS = [
  { kind: "ANNUAL_SERVICE", label: "Annual service", months: 12 },
  { kind: "CERT_EXPIRY", label: "Certificate expiry", months: 12 },
  { kind: "INSPECTION", label: "Next inspection", months: 24 },
];

function inMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return toDateInput(d.toISOString());
}

/**
 * Sheet 2 step 6 — reminders.
 *
 * The wireframe's own note says assets and reminders drive repeat business, and
 * this is the half that does the driving: an asset records what's there, a
 * reminder is what brings the tradie back to it. The presets exist because a
 * date twelve months out is the single most common thing anyone types here.
 */
export default function RemindersPage() {
  const { customerId = "" } = useParams();
  const [params] = useSearchParams();
  const inFlow = params.get("flow") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("ANNUAL_SERVICE");
  const [dueAt, setDueAt] = useState(inMonths(12));
  const [everyMonths, setEveryMonths] = useState<number | "">(12);
  const [propertyId, setPropertyId] = useState("");

  const add = useMutation({
    mutationFn: () =>
      createReminder(qc, customerId, {
        label: label.trim(),
        kind,
        dueAt: fromDateInput(dueAt) || new Date().toISOString(),
        everyMonths: everyMonths === "" ? null : Number(everyMonths),
        propertyId: propertyId || null,
      }),
    onSuccess: () => setLabel(""),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteReminder(qc, customerId, id),
  });

  const reminders = record.data?.reminders || [];
  const properties = record.data?.properties || [];

  return (
    <div className="t-customer-form">
      {reminders.length > 0 && (
        <>
          <p className="t-field-label">Set up</p>
          <ul className="t-list">
            {reminders.map((r) => (
              <li key={r.id}>
                <div className="t-row t-row--static">
                  <div className="t-row-main">
                    <strong>{r.label}</strong>
                    <span className="t-row-sub">
                      {fmtDate(r.dueAt)}
                      {r.everyMonths ? ` · every ${r.everyMonths} months` : " · one-off"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="linkish"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(r.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="t-field-label">Add a reminder</p>
      <div className="t-chip-row t-chip-row--wrap">
        {PRESETS.map((p) => (
          <button
            key={p.kind}
            type="button"
            className={`t-chip${kind === p.kind ? " is-active" : ""}`}
            onClick={() => {
              setKind(p.kind);
              setLabel(p.label);
              setDueAt(inMonths(p.months));
              setEveryMonths(p.months);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="t-field">
        Reminder
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Annual service — Boiler" />
      </label>

      <div className="t-two-fields">
        <label>
          Due
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <label>
          Repeat (months)
          <input
            type="number"
            min={0}
            value={everyMonths}
            onChange={(e) => setEveryMonths(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="12"
          />
        </label>
      </div>

      {properties.length > 0 && (
        <label className="t-field">
          Property
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Whole customer</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.postcode || "Property"}
              </option>
            ))}
          </select>
        </label>
      )}

      <QueryError error={add.error || remove.error} />

      <button
        type="button"
        className="t-btn t-btn--block"
        disabled={label.trim().length < 2 || add.isPending}
        onClick={() => add.mutate()}
      >
        {add.isPending ? "Adding…" : "+ Add reminder"}
      </button>

      <button
        type="button"
        className="primary t-btn--block"
        style={{ marginTop: 8 }}
        onClick={() =>
          navigate(inFlow ? `/t/customers/${customerId}/review` : `/t/customers/${customerId}`, { replace: true })
        }
      >
        {inFlow ? "Next: Review & save" : "Done"}
      </button>
    </div>
  );
}
