import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { IconPhone, QueryError } from "../ui";
import { AccessCode } from "../customer/AccessCode";
import { briefingApi } from "./briefing";

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="t-access-label">
        {icon} {label}
      </span>
      <span className="t-access-value">{children}</span>
    </li>
  );
}

function YesNo({ on }: { on: boolean }) {
  return <span className={`t-yesno${on ? " is-yes" : ""}`}>{on ? "Yes" : "No"}</span>;
}

/**
 * Before you arrive.
 *
 * Everything here already exists on the property record — this screen's job is
 * to put it in front of the tradie at the one moment it matters, without them
 * having to remember which customer owns which site. The access code is still
 * masked and still audited: standing outside the door is exactly when it should
 * be revealed deliberately rather than have been on screen since breakfast.
 */
export default function ArrivalBriefingPage() {
  const { enquiryId = "" } = useParams();

  const briefing = useQuery({
    queryKey: ["tradie-job-briefing", enquiryId],
    queryFn: () => briefingApi.get(enquiryId),
    enabled: !!enquiryId,
  });

  if (briefing.isLoading && !briefing.data) return <p className="muted-text">Loading…</p>;
  if (!briefing.data) {
    return (
      <div>
        <QueryError error={briefing.error} />
        <p className="muted-text">This briefing couldn&apos;t be loaded.</p>
      </div>
    );
  }

  const b = briefing.data;
  const a = b.access;
  const address = [b.property?.addressLine1, b.property?.town, b.property?.postcode]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <header className="t-page-head">
        <h2>Before you arrive</h2>
        <p>{b.property?.nickname || address || b.title}</p>
      </header>

      {!a && (
        <p className="muted-text">
          No access details recorded for this property yet. Anything added on the property record shows
          up here.
        </p>
      )}

      {a && (
        <>
          {(a.dogOnSite || a.asbestosKnown || a.safetyFlags.length > 0) && (
            <div className="t-warn-row" style={{ marginBottom: 14 }}>
              {a.dogOnSite && <span className="t-warn t-warn--alert">🐕 Dog on site</span>}
              {a.asbestosKnown && <span className="t-warn t-warn--alert">⚠ Asbestos known</span>}
              {a.safetyFlags.map((f) => (
                <span key={f} className="t-warn t-warn--alert">
                  ⚠ {f}
                </span>
              ))}
            </div>
          )}

          <ul className="t-access-list">
            <Row icon="🚪" label="Getting in">
              {a.accessMethod || "Not recorded"}
            </Row>
            <Row icon="🔑" label="Key safe">
              <YesNo on={a.keySafe} />
            </Row>
            {a.keySafe && (
              <Row icon="📍" label="Key safe location">
                {a.keySafeLocation || "—"}
              </Row>
            )}
            <Row icon="🔢" label="Access code">
              <AccessCode propertyId={b.property?.id || ""} hasCode={a.hasAccessCode} jobId={b.jobId} />
            </Row>
            <Row icon="🔔" label="Alarm">
              <YesNo on={a.alarm} />
            </Row>
            <Row icon="🅿" label="Parking">
              {a.parking || "—"}
            </Row>
            <Row icon="🎫" label="Permit required">
              <YesNo on={a.permitRequired} />
            </Row>
            <Row icon="📞" label="Call before arrival">
              <YesNo on={a.callBeforeArrival} />
            </Row>
            <Row icon="⏰" label="Working hours">
              {a.workingHoursFrom && a.workingHoursTo
                ? `${a.workingHoursFrom} – ${a.workingHoursTo}`
                : "—"}
            </Row>
          </ul>

          {a.engineerNotes && (
            <section className="t-card t-note-card">
              <strong>Notes for engineer</strong>
              <p className="t-note-body">{a.engineerNotes}</p>
              <span className="t-mini-pill">Internal</span>
            </section>
          )}
        </>
      )}

      {b.assets.length > 0 && (
        <>
          <p className="t-section-label">Kit on site</p>
          <ul className="t-access-list">
            {b.assets.map((asset) => (
              <li key={asset.id}>
                <span className="t-access-label">🔧 {asset.name || asset.model || asset.kind}</span>
                <span className="t-access-value">{asset.location || "Location not recorded"}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(b.siteContact || b.phone) && (
        <>
          <p className="t-section-label">Who to speak to</p>
          <div className="t-card">
            <dl className="t-kv">
              {b.siteContact && (
                <div>
                  <dt>Site contact</dt>
                  <dd>{b.siteContact.name}</dd>
                </div>
              )}
              {b.phone && (
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a className="t-tel" href={`tel:${b.phone}`}>
                      <IconPhone /> {b.phone}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </>
      )}

      {b.property && (
        <Link className="t-btn t-btn--block" to={`/t/properties/${b.property.id}`}>
          Open property record
        </Link>
      )}
    </div>
  );
}
