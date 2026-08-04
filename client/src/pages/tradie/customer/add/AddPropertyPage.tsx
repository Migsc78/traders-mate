import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, type Occupancy } from "../../../../api/customers";
import { createProperty } from "../../../../lib/newCustomer";
import { QueryError } from "../../ui";
import { Field, OccupancyPicker, PROPERTY_TYPES } from "../forms";

/** Sheet 2 step 3 — the property, linked to a site contact and a billing customer. */
export default function AddPropertyPage() {
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

  const [nickname, setNickname] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [town, setTown] = useState("");
  const [postcode, setPostcode] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [occupancy, setOccupancy] = useState<Occupancy | null>("OWNER_OCCUPIED");
  const [siteContactId, setSiteContactId] = useState("");

  const save = useMutation({
    mutationFn: () =>
      createProperty(qc, customerId, {
        nickname: nickname.trim() || null,
        addressLine1: line1.trim() || null,
        addressLine2: line2.trim() || null,
        town: town.trim() || null,
        postcode: postcode.trim() || null,
        propertyType: propertyType || null,
        occupancy,
        siteContactId: siteContactId || null,
      }),
    onSuccess: (propertyId) => {
      // In the add flow the next step is access & safety; on its own it's a
      // one-off addition, so the property page is where they want to land.
      navigate(inFlow ? `/t/properties/${propertyId}/access?flow=1` : `/t/properties/${propertyId}`, {
        replace: true,
      });
    },
  });

  const contacts = record.data?.contacts || [];
  const ready = postcode.trim().length >= 3 || line1.trim().length >= 3;

  return (
    <div className="t-customer-form">
      <Field label="Property nickname">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. Main Home"
          autoFocus
        />
      </Field>

      <Field label="Postcode">
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value.toUpperCase())}
          placeholder="Postcode lookup"
          autoCapitalize="characters"
        />
      </Field>

      <Field label="Address line 1">
        <input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="e.g. 1 Acacia Close" />
      </Field>

      <Field label="Address line 2">
        <input value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Optional" />
      </Field>

      <Field label="Town">
        <input value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g. Guildford" />
      </Field>

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
          <option value="">Select a contact</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={!ready || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : inFlow ? "Next: Access & safety" : "Save property"}
      </button>
    </div>
  );
}
