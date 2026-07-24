/** Shared explainer for Stripe Connect / Pay Now (onboarding + Settings). */
export function PayNowExplainer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="t-paynow-explainer">
      <p>
        <strong>Pay Now</strong> lets customers pay a deposit by card when they accept a quote or pay an
        invoice. Money goes to <strong>your</strong> bank via Stripe — not through TradiesMate.
      </p>
      {!compact ? (
        <ul>
          <li>Take a deposit before you buy materials or book the diary</li>
          <li>Fewer &quot;I&apos;ll pay when you arrive&quot; no-shows</li>
          <li>Customer pays on their phone; you get a confirmation</li>
        </ul>
      ) : (
        <p className="muted-text">
          Useful for deposits before materials or booking the diary. Optional — quotes still work with
          bank transfer if you saved BACS details.
        </p>
      )}
      <p className="muted-text">
        <strong>Time:</strong> about 2–5 minutes if you have bank details ready. Stripe may ask for a
        quick ID check the first time.
      </p>
      <p className="muted-text" style={{ marginBottom: 0 }}>
        <strong>Have ready:</strong> legal name, date of birth, home address, mobile, UK bank sort code
        + account number
        {compact ? ", and photo ID if Stripe asks." : "."}
      </p>
      {!compact ? (
        <p className="muted-text" style={{ marginBottom: 0 }}>
          Photo ID (passport or driving licence) if Stripe asks. You can skip and enable this later in
          Settings.
        </p>
      ) : null}
    </div>
  );
}
