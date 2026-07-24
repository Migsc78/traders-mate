import { useState } from "react";

type Props = {
  twilioNumber: string | null | undefined;
};

/**
 * Fallback when dialling **61* / **67* / **62* fails on the carrier.
 * Android usually supports conditional forwarding in the Phone app;
 * iPhone Settings → Call Forwarding is often "all calls" only.
 */
export function DivertManualGuide({ twilioNumber }: Props) {
  const number = twilioNumber?.trim() || "your TradiesMate number";
  const [copied, setCopied] = useState(false);

  const copyNumber = async () => {
    if (!twilioNumber?.trim()) return;
    try {
      await navigator.clipboard.writeText(twilioNumber.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="t-divert-manual">
      <summary>Codes failed? Set divert manually (Android / iPhone)</summary>

      <p className="muted-text" style={{ marginTop: 10 }}>
        If the network shows &quot;Setting Registration Failed&quot; or refuses the dial codes, turn on call
        forwarding in your phone settings instead. Paste this number:
      </p>
      <p className="t-divert-manual-number">
        <code>{number}</code>
        {twilioNumber?.trim() ? (
          <button type="button" className="linkish" onClick={() => void copyNumber()}>
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </p>

      <div className="t-divert-manual-cols">
        <section>
          <h4>Android</h4>
          <ol>
            <li>Open the <strong>Phone</strong> app (not Settings first).</li>
            <li>Tap <strong>⋮</strong> (top right) → <strong>Settings</strong>.</li>
            <li>
              Open <strong>Calls</strong>, <strong>Calling accounts</strong>, or{" "}
              <strong>Supplementary services</strong> (wording varies by brand).
            </li>
            <li>
              Tap <strong>Call forwarding</strong> (or <strong>Call divert</strong>).
            </li>
            <li>
              Turn on <strong>When unanswered</strong> (and <strong>When busy</strong> if shown) → paste{" "}
              <code>{number}</code> → save.
            </li>
            <li>
              Optional: <strong>When unreachable</strong> / off / no signal — skip if it errors (common).
            </li>
            <li>
              Leave <strong>Always forward</strong> / <strong>Forward all</strong> <em>off</em> so your
              phone still rings when you can answer.
            </li>
          </ol>
          <p className="muted-text">
            Samsung: Phone → ⋮ → Settings → Supplementary services → Call forwarding.
            <br />
            Pixel / stock: Phone → ⋮ → Settings → Calls → Call forwarding.
          </p>
        </section>

        <section>
          <h4>iPhone</h4>
          <ol>
            <li>
              Open <strong>Settings</strong> → <strong>Phone</strong> →{" "}
              <strong>Call Forwarding</strong>.
            </li>
            <li>
              If you only see one switch, that usually forwards <strong>all</strong> calls — leave it{" "}
              <em>off</em> for day-to-day work (you&apos;d never hear the phone ring).
            </li>
            <li>
              For missed calls only, go back to the Phone keypad and dial the{" "}
              <strong>No answer</strong> and <strong>Busy</strong> codes above (that&apos;s how most UK
              iPhones set conditional divert).
            </li>
            <li>
              Prefer the network app if you have one (EE, Vodafone, O2, Three, giffgaff, etc.) — look for{" "}
              <strong>Call divert</strong> / <strong>Call forwarding</strong> → When unanswered / When
              busy → paste <code>{number}</code>.
            </li>
            <li>Skip &quot;when unreachable&quot; if the network errors.</li>
          </ol>
          <p className="muted-text">
            Tip: after dialling a code, wait for the confirmation tone or message before hanging up.
          </p>
        </section>
      </div>
    </details>
  );
}
