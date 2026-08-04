import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContact } from "../../../../lib/newCustomer";
import type { ContactRole } from "../../../../api/customers";
import { QueryError } from "../../ui";
import { Field, RolePicker, Toggle } from "../forms";

/**
 * Sheet 2 step 2 — a contact and what they should actually receive.
 *
 * The three toggles are the reason contacts exist as records: an accounts contact
 * wants the invoice and nothing else, and a tenant needs the appointment but has
 * no business seeing what the landlord is being charged.
 */
export default function AddContactPage() {
  const { customerId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [role, setRole] = useState<ContactRole>("OWNER");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [quotes, setQuotes] = useState(true);
  const [invoices, setInvoices] = useState(true);
  const [appointments, setAppointments] = useState(true);
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () =>
      createContact(qc, customerId, {
        name: name.trim(),
        role,
        phone: phone.trim() || null,
        email: email.trim() || null,
        receivesQuotes: quotes,
        receivesInvoices: invoices,
        receivesAppointments: appointments,
        notes: notes.trim() || null,
      }),
    onSuccess: () => navigate(`/t/customers/${customerId}?tab=contacts`, { replace: true }),
  });

  return (
    <div className="t-customer-form">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Smith" autoFocus />
      </Field>

      <RolePicker value={role} onChange={setRole} />

      <Field label="Mobile">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" inputMode="tel" />
      </Field>

      <Field label="Email">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. jane@email.com"
          inputMode="email"
        />
      </Field>

      <p className="t-field-label">What should this contact receive?</p>
      <Toggle label="Quotes" checked={quotes} onChange={setQuotes} />
      <Toggle label="Invoices" checked={invoices} onChange={setInvoices} />
      <Toggle label="Appointments" checked={appointments} onChange={setAppointments} />

      <Field label="Notes">
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Prefers email for invoices."
        />
      </Field>

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={name.trim().length < 2 || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save contact"}
      </button>
    </div>
  );
}
