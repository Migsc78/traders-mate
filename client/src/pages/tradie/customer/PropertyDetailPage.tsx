import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { customersApi, occupancyLabel, roleLabel } from "../../../api/customers";
import { IconChevron, QueryError } from "../ui";
import { ListToolbar, useListFilter, type ListTab } from "../ListToolbar";
import { addressOf, dueTone, fmtDate, fmtShort, relative } from "./format";
import { AccessCode } from "./AccessCode";

const TABS: readonly ListTab[] = [
  { id: "details", label: "Details" },
  { id: "access", label: "Access & Safety" },
  { id: "assets", label: "Assets" },
  { id: "jobs", label: "Jobs" },
  { id: "files", label: "Files" },
];

function YesNo({ on }: { on: boolean }) {
  return <span className={`t-yesno${on ? " is-yes" : ""}`}>{on ? "Yes" : "No"}</span>;
}

/** Sheet 1 screen 4 — the property, and the access data that keeps engineers safe. */
export default function PropertyDetailPage() {
  const { propertyId = "" } = useParams();
  const { tab, setTab, query, setQuery, searchOpen } = useListFilter("details");

  const property = useQuery({
    queryKey: ["tradie-property", propertyId],
    queryFn: () => customersApi.property(propertyId),
    enabled: !!propertyId,
  });

  if (property.isLoading && !property.data) return <p className="muted-text">Loading property…</p>;
  if (!property.data) {
    return (
      <div>
        <QueryError error={property.error} />
        <p className="muted-text">This property couldn&apos;t be loaded.</p>
      </div>
    );
  }

  const p = property.data;
  const a = p.access;

  return (
    <div>
      <header className="t-page-head">
        <h2>{p.nickname || "Property"}</h2>
        <p>{addressOf(p) || "No address recorded"}</p>
      </header>

      <ListToolbar
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        searchOpen={searchOpen}
        placeholder="Search this property"
        counts={{ assets: p.assets.length, jobs: p.openJobCount, files: p.files.length }}
      />

      {tab === "details" && (
        <section className="t-card">
          <dl className="t-kv">
            <div>
              <dt>Customer</dt>
              <dd>
                <Link className="linkish" to={`/t/customers/${p.customer.id}`}>
                  {p.customer.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{p.propertyType || "—"}</dd>
            </div>
            <div>
              <dt>Occupancy</dt>
              <dd>{occupancyLabel(p.occupancy)}</dd>
            </div>
            <div>
              <dt>Site contact</dt>
              <dd>
                {p.siteContact ? `${p.siteContact.name} (${roleLabel(p.siteContact.role)})` : "—"}
              </dd>
            </div>
            <div>
              <dt>Postcode</dt>
              <dd>{p.postcode || "—"}</dd>
            </div>
          </dl>
          <Link className="t-btn t-btn--block" to={`/t/properties/${p.id}/edit`} style={{ marginTop: 12 }}>
            Edit property
          </Link>
        </section>
      )}

      {tab === "access" && (
        <section>
          <ul className="t-access-list">
            <li>
              <span className="t-access-label">🔑 Key safe</span>
              <YesNo on={!!a?.keySafe} />
            </li>
            {a?.keySafe && (
              <li>
                <span className="t-access-label">📍 Key safe location</span>
                <span className="t-access-value">{a.keySafeLocation || "—"}</span>
              </li>
            )}
            <li>
              <span className="t-access-label">🔢 Access code</span>
              <AccessCode propertyId={p.id} hasCode={!!a?.hasAccessCode} />
            </li>
            <li>
              <span className="t-access-label">🔔 Alarm</span>
              <YesNo on={!!a?.alarm} />
            </li>
            <li>
              <span className="t-access-label">🅿 Parking</span>
              <span className="t-access-value">{a?.parking || "—"}</span>
            </li>
            <li>
              <span className="t-access-label">🎫 Permit required</span>
              <YesNo on={!!a?.permitRequired} />
            </li>
            <li>
              <span className="t-access-label">🐕 Dog on site</span>
              <YesNo on={!!a?.dogOnSite} />
            </li>
            <li>
              <span className="t-access-label">⏰ Working hours</span>
              <span className="t-access-value">
                {a?.workingHoursFrom && a?.workingHoursTo ? `${a.workingHoursFrom} – ${a.workingHoursTo}` : "—"}
              </span>
            </li>
            <li>
              <span className="t-access-label">📞 Call before arrival</span>
              <YesNo on={!!a?.callBeforeArrival} />
            </li>
            <li>
              <span className="t-access-label">⚠ Asbestos known</span>
              <YesNo on={!!a?.asbestosKnown} />
            </li>
          </ul>

          {(a?.safetyFlags.length ?? 0) > 0 && (
            <div className="t-flag-row" style={{ marginBottom: 14 }}>
              {a!.safetyFlags.map((f) => (
                <span key={f} className="t-flag t-flag--warn">
                  ⚠ {f}
                </span>
              ))}
            </div>
          )}

          <section className="t-card t-note-card">
            <strong>Notes for engineer</strong>
            <p className="t-note-body">{a?.engineerNotes || "Nothing recorded."}</p>
            <span className="t-mini-pill">Internal</span>
          </section>

          <Link className="primary t-btn--block" to={`/t/properties/${p.id}/access`}>
            Edit access &amp; safety
          </Link>
        </section>
      )}

      {tab === "assets" && (
        <div>
          <ul className="t-list">
            {p.assets.map((asset) => {
              const tone = dueTone(asset.nextDueAt);
              return (
                <li key={asset.id}>
                  <Link className="t-card t-asset-card" to={`/t/properties/${p.id}/assets/${asset.id}/edit`}>
                    <div className="t-asset-top">
                      <div className="t-asset-id">
                        <span className="t-mini-pill">{asset.kind}</span>
                        <strong>{asset.name || asset.model || asset.kind}</strong>
                        {asset.serial && <span className="t-row-sub">S/N {asset.serial}</span>}
                      </div>
                      <div className="t-asset-when">
                        <span className="muted-text">Installed</span>
                        <span>{fmtShort(asset.installDate)}</span>
                      </div>
                      <IconChevron />
                    </div>
                    <div className="t-asset-dates">
                      <span>
                        <span className="muted-text">Last service</span> {fmtDate(asset.lastServiceAt)}
                      </span>
                      <span className={tone ? `t-due t-due--${tone}` : undefined}>
                        <span className="muted-text">Next due</span> {fmtDate(asset.nextDueAt)}
                        {asset.nextDueAt ? ` · ${relative(asset.nextDueAt)}` : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {p.assets.length === 0 && <p className="muted-text">No kit recorded at this property yet.</p>}
          <Link className="primary t-btn--block" to={`/t/properties/${p.id}/assets/new`}>
            + Add asset
          </Link>
        </div>
      )}

      {tab === "jobs" && (
        <div>
          <p className="muted-text">
            {p.openJobCount} job{p.openJobCount === 1 ? "" : "s"} at this property.
          </p>
          <Link className="t-btn t-btn--block" to={`/t/customers/${p.customer.id}?tab=jobs`}>
            See all jobs for {p.customer.name}
          </Link>
        </div>
      )}

      {tab === "files" && (
        <div>
          <ul className="t-list">
            {p.files.map((f) => (
              <li key={f.id}>
                <a className="t-file-row" href={f.url} target="_blank" rel="noreferrer">
                  <div className="t-file-main">
                    <strong>{f.filename}</strong>
                    <span className="muted-text">{fmtDate(f.createdAt)}</span>
                  </div>
                  <span className={`t-mini-pill${f.visibility === "CUSTOMER" ? " is-shared" : ""}`}>
                    {f.visibility === "CUSTOMER" ? "Customer" : "Internal"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {p.files.length === 0 && <p className="muted-text">No files filed against this property.</p>}
          <Link className="primary t-btn--block" to={`/t/customers/${p.customer.id}/files/new?propertyId=${p.id}`}>
            + Upload file
          </Link>
        </div>
      )}
    </div>
  );
}
