import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { customersApi } from "../../../api/customers";
import { formatGbp } from "../../../api/tradie";
import { QueryError, initialsOf } from "../ui";
import { ListToolbar, useListFilter, type ListTab } from "../ListToolbar";
import OverviewTab from "./tabs/OverviewTab";
import ContactsTab from "./tabs/ContactsTab";
import PropertiesTab from "./tabs/PropertiesTab";
import AssetsTab from "./tabs/AssetsTab";
import JobsTab from "./tabs/JobsTab";
import BillingTab from "./tabs/BillingTab";
import FilesTab from "./tabs/FilesTab";
import ActivityTab from "./tabs/ActivityTab";

const TABS: readonly ListTab[] = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "properties", label: "Properties" },
  { id: "assets", label: "Assets" },
  { id: "jobs", label: "Jobs" },
  { id: "billing", label: "Billing" },
  { id: "files", label: "Files" },
  { id: "activity", label: "Activity" },
];

/**
 * The customer record — sheet 1 of the wireframes.
 *
 * Header, actions and balance stay put; the tabs swap underneath. The tab lives
 * in the URL so opening a job from the Jobs tab and coming back doesn't dump the
 * tradie on Overview having lost their place.
 */
export default function CustomerRecordPage() {
  const { customerId = "" } = useParams();
  const { tab, setTab, query, setQuery, searchOpen } = useListFilter("overview");
  const [params, setParams] = useSearchParams();
  const justSaved = params.get("saved") === "1";
  const dismissSaved = () => {
    const next = new URLSearchParams(params);
    next.delete("saved");
    setParams(next, { replace: true });
  };

  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  if (record.isLoading && !record.data) return <p className="muted-text">Loading customer…</p>;

  if (!record.data) {
    return (
      <div>
        <QueryError error={record.error} />
        <p className="muted-text">This customer couldn&apos;t be loaded.</p>
      </div>
    );
  }

  const c = record.data;
  const s = c.summary;
  const primary = c.contacts.find((x) => x.isPrimary) || c.contacts[0] || null;
  const phone = primary?.phone || c.phone || "";
  const firstAccess = c.properties.find((p) => p.access)?.access ?? null;
  const dogOnSite = c.properties.some((p) => p.access?.dogOnSite);
  const keySafe = c.properties.some((p) => p.access?.keySafe);

  const counts: Record<string, number> = {
    contacts: c.contacts.length,
    properties: c.properties.length,
    assets: c.properties.reduce((n, p) => n + p.assets.length, 0),
    jobs: s.openJobs,
    files: c.files.length,
  };

  return (
    <div className="t-customer-record">
      {/* Sheet 2 step 8 — the saved state is this record, with confirmation on top
          rather than a separate screen the tradie has to dismiss to get anywhere. */}
      {justSaved && (
        <p className="t-banner t-banner--ok">
          ✓ Customer record created
          <button type="button" className="t-banner-action" onClick={dismissSaved}>
            Dismiss
          </button>
        </p>
      )}

      <header className="t-crecord-head">
        <span className="t-avatar t-avatar--lg">{initialsOf(c.name)}</span>
        <div className="t-crecord-id">
          <h2>{c.name}</h2>
          <p className="muted-text">{primary ? `${primary.name} · primary contact` : "No contact yet"}</p>
          {phone ? (
            <a className="t-tel" href={`tel:${phone}`}>
              {phone}
            </a>
          ) : null}
          <p className="muted-text t-crecord-where">
            {[c.billingPostcode || c.properties[0]?.postcode, c.properties[0]?.town].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </header>

      {/* Action-first, per the wireframe's own note. */}
      <div className="t-crecord-actions">
        <a className="t-act" href={phone ? `tel:${phone}` : undefined} aria-disabled={!phone}>
          <span aria-hidden="true">📞</span>Call
        </a>
        <a className="t-act" href={phone ? `sms:${phone}` : undefined} aria-disabled={!phone}>
          <span aria-hidden="true">💬</span>SMS
        </a>
        <a
          className="t-act"
          href={phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : undefined}
          target="_blank"
          rel="noreferrer"
        >
          <span aria-hidden="true">🟢</span>WhatsApp
        </a>
        <Link className="t-act t-act--primary" to={`/t/jobs/new?customerId=${c.id}`}>
          <span aria-hidden="true">🧰</span>New job
        </Link>
        <Link className="t-act t-act--primary" to="/t/quotes/new">
          <span aria-hidden="true">📄</span>New quote
        </Link>
      </div>

      <section className="t-balance">
        <div className="t-balance-top">
          <span className="muted-text">Balance summary</span>
          <span className="t-balance-total">
            <span className="muted-text">Total outstanding</span>
            <strong className="t-money">{formatGbp(s.outstandingPence)}</strong>
          </span>
        </div>
        <div className="t-flag-row">
          {dogOnSite && <span className="t-flag">🐕 Dog on site</span>}
          {keySafe && <span className="t-flag">🔑 Key safe</span>}
          {firstAccess?.asbestosKnown && <span className="t-flag t-flag--warn">⚠ Asbestos</span>}
          {s.overdueCount > 0 && (
            <span className="t-flag t-flag--alert">
              💷 {formatGbp(s.outstandingPence)} overdue
            </span>
          )}
          {!dogOnSite && !keySafe && s.overdueCount === 0 && (
            <span className="muted-text" style={{ fontSize: 13 }}>
              Nothing flagged
            </span>
          )}
        </div>
      </section>

      <ListToolbar
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        searchOpen={searchOpen}
        placeholder="Search this customer"
        counts={counts}
      />

      {tab === "overview" && <OverviewTab record={c} />}
      {tab === "contacts" && <ContactsTab record={c} />}
      {tab === "properties" && <PropertiesTab record={c} />}
      {tab === "assets" && <AssetsTab record={c} />}
      {tab === "jobs" && <JobsTab customerId={c.id} />}
      {tab === "billing" && <BillingTab customerId={c.id} />}
      {tab === "files" && <FilesTab record={c} />}
      {tab === "activity" && <ActivityTab customerId={c.id} />}
    </div>
  );
}
