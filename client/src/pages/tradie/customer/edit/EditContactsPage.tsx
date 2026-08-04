import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, roleLabel, type ContactDto } from "../../../../api/customers";
import { deleteContact, saveContact } from "../../../../lib/newCustomer";
import { QueryError, initialsOf } from "../../ui";
import { RolePicker, Toggle } from "../forms";

/**
 * Sheet 3 screen 2 — set primary, change roles, and control what each contact gets.
 *
 * Rows open in place rather than pushing another screen: changing who receives
 * invoices is a two-second job and shouldn't cost two navigations.
 */
export default function EditContactsPage() {
  const { customerId = "" } = useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);

  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  const patch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ContactDto> }) =>
      saveContact(qc, customerId, id, data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteContact(qc, customerId, id),
    onSuccess: () => setOpen(null),
  });

  const contacts = record.data?.contacts || [];

  return (
    <div>
      <QueryError error={patch.error || remove.error} />

      <ul className="t-list">
        {contacts.map((c) => {
          const isOpen = open === c.id;
          return (
            <li key={c.id}>
              <div className="t-rate-item">
                <button
                  type="button"
                  className="t-rate-item-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : c.id)}
                >
                  <span className="t-avatar">{initialsOf(c.name)}</span>
                  <span className="t-rate-item-main">
                    <strong>{c.name}</strong>
                    <span className="muted-text">
                      {roleLabel(c.role)}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </span>
                  </span>
                  <span className="t-rate-item-side">
                    {c.isPrimary && <span className="t-pill t-pill--orange">Primary</span>}
                  </span>
                </button>

                {isOpen && (
                  <div className="t-rate-item-edit">
                    <RolePicker value={c.role} onChange={(role) => patch.mutate({ id: c.id, data: { role } })} />

                    <Toggle
                      label="Primary contact"
                      hint="The person we deal with by default"
                      checked={c.isPrimary}
                      onChange={(v) => v && patch.mutate({ id: c.id, data: { isPrimary: true } })}
                    />
                    <Toggle
                      label="Receives quotes"
                      checked={c.receivesQuotes}
                      onChange={(receivesQuotes) => patch.mutate({ id: c.id, data: { receivesQuotes } })}
                    />
                    <Toggle
                      label="Receives invoices"
                      checked={c.receivesInvoices}
                      onChange={(receivesInvoices) => patch.mutate({ id: c.id, data: { receivesInvoices } })}
                    />
                    <Toggle
                      label="Receives appointments"
                      checked={c.receivesAppointments}
                      onChange={(receivesAppointments) =>
                        patch.mutate({ id: c.id, data: { receivesAppointments } })
                      }
                    />

                    <button
                      type="button"
                      className="linkish"
                      disabled={remove.isPending || contacts.length === 1}
                      onClick={() => {
                        if (confirm(`Remove ${c.name} from this customer?`)) remove.mutate(c.id);
                      }}
                    >
                      {contacts.length === 1 ? "Can't remove the only contact" : "Remove contact"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Link className="primary t-btn--block" to={`/t/customers/${customerId}/contacts/new`}>
        + Add contact
      </Link>
    </div>
  );
}
