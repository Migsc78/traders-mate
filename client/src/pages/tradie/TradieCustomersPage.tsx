import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { customersApi } from "../../api/customers";
import { formatGbp } from "../../api/tradie";
import { EmptyState, QueryError, IconChevron, initialsOf } from "./ui";
import { IconSearch, ListToolbar, useListFilter, type ListTab } from "./ListToolbar";

const TABS: readonly ListTab[] = [
  { id: "all", label: "All" },
  { id: "owing", label: "Owing" },
  { id: "properties", label: "Multi-site" },
];

export default function TradieCustomersPage() {
  const customers = useQuery({ queryKey: ["tradie-customers"], queryFn: () => customersApi.list() });
  const { tab, setTab, query, setQuery, searchOpen, toggleSearch } = useListFilter("all");

  const needle = query.trim().toLowerCase();
  const all = customers.data || [];

  const counts: Record<string, number> = {
    all: all.length,
    owing: all.filter((c) => c.outstandingPence > 0).length,
    properties: all.filter((c) => c.propertyCount > 1).length,
  };

  const rows = useMemo(
    () =>
      all
        .filter((c) =>
          tab === "owing" ? c.outstandingPence > 0 : tab === "properties" ? c.propertyCount > 1 : true
        )
        .filter((c) =>
          needle
            ? [c.name, c.phone, c.email, c.postcode, c.town]
                .filter(Boolean)
                .some((f) => String(f).toLowerCase().includes(needle))
            : true
        ),
    [all, tab, needle]
  );

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Customers</h2>
          <p>Your book — people, their properties and their kit</p>
        </div>
        <div className="t-head-actions">
          <button
            type="button"
            className={`t-icon-btn${searchOpen ? " is-active" : ""}`}
            aria-label={searchOpen ? "Close search" : "Search customers"}
            aria-pressed={searchOpen}
            onClick={toggleSearch}
          >
            <IconSearch />
          </button>
          <Link className="t-add-btn" to="/t/customers/new" aria-label="Add customer">
            +
          </Link>
        </div>
      </header>

      <ListToolbar
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        searchOpen={searchOpen}
        placeholder="Search name, postcode or phone"
        counts={counts}
      />

      {customers.isLoading && <p className="muted-text">Loading…</p>}
      <QueryError error={customers.error} />

      <ul className="t-list">
        {rows.map((c) => (
          <li key={c.id}>
            <Link className="t-row" to={`/t/customers/${c.id}`}>
              <span className="t-avatar">{initialsOf(c.name)}</span>
              <div className="t-row-main">
                <div className="t-row-top">
                  <strong>{c.name}</strong>
                  {c.tags.slice(0, 1).map((t) => (
                    <span key={t} className="t-pill t-pill--slate">
                      {t}
                    </span>
                  ))}
                </div>
                <span className="t-row-sub">
                  {[c.postcode, c.phone].filter(Boolean).join(" · ") || "No contact details"}
                </span>
                <span className="t-row-sub">
                  {c.propertyCount} propert{c.propertyCount === 1 ? "y" : "ies"} · {c.jobCount} job
                  {c.jobCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="t-row-side">
                {c.outstandingPence > 0 && (
                  <span className="t-money t-money--alert">{formatGbp(c.outstandingPence)}</span>
                )}
                <IconChevron />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {!customers.isLoading && rows.length === 0 && needle && (
        <p className="muted-text">No customers match &ldquo;{query.trim()}&rdquo;.</p>
      )}

      {!customers.isLoading && all.length === 0 && (
        <>
          <EmptyState
            title="No customers yet"
            hint="Add one, or wait for the first missed-call enquiry."
          />
          <Link className="primary t-btn--block" to="/t/customers/new" style={{ marginTop: 12 }}>
            Add a customer
          </Link>
        </>
      )}
    </div>
  );
}
