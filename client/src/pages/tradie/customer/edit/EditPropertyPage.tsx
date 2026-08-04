import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, type Occupancy } from "../../../../api/customers";
import { saveProperty } from "../../../../lib/newCustomer";
import { QueryError } from "../../ui";
import { Field, OccupancyPicker, PROPERTY_TYPES } from "../forms";

/** Sheet 3 screen 3 — core property info, with an access summary that links on. */
export default function EditPropertyPage() {
  const { propertyId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const property = useQuery({
    queryKey: ["tradie-property", propertyId],
    queryFn: () => customersApi.property(propertyId),
    enabled: !!propertyId,
  });

  const [nickname, setNickname] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [town, setTown] = useState("");
  const [postcode, setPostcode] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [siteContactId, setSiteContactId] = useState("");

  const customerId = property.data?.customer.id || "";
  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  useEffect(() => {
    const p = property.data;
    if (!p) return;
    setNickname(p.nickname || "");
    setLine1(p.addressLine1 || "");
    setLine2(p.addressLine2 || "");
    setTown(p.town || "");
    setPostcode(p.postcode || "");
    setPropertyType(p.propertyType || "");
    setOccupancy(p.occupancy);
    setSiteContactId(p.siteContactId || "");
  }, [property.data]);

  const save = useMutation({
    mutationFn: () =>
      saveProperty(qc, customerId, propertyId, {
        nickname: nickname.trim() || null,
        addressLine1: line1.trim() || null,
        addressLine2: line2.trim() || null,
        town: town.trim() || null,
        postcode: postcode.trim() || null,
        propertyType: propertyType || null,
        occupancy,
        siteContactId: siteContactId || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-property", propertyId] });
      navigate(`/t/properties/${propertyId}`, { replace: true });
    },
  });

  if (property.isLoading && !property.data) return <p className="muted-text">Loading…</p>;
  const a = property.data?.access;

  return (
    <div className="t-customer-form">
      <Field label="Property nickname">
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </Field>

      <Field label="Address line 1">
        <input value={line1} onChange={(e) => setLine1(e.target.value)} />
      </Field>

      <Field label="Address line 2">
        <input value={line2} onChange={(e) => setLine2(e.target.value)} />
      </Field>

      <div className="t-two-fields">
        <label>
          Town
          <input value={town} onChange={(e) => setTown(e.target.value)} />
        </label>
        <label>
          Postcode
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
        </label>
      </div>

      <Field label="Property type">
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          <option value="">Select type</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <OccupancyPicker value={occupancy} onChange={setOccupancy} />

      <Field label="Site contact">
        <select value={siteContactId} onChange={(e) => setSiteContactId(e.target.value)}>
          <option value="">Not set</option>
          {(record.data?.contacts || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Access is edited on its own screen — the summary is here so the tradie
          can see at a glance whether it's been filled in at all. */}
      <p className="t-field-label">Access summary</p>
      <div className="t-flag-row" style={{ marginBottom: 12 }}>
        {a?.keySafe && <span className="t-mini-pill">Key safe</span>}
        {a?.hasAccessCode && <span className="t-mini-pill">Code</span>}
        {a?.permitRequired && <span className="t-mini-pill">Permit</span>}
        {a?.parking && <span className="t-mini-pill">{a.parking}</span>}
        {a?.dogOnSite && <span className="t-mini-pill">Dog</span>}
        {!a?.keySafe && !a?.hasAccessCode && !a?.parking && (
          <span className="muted-text" style={{ fontSize: 13 }}>
            Nothing recorded yet
          </span>
        )}
      </div>
      <Link className="t-btn t-btn--block" to={`/t/properties/${propertyId}/access`} style={{ marginBottom: 18 }}>
        Edit access &amp; safety
      </Link>

      <QueryError error={save.error} />

      <button type="button" className="primary t-btn--block" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save property"}
      </button>
    </div>
  );
}
