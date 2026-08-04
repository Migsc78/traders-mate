import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCustomer } from "../../../../lib/newCustomer";
import type { ContactChannel } from "../../../../api/customers";
import { QueryError } from "../../ui";
import { ChipPicker, Field } from "../forms";

const CHANNELS = [
  { id: "CALL" as ContactChannel, label: "Call" },
  { id: "SMS" as ContactChannel, label: "SMS" },
  { id: "EMAIL" as ContactChannel, label: "Email" },
  { id: "WHATSAPP" as ContactChannel, label: "WhatsApp" },
];

/**
 * Sheet 2 step 1 — "capture the minimum essentials fast".
 *
 * Name is the only thing that's actually required. Everything else on this
 * screen, and every later step, can be filled in when the tradie has a minute —
 * which is the whole point of progressive disclosure. A form that demands a
 * billing address before it will save a name is a form nobody finishes.
 */
export default function AddCustomerPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [type, setType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("CALL");
  const [postcode, setPostcode] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createCustomer(qc, {
        type,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        preferredChannel: channel,
        billingPostcode: postcode.trim() || null,
        notes: contactName.trim() && contactName.trim() !== name.trim() ? `Primary contact: ${contactName.trim()}` : null,
      }),
  });

  const ready = name.trim().length >= 2;

  const go = (next: "property" | "done") =>
    create.mutate(undefined, {
      onSuccess: (id) => {
        void qc.invalidateQueries({ queryKey: ["tradie-customers"] });
        navigate(next === "property" ? `/t/customers/${id}/properties/new?flow=1` : `/t/customers/${id}`, {
          replace: true,
        });
      },
    });

  return (
    <div className="t-customer-form">
      <ChipPicker
        label="Customer type"
        options={[
          { id: "INDIVIDUAL", label: "Individual" },
          { id: "COMPANY", label: "Company" },
        ]}
        value={type}
        onChange={(v) => v && setType(v)}
      />

      <Field label="Customer / company name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mr John Smith or ABC Heating Ltd"
          autoFocus
        />
      </Field>

      <Field label="Primary contact name">
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="e.g. John Smith"
        />
      </Field>

      <Field label="Mobile">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="07…"
          inputMode="tel"
          autoComplete="tel"
        />
      </Field>

      <Field label="Email">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. john@email.com"
          inputMode="email"
          autoComplete="email"
        />
      </Field>

      <ChipPicker label="Preferred contact method" options={CHANNELS} value={channel} onChange={(v) => v && setChannel(v)} />

      <Field label="Billing postcode">
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value.toUpperCase())}
          placeholder="Postcode lookup"
          autoCapitalize="characters"
        />
      </Field>

      <QueryError error={create.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={!ready || create.isPending}
        onClick={() => go("property")}
      >
        {create.isPending ? "Saving…" : "Save & add property"}
      </button>
      <button
        type="button"
        className="t-btn t-btn--block"
        style={{ marginTop: 8 }}
        disabled={!ready || create.isPending}
        onClick={() => go("done")}
      >
        Save customer only
      </button>
    </div>
  );
}
