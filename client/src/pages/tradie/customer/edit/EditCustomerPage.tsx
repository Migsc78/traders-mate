import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, type ContactChannel } from "../../../../api/customers";
import { saveCustomer } from "../../../../lib/newCustomer";
import { QueryError } from "../../ui";
import { ChipPicker, Field, MultiChips } from "../forms";

const CHANNELS = [
  { id: "CALL" as ContactChannel, label: "Call" },
  { id: "SMS" as ContactChannel, label: "SMS" },
  { id: "EMAIL" as ContactChannel, label: "Email" },
  { id: "WHATSAPP" as ContactChannel, label: "WhatsApp" },
];

const TAG_OPTIONS = ["Preferred", "Long term", "Trade", "Landlord", "Commercial", "Slow payer", "Cash only"];

const TERMS = ["On completion", "7 days from invoice", "14 days from invoice", "30 days from invoice"];

/** Sheet 3 screen 1 — the master record, structured and not cluttered. */
export default function EditCustomerPage() {
  const { customerId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  const [name, setName] = useState("");
  const [type, setType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingPostcode, setBillingPostcode] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("CALL");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const c = record.data;
    if (!c) return;
    setName(c.name);
    setType(c.type);
    setPhone(c.phone || "");
    setEmail(c.email || "");
    setBillingAddress(c.billingAddress || "");
    setBillingPostcode(c.billingPostcode || "");
    setTags(c.tags);
    setPaymentTerms(c.paymentTerms || "");
    setChannel(c.preferredChannel);
    setNotes(c.notes || "");
  }, [record.data]);

  const save = useMutation({
    mutationFn: () =>
      saveCustomer(qc, customerId, {
        name: name.trim(),
        type,
        phone: phone.trim() || null,
        email: email.trim() || null,
        billingAddress: billingAddress.trim() || null,
        billingPostcode: billingPostcode.trim() || null,
        tags,
        paymentTerms: paymentTerms || null,
        preferredChannel: channel,
        notes: notes.trim() || null,
      }),
    onSuccess: () => navigate(`/t/customers/${customerId}`, { replace: true }),
  });

  if (record.isLoading && !record.data) return <p className="muted-text">Loading…</p>;

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
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Phone">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </Field>

      <Field label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
      </Field>

      <Field label="Billing address">
        <input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
      </Field>

      <Field label="Billing postcode">
        <input
          value={billingPostcode}
          onChange={(e) => setBillingPostcode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
        />
      </Field>

      <MultiChips label="Tags" options={TAG_OPTIONS} values={tags} onChange={setTags} />

      <Field label="Payment terms">
        <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
          <option value="">Not set</option>
          {TERMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <ChipPicker
        label="Preferred contact method"
        options={CHANNELS}
        value={channel}
        onChange={(v) => v && setChannel(v)}
      />

      <Field label="Notes">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={name.trim().length < 2 || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save customer"}
      </button>
    </div>
  );
}
