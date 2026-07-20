import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type TwilioAdminStats, type TwilioUsageBlock } from "../api/client";

type TwilioNumberRow = TwilioAdminStats["numbers"]["rows"][number];
type TwilioMissingClient = TwilioAdminStats["numbers"]["clientsMissing"][number];

function n(v: number): string {
  return new Intl.NumberFormat("en-GB").format(v);
}

function gbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function money(amount: string | null, unit: string): string {
  if (amount == null || amount === "") return "—";
  const num = Number(amount);
  if (Number.isNaN(num)) return `${amount} ${unit}`;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: unit || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(num);
  } catch {
    return `${num.toFixed(4)} ${unit}`;
  }
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

function UsageTable({ title, block }: { title: string; block: TwilioUsageBlock }) {
  return (
    <section className="card settings-section dash-panel">
      <div className="settings-section-head">
        <h2>{title}</h2>
        <p>
          Total {money(block.totalPrice, block.priceUnit)}
          {block.startDate && block.endDate
            ? ` · ${block.startDate} → ${block.endDate}`
            : ""}
        </p>
      </div>
      {block.records.length === 0 ? (
        <p className="muted-text">No usage records for this period.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table twilio-usage-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Count</th>
                <th>Usage</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {block.records.map((r) => (
                <tr key={`${r.category}-${r.startDate}-${r.endDate}`}>
                  <td>
                    <strong>{r.description || r.category}</strong>
                    <div className="hint">{r.category}</div>
                  </td>
                  <td>
                    {r.count} {r.countUnit}
                  </td>
                  <td>
                    {r.usage} {r.usageUnit}
                  </td>
                  <td className="num">{money(r.price, r.priceUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function msgCount(d: TwilioAdminStats, period: "7d" | "30d", key: string): number {
  const bag = period === "7d" ? d.local.messages7d.byKey : d.local.messages30d.byKey;
  return bag[key] ?? 0;
}

export default function TwilioPage() {
  const q = useQuery({
    queryKey: ["twilio-admin"],
    queryFn: api.getTwilioAdmin,
    refetchInterval: 120_000,
  });

  const d = q.data;

  if (q.isLoading && !d) {
    return (
      <div>
        <header className="page-head">
          <div>
            <h1>Twilio</h1>
            <p className="sub">
              Account balance, subscribed numbers, webhook health, live usage costings, and local messaging
              volume.
            </p>
          </div>
        </header>
        <p className="muted-text">Loading…</p>
      </div>
    );
  }

  if (q.isError && !d) {
    return (
      <div>
        <header className="page-head">
          <div>
            <h1>Twilio</h1>
            <p className="sub">
              Account balance, subscribed numbers, webhook health, live usage costings, and local messaging
              volume.
            </p>
          </div>
        </header>
        <p className="error">{(q.error as Error).message}</p>
      </div>
    );
  }

  if (!d) return null;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Twilio</h1>
          <p className="sub">
            Account balance, subscribed numbers, webhook health, live usage costings, and local messaging
            volume.
          </p>
        </div>
        <button type="button" disabled={q.isFetching} onClick={() => q.refetch()}>
          {q.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {!d.configured && (
        <div className="card settings-section">
          <div className="settings-section-head">
            <h2>Twilio not configured</h2>
            <p>
              Add Account SID and Auth Token in{" "}
              <Link to="/admin/settings">Settings</Link> (or Railway env), then refresh this page.
            </p>
          </div>
        </div>
      )}

      {d.twilioError && <p className="error">Twilio API error: {d.twilioError}</p>}

      <div className="dash-layout">
          <section className="dash-kpi-grid" aria-label="Twilio overview">
            <Kpi
              label="Account"
              value={d.account.status || (d.configured ? "Connected" : "Off")}
              hint={
                d.account.friendlyName
                  ? `${d.account.friendlyName}${d.account.sidHint ? ` · ${d.account.sidHint}` : ""}`
                  : d.account.sidHint || "Configure in Settings"
              }
              tone={d.configured && d.account.status === "active" ? "good" : d.configured ? "warn" : "bad"}
            />
            <Kpi
              label="Balance"
              value={
                d.balance ? money(d.balance.balance, d.balance.currency) : d.configured ? "—" : "—"
              }
              hint="Twilio account balance"
              tone={
                d.balance && Number(d.balance.balance) < 5
                  ? "warn"
                  : d.balance
                    ? "good"
                    : "neutral"
              }
            />
            <Kpi
              label="Numbers on account"
              value={n(d.numbers.totalOnTwilio)}
              hint={`${n(d.numbers.assignedToClients)} assigned · ${n(d.numbers.unassignedCount)} free`}
            />
            <Kpi
              label="This month (Twilio)"
              value={money(d.usage.thisMonth.totalPrice, d.usage.thisMonth.priceUnit)}
              hint={`Today ${money(d.usage.today.totalPrice, d.usage.today.priceUnit)}`}
              tone="neutral"
            />
            <Kpi
              label="SMS out (30d)"
              value={n(msgCount(d, "30d", "OUTBOUND_SMS"))}
              hint={`${n(msgCount(d, "7d", "OUTBOUND_SMS"))} in last 7 days`}
            />
            <Kpi
              label="WhatsApp out (30d)"
              value={n(msgCount(d, "30d", "OUTBOUND_WHATSAPP"))}
              hint={`${n(d.local.outboundWithTwilioSid30)} with Twilio SID`}
            />
            <Kpi
              label="Missed-call sessions (30d)"
              value={n(d.local.missedCalls30)}
              hint={`Converted ${n(d.local.missedByStatus30.CONVERTED ?? 0)}`}
            />
            <Kpi
              label="Delivery issues (30d)"
              value={n(d.local.failedOrUndelivered30)}
              hint="Failed / undelivered messages in DB"
              tone={d.local.failedOrUndelivered30 > 0 ? "bad" : "good"}
            />
          </section>

          <div className="dash-money-grid">
            <section className="card settings-section dash-panel">
              <div className="settings-section-head">
                <h2>Senders & webhooks</h2>
                <p>Default From numbers and the URLs every subscribed number should point at.</p>
              </div>
              <div className="twilio-meta-grid">
                <div>
                  <span className="dash-usage-label">SMS From</span>
                  <strong>{d.account.smsFrom || "Not set"}</strong>
                </div>
                <div>
                  <span className="dash-usage-label">WhatsApp From</span>
                  <strong>{d.account.whatsappFrom || "Not set"}</strong>
                </div>
                <div className="span-2">
                  <span className="dash-usage-label">Expected Voice URL</span>
                  <code className="twilio-url">{d.account.expectedVoiceUrl}</code>
                </div>
                <div className="span-2">
                  <span className="dash-usage-label">Expected SMS URL</span>
                  <code className="twilio-url">{d.account.expectedSmsUrl}</code>
                </div>
              </div>
              <p className="dash-footnote">
                Change credentials under <Link to="/admin/settings">Settings → Messaging</Link>.
              </p>
            </section>

            <section className="card settings-section dash-panel">
              <div className="settings-section-head">
                <h2>Local cost estimate (30d)</h2>
                <p>Fallback when you want a quick GBP view from app volume (not Twilio invoices).</p>
              </div>
              <div className="dash-money-row">
                <div>
                  <div className="dash-money-label">Estimated COGS</div>
                  <div className="dash-money-hint">{d.local.estimatedCost30.note}</div>
                </div>
                <div className="dash-money-value">{gbp(d.local.estimatedCost30.totalPence)}</div>
              </div>
              <div className="dash-usage">
                <div>
                  <span className="dash-usage-label">SMS out</span>
                  <strong>{n(d.local.estimatedCost30.breakdown.smsOutbound)}</strong>
                </div>
                <div>
                  <span className="dash-usage-label">WhatsApp out</span>
                  <strong>{n(d.local.estimatedCost30.breakdown.whatsappOutbound)}</strong>
                </div>
                <div>
                  <span className="dash-usage-label">Voice sessions</span>
                  <strong>{n(d.local.estimatedCost30.breakdown.missedCallSessions)}</strong>
                </div>
              </div>
            </section>
          </div>

          <section className="card settings-section dash-panel">
            <div className="settings-section-head">
              <h2>Numbers subscribed</h2>
              <p>
                Incoming phone numbers on the Twilio account, mapped to TradiesMate clients and webhook
                health.
              </p>
            </div>

            {d.numbers.clientsWithNumberMissingOnTwilio > 0 && (
              <div className="twilio-alert">
                <strong>
                  {n(d.numbers.clientsWithNumberMissingOnTwilio)} client
                  {d.numbers.clientsWithNumberMissingOnTwilio === 1 ? "" : "s"} have a number not found
                  on this Twilio account
                </strong>
                <ul className="dash-list">
                  {d.numbers.clientsMissing.map((c: TwilioMissingClient) => (
                    <li key={c.id}>
                      <Link to={`/admin/clients/${c.id}`}>{c.businessName}</Link> — {c.twilioNumber} (
                      {c.status})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.numbers.rows.length === 0 ? (
              <p className="muted-text">
                {d.configured
                  ? "No incoming numbers on this Twilio account yet."
                  : "Configure Twilio to list numbers."}
              </p>
            ) : (
              <>
                <div className="table-wrap desktop-only">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Client</th>
                        <th>Mode</th>
                        <th>Voice webhook</th>
                        <th>SMS webhook</th>
                        <th>Caps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.numbers.rows.map((row: TwilioNumberRow) => (
                        <tr key={row.sid}>
                          <td>
                            <strong>{row.phoneNumber}</strong>
                            {row.friendlyName ? <div className="hint">{row.friendlyName}</div> : null}
                          </td>
                          <td>
                            {row.assignedClient ? (
                              <>
                                <Link to={`/admin/clients/${row.assignedClient.id}`}>
                                  {row.assignedClient.businessName}
                                </Link>
                                <div className="hint">{row.assignedClient.status}</div>
                              </>
                            ) : (
                              <span className="badge amber">Unassigned</span>
                            )}
                          </td>
                          <td>
                            {row.assignedClient ? (
                              <span className="hint">{row.assignedClient.missedCallMode}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span className={`badge ${row.voiceOk ? "green" : "red"}`}>
                              {row.voiceOk ? "OK" : "Mismatch"}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${row.smsOk ? "green" : "red"}`}>
                              {row.smsOk ? "OK" : "Mismatch"}
                            </span>
                          </td>
                          <td className="hint">
                            {[
                              row.capabilities.voice ? "Voice" : null,
                              row.capabilities.sms ? "SMS" : null,
                              row.capabilities.mms ? "MMS" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-only mobile-card-list">
                  {d.numbers.rows.map((row: TwilioNumberRow) => (
                    <article key={row.sid} className="mobile-card">
                      <div className="mobile-card-top">
                        <strong>{row.phoneNumber}</strong>
                        <span className={`badge ${row.webhooksOk ? "green" : "red"}`}>
                          {row.webhooksOk ? "Webhooks OK" : "Fix webhooks"}
                        </span>
                      </div>
                      <div className="mobile-card-meta">
                        {row.assignedClient ? (
                          <Link to={`/admin/clients/${row.assignedClient.id}`}>
                            {row.assignedClient.businessName}
                          </Link>
                        ) : (
                          <span>Unassigned</span>
                        )}
                        {row.friendlyName ? <span>{row.friendlyName}</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <UsageTable title="Usage & cost — today" block={d.usage.today} />
          <UsageTable title="Usage & cost — this month" block={d.usage.thisMonth} />
          <UsageTable title="Usage & cost — last month" block={d.usage.lastMonth} />

          <p className="dash-updated muted-text">
            Updated {new Date(d.generatedAt).toLocaleString("en-GB")}
          </p>
      </div>
    </div>
  );
}
