import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue } from "../../../../api/tradie";
import { jobsApi, type JobCost, type JobDetail, type JobProfit } from "../../../../api/jobs";
import { QueryError } from "../../ui";

const TYPE_LABEL: Record<JobCost["type"], string> = {
  MATERIAL: "Materials",
  LABOUR: "Labour",
  EXPENSE: "Expenses",
  SUBCONTRACTOR: "Subcontractor",
};

const ORDER: JobCost["type"][] = ["MATERIAL", "LABOUR", "SUBCONTRACTOR", "EXPENSE"];

function lineCost(c: JobCost): number | null {
  return c.unitCostPence === null ? null : Math.round(c.unitCostPence * c.qty);
}

/**
 * Job profit.
 *
 * The rule this screen is built around: if the tradie never opens it, the number
 * must still be right. A job made from an accepted quote arrives with its lines
 * already here and its costs already filled from the rates card, so Adjust is
 * only for when reality differed — the merchant charged more, the job took six
 * hours instead of four.
 *
 * Everything is ex-VAT. VAT is not the tradie's money, and margin computed on
 * VAT-inclusive totals overstates every single job. For a tradie who isn't VAT
 * registered the rate is zero and net equals gross, so the same sums hold.
 */
export default function CostsTab({ detail }: { detail: JobDetail }) {
  const qc = useQueryClient();
  const jobId = detail.id;

  const data = useQuery({
    queryKey: ["tradie-job-costs", jobId],
    queryFn: () => jobsApi.costs(jobId),
    // Seeded from the detail payload so the numbers are on screen immediately
    // rather than after a spinner the tradie didn't need.
    initialData: {
      costs: detail.job.costs,
      profit: detail.job.profit,
      labourCostPerHourPence: null,
    },
  });

  const remove = useMutation({
    mutationFn: (cost: JobCost) =>
      sendOrQueue({
        label: `Remove cost · ${cost.label}`,
        path: `/jobs/${jobId}/costs/${cost.id}`,
        method: "DELETE",
        body: {},
        invalidates: ["tradie-job-costs", "tradie-job"],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-job-costs", jobId] });
      void qc.invalidateQueries({ queryKey: ["tradie-job", jobId] });
    },
  });

  const costs = data.data?.costs ?? [];
  const profit: JobProfit = data.data?.profit ?? detail.job.profit;
  const extras = costs.filter((c) => c.isExtra);
  const quoted = detail.job.quotedTotalPence;

  return (
    <section>
      <div className="t-card t-profit">
        <dl className="t-kv">
          {quoted > 0 && (
            <div>
              <dt>Quoted (ex VAT)</dt>
              <dd>{formatGbp(quoted)}</dd>
            </div>
          )}
          {extras.length > 0 && (
            <div>
              <dt>Approved extras</dt>
              <dd>
                +{formatGbp(profit.revenuePence - quoted)}
              </dd>
            </div>
          )}
          {quoted === 0 && (
            <div>
              <dt>Charging (ex VAT)</dt>
              <dd>{formatGbp(profit.revenuePence)}</dd>
            </div>
          )}
          <div>
            <dt>Materials</dt>
            <dd>−{formatGbp(profit.materialsPence)}</dd>
          </div>
          <div>
            <dt>Labour</dt>
            <dd>
              {profit.labourPence > 0 ? (
                `−${formatGbp(profit.labourPence)}`
              ) : (
                /* Own time isn't a cash cost. Saying so beats a bare £0.00 that
                   looks like something failed to load. */
                <span className="muted-text">Your own time</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Expenses</dt>
            <dd>−{formatGbp(profit.expensesPence)}</dd>
          </div>
        </dl>

        {/*
          With a cost missing, the computed figure is a ceiling, not an answer —
          unknown costs can only reduce it. So it's labelled as a ceiling and the
          percentage is withheld entirely. A job whose costs nobody has entered
          computes to 100% margin, and printed bare that is the most misleading
          number in the app: it's the one a tradie would price the next job off.
        */}
        <div className="t-profit-total">
          <div>
            <span className="muted-text">{profit.provisional ? "Job profit — at most" : "Job profit"}</span>
            <strong
              className={[
                "t-money",
                profit.profitPence < 0 ? "t-money--alert" : "",
                profit.provisional ? "t-money--provisional" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {formatGbp(profit.profitPence)}
            </strong>
          </div>
          {profit.provisional ? (
            <span className="t-margin t-margin--unset">% unknown</span>
          ) : (
            profit.marginPct !== null && (
              <span
                className={`t-margin t-margin--${
                  profit.marginPct < 0 ? "loss" : profit.marginPct < 15 ? "thin" : "ok"
                }`}
              >
                {profit.marginPct}%
              </span>
            )
          )}
        </div>

        {profit.provisional && (
          <p className="t-provisional">
            {profit.missingCostCount} item{profit.missingCostCount === 1 ? "" : "s"} with no cost
            recorded, so the real figure is lower. Tap a line to fill it in.
          </p>
        )}

        <p className="t-cta-hint">
          Job profit, before van, insurance and tax.
        </p>
      </div>

      <QueryError error={data.error || remove.error} />

      {ORDER.map((type) => {
        const rows = costs.filter((c) => c.type === type);
        if (!rows.length) return null;
        return (
          <section key={type} className="t-cost-group">
            <p className="t-section-label">{TYPE_LABEL[type]}</p>
            <ul className="t-list">
              {rows.map((c) => {
                const cost = lineCost(c);
                const sell = Math.round(c.sellPricePence * c.qty);
                return (
                  <li key={c.id}>
                    <Link className="t-card t-cost-row" to={`/t/jobs/${jobId}/costs/${c.id}`}>
                      <div className="t-cost-main">
                        <div className="t-row-top">
                          <strong>{c.label}</strong>
                          {c.isExtra && <span className="t-pill t-pill--orange">Extra</span>}
                          {!c.billable && <span className="t-pill t-pill--grey">Not charged</span>}
                        </div>
                        <span className="t-row-sub">
                          {c.qty} {c.unit.toLowerCase()}
                          {c.isExtra && c.agreedAt
                            ? ` · agreed ${new Date(c.agreedAt).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}${c.agreedVia ? ` (${c.agreedVia})` : ""}`
                            : ""}
                        </span>
                      </div>
                      <div className="t-cost-money">
                        <span className="t-money">{formatGbp(sell)}</span>
                        {cost === null ? (
                          <span className="t-margin t-margin--unset">cost not set</span>
                        ) : (
                          <span className="muted-text">cost {formatGbp(cost)}</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {costs.length === 0 && (
        <p className="muted-text">
          Nothing recorded yet. A job made from an accepted quote fills this in on its own — add
          lines here for a call-out you&apos;re billing by time and materials.
        </p>
      )}

      <div className="tradie-actions" style={{ flexDirection: "column", gap: 8, marginTop: 14 }}>
        <Link className="primary t-btn--block" to={`/t/jobs/${jobId}/costs/new`}>
          + Add cost
        </Link>
        <Link className="t-btn t-btn--block" to={`/t/jobs/${jobId}/costs/new?extra=1`}>
          + Add extra work
        </Link>
      </div>

      {remove.isPending && <p className="muted-text">Removing…</p>}
    </section>
  );
}
