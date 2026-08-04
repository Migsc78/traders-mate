import { Link } from "react-router-dom";
import { occupancyLabel, type CustomerRecord, type PropertyDto } from "../../../../api/customers";
import { IconChevron } from "../../ui";
import { addressOf } from "../format";

/** The chips the wireframe shows under each address — occupancy, parking, access. */
function chipsFor(p: PropertyDto): string[] {
  const chips: string[] = [];
  if (p.occupancy) chips.push(occupancyLabel(p.occupancy));
  const a = p.access;
  if (a) {
    if (a.parking) chips.push(a.parking);
    if (a.permitRequired && !a.parking?.toLowerCase().includes("permit")) chips.push("Permit required");
    if (a.keySafe) chips.push("Key safe");
    for (const f of a.safetyFlags) chips.push(f);
    if (a.dogOnSite) chips.push("Dog on site");
  }
  return chips;
}

/**
 * Screen 3 — a customer can have several properties, each with its own counts.
 *
 * A landlord with four flats is one customer and four of these; the counts are
 * what stops the tradie opening the wrong one.
 */
export default function PropertiesTab({ record }: { record: CustomerRecord }) {
  return (
    <div>
      <ul className="t-list">
        {record.properties.map((p) => (
          <li key={p.id}>
            <Link className="t-card t-property-card" to={`/t/properties/${p.id}`}>
              <div className="t-property-head">
                <span className="t-property-icon" aria-hidden="true">
                  🏠
                </span>
                <div className="t-property-id">
                  <strong>{p.nickname || "Property"}</strong>
                  <span className="t-row-sub">{addressOf(p) || "No address yet"}</span>
                </div>
                <IconChevron />
              </div>

              {chipsFor(p).length > 0 && (
                <div className="t-flag-row">
                  {chipsFor(p).map((c) => (
                    <span key={c} className="t-mini-pill">
                      {c}
                    </span>
                  ))}
                </div>
              )}

              <div className="t-property-counts">
                <span>
                  Assets <strong>{p.assets.length}</strong>
                </span>
                <span>
                  Open jobs <strong>{p.openJobCount}</strong>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {record.properties.length === 0 && (
        <p className="muted-text">No properties yet — add the address you actually work at.</p>
      )}

      <Link className="primary t-btn--block" to={`/t/customers/${record.id}/properties/new`}>
        + Add property
      </Link>
    </div>
  );
}
