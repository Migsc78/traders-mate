import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi, type CustomerProfile } from "../../api/tradie";
import { EmptyState, IconChevron, IconPhone, StatusPill, initialsOf } from "./ui";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TradieCustomerPage() {
  const { phoneKey = "" } = useParams();
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["tradie-customer", phoneKey],
    queryFn: () => tradieApi.customer(phoneKey),
    enabled: !!phoneKey,
  });

  const [notes, setNotes] = useState("");
  const [plantNotes, setPlantNotes] = useState("");
  const [savedFlash, setSavedFlash] = useState("");

  useEffect(() => {
    if (!profile.data) return;
    setNotes(profile.data.notes || "");
    setPlantNotes(profile.data.plantNotes || "");
  }, [profile.data]);

  const saveNotes = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: `Customer notes · ${profile.data?.name || phoneKey}`,
        path: `/customers/${encodeURIComponent(phoneKey)}`,
        method: "PATCH",
        body: { notes, plantNotes },
        invalidates: ["tradie-customer", "tradie-customers"],
      }),
    onSuccess: (r) => {
      setSavedFlash(r.queued ? "Saved — will sync" : "Notes saved");
      void qc.invalidateQueries({ queryKey: ["tradie-customer", phoneKey] });
      window.setTimeout(() => setSavedFlash(""), 2000);
    },
  });

  if (profile.isLoading) {
    return (
      <div>
        <p className="muted-text">Loading customer…</p>
      </div>
    );
  }

  // A stale cached profile still has the address and phone number, which is what
  // the tradie is standing outside the house trying to read.
  if (!profile.data) {
    return (
      <div>
        <p className="error">{(profile.error as Error)?.message || "Customer not found"}</p>
      </div>
    );
  }

  const c: CustomerProfile = profile.data;
  const latestJobId = c.jobs[0]?.id;

  return (
    <div>
      <div className="t-card t-contact-card">
        <div className="t-contact-head">
          <span className="t-avatar t-avatar--lg">{initialsOf(c.name)}</span>
          <div>
            <h1>{c.name}</h1>
            <p className="t-contact-meta">
              <a className="t-tel" href={`tel:${c.phone}`}>
                <IconPhone /> {c.phone}
              </a>
              {c.postcode ? <span>· {c.postcode}</span> : null}
              <span>
                · {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>
        <div className="t-customer-stats">
          <div>
            <span className="muted-text">Paid</span>
            <strong>{formatGbp(c.totals.paidPence)}</strong>
          </div>
          <div>
            <span className="muted-text">Open invoices</span>
            <strong>{formatGbp(c.totals.openPence)}</strong>
          </div>
        </div>
        <div className="tradie-actions t-customer-actions" style={{ marginTop: 14 }}>
          <Link className="primary t-btn--block" to={`/t/jobs/new?phoneKey=${encodeURIComponent(phoneKey)}`}>
            New job
          </Link>
          {latestJobId ? (
            <Link
              className="t-btn t-btn--block"
              to={`/t/jobs/${latestJobId}`}
              state={{ from: `/t/customers/${encodeURIComponent(phoneKey)}`, fromLabel: "Customer" }}
            >
              Open latest job
            </Link>
          ) : null}
        </div>
      </div>

      <section className="t-customer-section">
        <h3 className="t-section-label">Notes</h3>
        <div className="t-card">
          <label>
            Work notes
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Access codes, preferences, what you told them last time…"
            />
          </label>
          <label style={{ marginTop: 12 }}>
            Plant / kit on site
            <textarea
              rows={3}
              value={plantNotes}
              onChange={(e) => setPlantNotes(e.target.value)}
              placeholder="e.g. Worcester Greenstar 30i, installed 2019, 2 rads upstairs…"
            />
          </label>
          <button
            type="button"
            className="primary t-btn--block"
            style={{ marginTop: 12 }}
            disabled={saveNotes.isPending}
            onClick={() => saveNotes.mutate()}
          >
            {saveNotes.isPending ? "Saving…" : "Save notes"}
          </button>
          {savedFlash ? <p className="t-onboard-ok" style={{ marginTop: 8 }}>{savedFlash}</p> : null}
          {saveNotes.isError ? <p className="error">{(saveNotes.error as Error).message}</p> : null}
        </div>
      </section>

      <section className="t-customer-section">
        <h3 className="t-section-label">Jobs</h3>
        {c.jobs.length === 0 ? (
          <EmptyState title="No jobs yet" hint="Tap New job above to start one for this customer." />
        ) : (
          <ul className="t-list">
            {c.jobs.map((j) => (
              <li key={j.id}>
                <Link
                  className="t-row"
                  to={`/t/jobs/${j.id}`}
                  state={{ from: `/t/customers/${encodeURIComponent(phoneKey)}`, fromLabel: "Customer" }}
                >
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{j.message?.trim() || "Enquiry"}</strong>
                      {j.latestQuote ? <StatusPill status={j.latestQuote.status} /> : null}
                    </div>
                    <span className="t-row-sub">
                      {fmtDate(j.createdAt)}
                      {j.postcode ? ` · ${j.postcode}` : ""}
                      {j.source ? ` · ${j.source}` : ""}
                    </span>
                  </div>
                  <div className="t-row-side">
                    {j.latestQuote ? <span className="t-money">{formatGbp(j.latestQuote.totalPence)}</span> : null}
                    <IconChevron />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="t-customer-section">
        <h3 className="t-section-label">Billing</h3>
        {c.invoices.length === 0 ? (
          <p className="muted-text">No invoices yet.</p>
        ) : (
          <ul className="t-list">
            {c.invoices.map((inv) => (
              <li key={inv.id}>
                <Link className="t-row" to={inv.enquiryId ? `/t/jobs/${inv.enquiryId}` : "/t/invoices"}>
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{inv.reference || "Invoice"}</strong>
                      <StatusPill status={inv.status} />
                    </div>
                    <span className="t-row-sub">{fmtDate(inv.createdAt)}</span>
                  </div>
                  <div className="t-row-side">
                    <span className="t-money">{formatGbp(inv.totalPence)}</span>
                    <IconChevron />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="t-customer-section">
        <h3 className="t-section-label">Diary</h3>
        {c.appointments.length === 0 ? (
          <p className="muted-text">No appointments yet.</p>
        ) : (
          <ul className="t-list">
            {c.appointments.map((a) => (
              <li key={a.id}>
                <Link className="t-row" to={a.enquiryId ? `/t/jobs/${a.enquiryId}` : "/t/diary"}>
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{a.title}</strong>
                      <StatusPill status={a.status} />
                    </div>
                    <span className="t-row-sub">
                      {fmtWhen(a.startsAt)}
                      {a.address ? ` · ${a.address}` : ""}
                    </span>
                  </div>
                  <IconChevron />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="t-customer-section">
        <h3 className="t-section-label">Certs &amp; paperwork</h3>
        {c.certificates.length === 0 ? (
          <p className="muted-text">No files filed yet.</p>
        ) : (
          <ul className="t-list">
            {c.certificates.map((cert) => (
              <li key={cert.id}>
                <Link
                  className="t-row"
                  to={`/t/certificates?id=${cert.id}`}
                >
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{cert.kind.replace(/_/g, " ")}</strong>
                      <StatusPill status={cert.status === "FILED" || cert.status === "SIGNED" ? "FILED" : cert.status} />
                    </div>
                    <span className="t-row-sub">
                      {fmtDate(cert.createdAt)}
                      {cert.siteAddress ? ` · ${cert.siteAddress}` : ""}
                      {cert.serviceDueAt ? ` · due ${fmtDate(cert.serviceDueAt)}` : ""}
                    </span>
                  </div>
                  <IconChevron />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
