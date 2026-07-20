import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type DashboardStats } from "../api/client";

function gbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function n(v: number): string {
  return new Intl.NumberFormat("en-GB").format(v);
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <div className={`dash-kpi${tone ? ` dash-kpi--${tone}` : ""}`}>
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {hint ? <div className="dash-kpi-hint">{hint}</div> : null}
    </div>
  );
}

function MoneyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="dash-money-row">
      <div>
        <div className="dash-money-label">{label}</div>
        {hint ? <div className="dash-money-hint">{hint}</div> : null}
      </div>
      <div className="dash-money-value">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.getDashboard,
    refetchInterval: 60_000,
  });

  const d: DashboardStats | undefined = q.data;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">
            Platform pulse — clients, rescue performance, SaaS MRR, job invoice GMV, and estimated COGS.
          </p>
        </div>
        <button type="button" disabled={q.isFetching} onClick={() => q.refetch()}>
          {q.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {q.isLoading && <p className="muted-text">Loading…</p>}
      {q.isError && <p className="error">{(q.error as Error).message}</p>}

      {d && (
        <div className="dash-layout">
          <section className="dash-kpi-grid" aria-label="Key metrics">
            <Kpi
              label="Active clients"
              value={n(d.kpis.clients.active)}
              hint={`${n(d.kpis.clients.trial)} on trial · ${n(d.kpis.clients.pastDue)} past due`}
              tone="good"
            />
            <Kpi
              label="Early access queue"
              value={n(d.kpis.earlyAccess.pending)}
              hint={`${n(d.kpis.earlyAccess.signedUp)} signed up from invites`}
              tone={d.kpis.earlyAccess.pending > 0 ? "warn" : "neutral"}
            />
            <Kpi
              label="Enquiries (7d)"
              value={n(d.kpis.enquiries.last7Days)}
              hint={`${n(d.kpis.enquiries.last30Days)} in last 30 days`}
            />
            <Kpi
              label="Missed → jobs (30d)"
              value={
                d.kpis.missedCalls.conversionRate30 != null
                  ? `${d.kpis.missedCalls.conversionRate30}%`
                  : "—"
              }
              hint={`${n(d.kpis.missedCalls.converted30)} of ${n(d.kpis.missedCalls.last30Days)} rescued`}
              tone={
                d.kpis.missedCalls.conversionRate30 != null && d.kpis.missedCalls.conversionRate30 >= 40
                  ? "good"
                  : "neutral"
              }
            />
            <Kpi
              label="Quotes sent (30d)"
              value={n(d.kpis.quotes.sent30)}
              hint={`${n(d.kpis.quotes.accepted30)} accepted`}
            />
            <Kpi
              label="Invoices overdue"
              value={n(d.kpis.invoices.overdue)}
              hint={`${n(d.kpis.invoices.paid)} paid · ${n(d.kpis.invoices.sent)} open`}
              tone={d.kpis.invoices.overdue > 0 ? "bad" : "good"}
            />
            <Kpi
              label="Trials ending (7d)"
              value={n(d.kpis.clients.trialsEndingSoon7d)}
              hint="Follow up before they drop off"
              tone={d.kpis.clients.trialsEndingSoon7d > 0 ? "warn" : "neutral"}
            />
            <Kpi
              label="Leads in play"
              value={n(d.kpis.pipeline.leadsInPlay)}
              hint={`${n(d.kpis.pipeline.leadsTotal)} total · ${n(d.kpis.pipeline.searchRuns30)} searches (30d)`}
            />
          </section>

          <div className="dash-money-grid">
            <section className="card settings-section dash-panel">
              <div className="settings-section-head">
                <h2>Billable revenue</h2>
                <p>
                  SaaS MRR from active subscriptions, plus job invoice totals tracked for tradies.
                  Plan rate {gbp(d.billableRevenue.planPricePence)}/mo — set{" "}
                  <code>SAAS_PLAN_PRICE_PENCE</code> on Railway to match Stripe.
                </p>
              </div>
              <MoneyRow
                label="SaaS MRR"
                value={gbp(d.billableRevenue.saasMrrPence)}
                hint={`${n(d.billableRevenue.activeClients)} active × ${gbp(d.billableRevenue.planPricePence)}`}
              />
              <MoneyRow
                label="At-risk MRR (past due)"
                value={gbp(d.billableRevenue.saasAtRiskMrrPence)}
                hint="Still billed until cancelled"
              />
              <MoneyRow
                label="Trial pipeline (if converting)"
                value={gbp(d.billableRevenue.saasTrialPipelinePence)}
                hint={`${n(d.billableRevenue.trialClients)} trials`}
              />
              <div className="dash-divider" />
              <MoneyRow
                label="Job invoices paid (this month)"
                value={gbp(d.billableRevenue.jobInvoicesPaidMonthPence)}
                hint={`${n(d.billableRevenue.jobInvoicesPaidMonthCount)} invoices`}
              />
              <MoneyRow
                label="Job invoices paid (all time)"
                value={gbp(d.billableRevenue.jobInvoicesPaidTotalPence)}
                hint={`${n(d.billableRevenue.jobInvoicesPaidTotalCount)} invoices · tradie↔customer GMV`}
              />
              <MoneyRow
                label="Outstanding invoices"
                value={gbp(d.billableRevenue.jobInvoicesOutstandingPence)}
                hint={`${n(d.billableRevenue.jobInvoicesOutstandingCount)} sent or overdue`}
              />
              <p className="dash-footnote">{d.billableRevenue.note}</p>
            </section>

            <section className="card settings-section dash-panel">
              <div className="settings-section-head">
                <h2>Costings (last 30 days)</h2>
                <p>Estimated platform COGS from message, voice, Whisper, and Haiku volume.</p>
              </div>
              <MoneyRow
                label="Estimated total COGS"
                value={gbp(d.costings.totalPence)}
                hint="Messaging + voice/AI"
              />
              <MoneyRow
                label="Messaging (SMS / WhatsApp)"
                value={gbp(d.costings.messagingPence)}
                hint={`${n(d.costings.usage30.smsOutbound)} SMS · ${n(d.costings.usage30.whatsappOutbound)} WhatsApp`}
              />
              <MoneyRow
                label="Voice rescue + AI"
                value={gbp(d.costings.voiceAndAiPence)}
                hint={`${n(d.costings.usage30.missedCalls)} missed calls · ${n(d.costings.usage30.voiceNotes)} voice notes`}
              />
              <div className="dash-divider" />
              <div className="dash-usage">
                <div>
                  <span className="dash-usage-label">Outbound messages</span>
                  <strong>{n(d.costings.usage30.messagesOutboundTotal)}</strong>
                </div>
                <div>
                  <span className="dash-usage-label">Missed-call sessions</span>
                  <strong>{n(d.costings.usage30.missedCalls)}</strong>
                </div>
                <div>
                  <span className="dash-usage-label">Voice notes</span>
                  <strong>{n(d.costings.usage30.voiceNotes)}</strong>
                </div>
              </div>
              <p className="dash-footnote">{d.costings.note}</p>
            </section>
          </div>

          <section className="card settings-section dash-panel">
            <div className="settings-section-head">
              <h2>Operations snapshot</h2>
              <p>Quick links into the areas that usually need attention.</p>
            </div>
            <div className="dash-ops-grid">
              <div>
                <h3>Clients</h3>
                <ul className="dash-list">
                  <li>
                    Active <strong>{n(d.kpis.clients.active)}</strong>
                  </li>
                  <li>
                    Trial <strong>{n(d.kpis.clients.trial)}</strong>
                  </li>
                  <li>
                    Past due <strong>{n(d.kpis.clients.pastDue)}</strong>
                  </li>
                  <li>
                    Suspended / cancelled{" "}
                    <strong>
                      {n(d.kpis.clients.suspended)} / {n(d.kpis.clients.cancelled)}
                    </strong>
                  </li>
                </ul>
                <Link className="dash-link" to="/admin/clients">
                  Open clients →
                </Link>
              </div>
              <div>
                <h3>Missed-call rescue</h3>
                <ul className="dash-list">
                  <li>
                    Pending / qualifying{" "}
                    <strong>
                      {n(d.kpis.missedCalls.pending)} / {n(d.kpis.missedCalls.qualifying)}
                    </strong>
                  </li>
                  <li>
                    Converted (all time) <strong>{n(d.kpis.missedCalls.converted)}</strong>
                  </li>
                  <li>
                    Spam / expired{" "}
                    <strong>
                      {n(d.kpis.missedCalls.spam)} / {n(d.kpis.missedCalls.expired)}
                    </strong>
                  </li>
                </ul>
              </div>
              <div>
                <h3>Early access</h3>
                <ul className="dash-list">
                  <li>
                    Pending <strong>{n(d.kpis.earlyAccess.pending)}</strong>
                  </li>
                  <li>
                    Approved <strong>{n(d.kpis.earlyAccess.approved)}</strong>
                  </li>
                  <li>
                    Denied <strong>{n(d.kpis.earlyAccess.denied)}</strong>
                  </li>
                </ul>
                <Link className="dash-link" to="/admin/early-access">
                  Review queue →
                </Link>
              </div>
              <div>
                <h3>Quotes & invoices</h3>
                <ul className="dash-list">
                  <li>
                    Quotes accepted <strong>{n(d.kpis.quotes.accepted)}</strong>
                  </li>
                  <li>
                    Quotes open (sent) <strong>{n(d.kpis.quotes.sent)}</strong>
                  </li>
                  <li>
                    Invoices paid <strong>{n(d.kpis.invoices.paid)}</strong>
                  </li>
                  <li>
                    Enquiries held (30d) <strong>{n(d.kpis.enquiries.held30)}</strong>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <p className="dash-updated muted-text">
            Updated {new Date(d.generatedAt).toLocaleString("en-GB")}
          </p>
        </div>
      )}
    </div>
  );
}
