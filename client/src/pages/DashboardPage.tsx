import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type DashboardKpiKey, type DashboardStats } from "../api/client";
import KpiDetailDrawer from "../components/KpiDetailDrawer";

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
  onOpen,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`dash-kpi dash-kpi--clickable${tone ? ` dash-kpi--${tone}` : ""}`}
      onClick={onOpen}
    >
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {hint ? <div className="dash-kpi-hint">{hint}</div> : null}
      <span className="dash-kpi-action">View details</span>
    </button>
  );
}

function MoneyRow({
  label,
  value,
  hint,
  onOpen,
}: {
  label: string;
  value: string;
  hint?: string;
  onOpen?: () => void;
}) {
  if (!onOpen) {
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
  return (
    <button type="button" className="dash-money-row dash-money-row--clickable" onClick={onOpen}>
      <div>
        <div className="dash-money-label">{label}</div>
        {hint ? <div className="dash-money-hint">{hint}</div> : null}
      </div>
      <div className="dash-money-value">
        {value}
        <span className="dash-money-chevron" aria-hidden>
          ›
        </span>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const [openKpi, setOpenKpi] = useState<DashboardKpiKey | null>(null);
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
            Platform pulse — click any KPI or revenue/costing row to see the rows behind it and take action.
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
              onOpen={() => setOpenKpi("active-clients")}
            />
            <Kpi
              label="Early access queue"
              value={n(d.kpis.earlyAccess.pending)}
              hint={`${n(d.kpis.earlyAccess.signedUp)} signed up from invites`}
              tone={d.kpis.earlyAccess.pending > 0 ? "warn" : "neutral"}
              onOpen={() => setOpenKpi("early-access")}
            />
            <Kpi
              label="Enquiries (7d)"
              value={n(d.kpis.enquiries.last7Days)}
              hint={`${n(d.kpis.enquiries.last30Days)} in last 30 days`}
              onOpen={() => setOpenKpi("enquiries")}
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
              onOpen={() => setOpenKpi("missed-calls")}
            />
            <Kpi
              label="Quotes sent (30d)"
              value={n(d.kpis.quotes.sent30)}
              hint={`${n(d.kpis.quotes.accepted30)} accepted`}
              onOpen={() => setOpenKpi("quotes")}
            />
            <Kpi
              label="Invoices overdue"
              value={n(d.kpis.invoices.overdue)}
              hint={`${n(d.kpis.invoices.paid)} paid · ${n(d.kpis.invoices.sent)} open`}
              tone={d.kpis.invoices.overdue > 0 ? "bad" : "good"}
              onOpen={() => setOpenKpi("invoices-overdue")}
            />
            <Kpi
              label="Trials ending (7d)"
              value={n(d.kpis.clients.trialsEndingSoon7d)}
              hint="Follow up before they drop off"
              tone={d.kpis.clients.trialsEndingSoon7d > 0 ? "warn" : "neutral"}
              onOpen={() => setOpenKpi("trials-ending")}
            />
            <Kpi
              label="Leads in play"
              value={n(d.kpis.pipeline.leadsInPlay)}
              hint={`${n(d.kpis.pipeline.leadsTotal)} total · ${n(d.kpis.pipeline.searchRuns30)} searches (30d)`}
              onOpen={() => setOpenKpi("leads-in-play")}
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
                onOpen={() => setOpenKpi("saas-mrr")}
              />
              <MoneyRow
                label="At-risk MRR (past due)"
                value={gbp(d.billableRevenue.saasAtRiskMrrPence)}
                hint="Still billed until cancelled"
                onOpen={() => setOpenKpi("at-risk-mrr")}
              />
              <MoneyRow
                label="Trial pipeline (if converting)"
                value={gbp(d.billableRevenue.saasTrialPipelinePence)}
                hint={`${n(d.billableRevenue.trialClients)} trials`}
                onOpen={() => setOpenKpi("trial-pipeline")}
              />
              <div className="dash-divider" />
              <MoneyRow
                label="Job invoices paid (this month)"
                value={gbp(d.billableRevenue.jobInvoicesPaidMonthPence)}
                hint={`${n(d.billableRevenue.jobInvoicesPaidMonthCount)} invoices`}
                onOpen={() => setOpenKpi("invoices-paid-month")}
              />
              <MoneyRow
                label="Job invoices paid (all time)"
                value={gbp(d.billableRevenue.jobInvoicesPaidTotalPence)}
                hint={`${n(d.billableRevenue.jobInvoicesPaidTotalCount)} invoices · tradie↔customer GMV`}
                onOpen={() => setOpenKpi("invoices-paid-all")}
              />
              <MoneyRow
                label="Outstanding invoices"
                value={gbp(d.billableRevenue.jobInvoicesOutstandingPence)}
                hint={`${n(d.billableRevenue.jobInvoicesOutstandingCount)} sent or overdue`}
                onOpen={() => setOpenKpi("invoices-outstanding")}
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
                onOpen={() => setOpenKpi("costings")}
              />
              <MoneyRow
                label="Messaging (SMS / WhatsApp)"
                value={gbp(d.costings.messagingPence)}
                hint={`${n(d.costings.usage30.smsOutbound)} SMS · ${n(d.costings.usage30.whatsappOutbound)} WhatsApp`}
                onOpen={() => setOpenKpi("costings-messaging")}
              />
              <MoneyRow
                label="Voice rescue + AI"
                value={gbp(d.costings.voiceAndAiPence)}
                hint={`${n(d.costings.usage30.missedCalls)} missed calls · ${n(d.costings.usage30.voiceNotes)} voice notes`}
                onOpen={() => setOpenKpi("costings-voice")}
              />
              <div className="dash-divider" />
              <div className="dash-usage">
                <button type="button" className="dash-usage-btn" onClick={() => setOpenKpi("costings")}>
                  <span className="dash-usage-label">Outbound messages</span>
                  <strong>{n(d.costings.usage30.messagesOutboundTotal)}</strong>
                </button>
                <button type="button" className="dash-usage-btn" onClick={() => setOpenKpi("costings-voice")}>
                  <span className="dash-usage-label">Missed-call sessions</span>
                  <strong>{n(d.costings.usage30.missedCalls)}</strong>
                </button>
                <button type="button" className="dash-usage-btn" onClick={() => setOpenKpi("costings-voice")}>
                  <span className="dash-usage-label">Voice notes</span>
                  <strong>{n(d.costings.usage30.voiceNotes)}</strong>
                </button>
              </div>
              <p className="dash-footnote">{d.costings.note}</p>
            </section>
          </div>

          <section className="card settings-section dash-panel">
            <div className="settings-section-head">
              <h2>Operations snapshot</h2>
              <p>Quick links into the areas that usually need attention — click a count to drill in.</p>
            </div>
            <div className="dash-ops-grid">
              <div>
                <h3>Clients</h3>
                <ul className="dash-list">
                  <li>
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("active-clients")}>
                      Active <strong>{n(d.kpis.clients.active)}</strong>
                    </button>
                  </li>
                  <li>
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("trial-pipeline")}>
                      Trial <strong>{n(d.kpis.clients.trial)}</strong>
                    </button>
                  </li>
                  <li>
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("at-risk-mrr")}>
                      Past due <strong>{n(d.kpis.clients.pastDue)}</strong>
                    </button>
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
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("missed-calls")}>
                      Pending / qualifying{" "}
                      <strong>
                        {n(d.kpis.missedCalls.pending)} / {n(d.kpis.missedCalls.qualifying)}
                      </strong>
                    </button>
                  </li>
                  <li>
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("missed-calls")}>
                      Converted (all time) <strong>{n(d.kpis.missedCalls.converted)}</strong>
                    </button>
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
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("early-access")}>
                      Pending <strong>{n(d.kpis.earlyAccess.pending)}</strong>
                    </button>
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
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("quotes")}>
                      Quotes accepted <strong>{n(d.kpis.quotes.accepted)}</strong>
                    </button>
                  </li>
                  <li>
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("quotes")}>
                      Quotes open (sent) <strong>{n(d.kpis.quotes.sent)}</strong>
                    </button>
                  </li>
                  <li>
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("invoices-paid-all")}>
                      Invoices paid <strong>{n(d.kpis.invoices.paid)}</strong>
                    </button>
                  </li>
                  <li>
                    <button type="button" className="dash-ops-btn" onClick={() => setOpenKpi("enquiries")}>
                      Enquiries held (30d) <strong>{n(d.kpis.enquiries.held30)}</strong>
                    </button>
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

      {openKpi && <KpiDetailDrawer kpi={openKpi} onClose={() => setOpenKpi(null)} />}
    </div>
  );
}
