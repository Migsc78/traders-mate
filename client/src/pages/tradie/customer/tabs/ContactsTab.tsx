import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { roleLabel, type CustomerRecord } from "../../../../api/customers";
import { saveContact } from "../../../../lib/newCustomer";
import { QueryError, initialsOf } from "../../ui";

/**
 * Screen 2 — multiple contacts with roles, a primary, and one-tap comms.
 *
 * The point of the roles is that the person who lets you in is rarely the person
 * who pays: the buttons here dial whoever the row belongs to, not the customer.
 */
export default function ContactsTab({ record }: { record: CustomerRecord }) {
  const qc = useQueryClient();

  const makePrimary = useMutation({
    mutationFn: (contactId: string) => saveContact(qc, record.id, contactId, { isPrimary: true }),
  });

  return (
    <div>
      <QueryError error={makePrimary.error} />

      <ul className="t-list">
        {record.contacts.map((c) => (
          <li key={c.id}>
            <article className={`t-contact-row${c.isPrimary ? " is-primary" : ""}`}>
              <span className="t-avatar">{initialsOf(c.name)}</span>
              <div className="t-contact-body">
                <div className="t-row-top">
                  <strong>{c.name}</strong>
                  <span className="t-pill t-pill--slate">{roleLabel(c.role)}</span>
                </div>
                {c.phone && <span className="t-row-sub">{c.phone}</span>}
                {c.email && <span className="t-row-sub">{c.email}</span>}
                <div className="t-contact-gets">
                  {c.receivesQuotes && <span className="t-mini-pill">Quotes</span>}
                  {c.receivesInvoices && <span className="t-mini-pill">Invoices</span>}
                  {c.receivesAppointments && <span className="t-mini-pill">Appointments</span>}
                </div>
              </div>
              <div className="t-contact-side">
                <button
                  type="button"
                  className={`t-primary-dot${c.isPrimary ? " is-on" : ""}`}
                  aria-label={c.isPrimary ? `${c.name} is the primary contact` : `Make ${c.name} primary`}
                  aria-pressed={c.isPrimary}
                  disabled={c.isPrimary || makePrimary.isPending}
                  onClick={() => makePrimary.mutate(c.id)}
                />
                <div className="t-contact-comms">
                  <a className="t-comm" href={c.phone ? `tel:${c.phone}` : undefined} aria-label={`Call ${c.name}`}>
                    📞
                  </a>
                  <a className="t-comm" href={c.phone ? `sms:${c.phone}` : undefined} aria-label={`Text ${c.name}`}>
                    💬
                  </a>
                  <a
                    className="t-comm"
                    href={c.phone ? `https://wa.me/${c.phone.replace(/\D/g, "")}` : undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`WhatsApp ${c.name}`}
                  >
                    🟢
                  </a>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {record.contacts.length === 0 && (
        <p className="muted-text">No contacts yet — add the person who lets you in.</p>
      )}

      <Link className="primary t-btn--block" to={`/t/customers/${record.id}/contacts/new`}>
        + Add contact
      </Link>
      <Link className="t-btn t-btn--block" to={`/t/customers/${record.id}/contacts`} style={{ marginTop: 8 }}>
        Edit contacts
      </Link>
    </div>
  );
}
