import { Link } from "react-router-dom";
import type { CustomerRecord } from "../../../../api/customers";
import { IconChevron } from "../../ui";
import { dueTone, fmtDate, fmtShort, relative } from "../format";

/**
 * Screen 5 — the asset register, grouped by property.
 *
 * Next-due is the column that earns money, so it's the one that gets a colour:
 * overdue in red, due within a month in amber. That's the difference between a
 * list of boilers and a list of jobs waiting to be booked.
 */
export default function AssetsTab({ record }: { record: CustomerRecord }) {
  const withAssets = record.properties.filter((p) => p.assets.length > 0);

  return (
    <div>
      {withAssets.map((p) => (
        <section key={p.id} className="t-asset-group">
          <h3 className="t-section-label">{p.nickname || p.postcode || "Property"}</h3>
          <ul className="t-list">
            {p.assets.map((a) => {
              const tone = dueTone(a.nextDueAt);
              return (
                <li key={a.id}>
                  <Link className="t-card t-asset-card" to={`/t/properties/${p.id}/assets/${a.id}/edit`}>
                    <div className="t-asset-top">
                      <div className="t-asset-id">
                        <span className="t-mini-pill">{a.kind}</span>
                        <strong>{a.name || a.model || a.kind}</strong>
                        {a.manufacturer && <span className="t-row-sub">{a.manufacturer}</span>}
                        {a.serial && <span className="t-row-sub">S/N {a.serial}</span>}
                      </div>
                      <div className="t-asset-when">
                        <span className="muted-text">Installed</span>
                        <span>{fmtShort(a.installDate)}</span>
                      </div>
                      <IconChevron />
                    </div>
                    <div className="t-asset-dates">
                      <span>
                        <span className="muted-text">Last service</span> {fmtDate(a.lastServiceAt)}
                      </span>
                      <span className={tone ? `t-due t-due--${tone}` : undefined}>
                        <span className="muted-text">Next due</span> {fmtDate(a.nextDueAt)}
                        {a.nextDueAt ? ` · ${relative(a.nextDueAt)}` : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link className="linkish t-rate-add" to={`/t/properties/${p.id}/assets/new`}>
            + Add asset to {p.nickname || "this property"}
          </Link>
        </section>
      ))}

      {withAssets.length === 0 && (
        <p className="muted-text">
          No kit recorded yet. Adding a boiler with a service date books next year&apos;s work.
        </p>
      )}

      {record.properties.length > 0 && (
        <Link className="primary t-btn--block" to={`/t/properties/${record.properties[0].id}/assets/new`}>
          + Add asset
        </Link>
      )}
    </div>
  );
}
