import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { tradieApi } from "../api/tradie";
import "../landing.css";

const LANDING_LINKS = [
  { href: "#story", label: "The problem" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
] as const;

export default function LandingPage() {
  const [signupsOpen, setSignupsOpen] = useState(false);
  const [earlyAccessOpen, setEarlyAccessOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    let cancelled = false;
    tradieApi
      .signupStatus()
      .then((s) => {
        if (!cancelled) setSignupsOpen(!!s.open);
      })
      .catch(() => {
        if (!cancelled) setSignupsOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const openEarlyAccess = () => {
    setMenuOpen(false);
    setEarlyAccessOpen(true);
  };

  const closeMenu = () => setMenuOpen(false);

  const primaryCta = signupsOpen ? (
    <Link className="lp-btn lp-btn--primary lp-btn--nav" to="/signup">
      <span className="lp-btn-full">Start £14 trial</span>
      <span className="lp-btn-short">£14 trial</span>
    </Link>
  ) : (
    <button type="button" className="lp-btn lp-btn--primary lp-btn--nav" onClick={openEarlyAccess}>
      <span className="lp-btn-full">Request early access</span>
      <span className="lp-btn-short">Early access</span>
    </button>
  );

  const heroPrimary = signupsOpen ? (
    <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/signup">
      Start your £14 / 14-day trial
    </Link>
  ) : (
    <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={openEarlyAccess}>
      Request early access
    </button>
  );

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand" aria-label="TradiesMate home">
            <span className="lp-brand-mark" aria-hidden="true">
              TM
            </span>
            <span className="lp-brand-name">
              Tradies<span>Mate</span>
            </span>
          </Link>
          <nav className="lp-nav-links" aria-label="Primary">
            {LANDING_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="lp-nav-actions">
            <Link className="lp-link-quiet" to="/t/auth">
              Sign in
            </Link>
            {primaryCta}
            <button
              type="button"
              className="lp-menu-btn"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className={`lp-burger${menuOpen ? " lp-burger--open" : ""}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="lp-drawer-root" role="presentation" onClick={closeMenu}>
          <div
            id={menuId}
            className="lp-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="lp-drawer-nav" aria-label="Mobile">
              {LANDING_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={closeMenu}>
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="lp-drawer-actions">
              <Link className="lp-btn lp-btn--ghost" to="/t/auth" onClick={closeMenu}>
                Sign in
              </Link>
              {signupsOpen ? (
                <Link className="lp-btn lp-btn--primary" to="/signup" onClick={closeMenu}>
                  Start £14 trial
                </Link>
              ) : (
                <button type="button" className="lp-btn lp-btn--primary" onClick={openEarlyAccess}>
                  Request early access
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">{signupsOpen ? "Built for UK trades" : "Private beta"}</p>
              <h1>
                Turn missed calls into
                <span className="lp-hero-accent"> quoted jobs</span>
              </h1>
              <p className="lp-lede">
                You&apos;re under the sink. The phone rings. By the time your hands are free, that
                landlord job — or insurance repair — has already gone to the next plumber.
                TradiesMate texts them back, qualifies the work, and gets the job onto your phone.
              </p>
              <div className="lp-hero-cta">
                {heroPrimary}
                {signupsOpen ? (
                  <Link className="lp-btn lp-btn--ghost lp-btn--lg" to="/t/auth">
                    Sign in
                  </Link>
                ) : (
                  <Link className="lp-btn lp-btn--ghost lp-btn--lg" to="/t/auth">
                    Already invited? Sign in
                  </Link>
                )}
              </div>
              <p className="lp-fine">
                {signupsOpen
                  ? "£14 for 14 days, then £49 every 30 days. Cancel anytime before day 14 — no £49 charge."
                  : "We’re testing with a small group of UK tradies. Public trials open soon."}
              </p>
            </div>

            <div className="lp-hero-visual" aria-hidden="true">
              <PhoneMock />
            </div>
          </div>
        </section>

        <section className="lp-section lp-comic-section" id="story">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-eyebrow">A familiar Friday</p>
              <h2>You never know which missed call is the valuable one</h2>
              <p className="lp-section-lede">
                One unanswered ring can be a neighbour with a drip — or a facilities manager with a
                block of flats and an insurer waiting on a quote.
              </p>
            </div>

            <div className="lp-comic" role="img" aria-label="Four-panel comic: a plumber misses a call while under a sink, the caller moves on, then TradiesMate recovers the enquiry by SMS.">
              <ComicPanel
                n="01"
                title="Hands full"
                caption="Under the sink. Water everywhere. Phone ringing on the van seat."
              >
                <PanelUnderSink />
              </ComicPanel>
              <ComicPanel
                n="02"
                title="They move on"
                caption="Three rings. Voicemail. The next plumber on Google gets the call."
              >
                <PanelCallerGivesUp />
              </ComicPanel>
              <ComicPanel
                n="03"
                title="Not a small job"
                caption="Landlord. Insurance claim. Multiple properties. Work that pays for itself."
              >
                <PanelBigClient />
              </ComicPanel>
              <ComicPanel
                n="04"
                title="TradiesMate steps in"
                caption="We text them back, ask what they need and the postcode — then put the job on your phone."
                accent
              >
                <PanelRescued />
              </ComicPanel>
            </div>

            <p className="lp-comic-moral">
              Moral: you can&apos;t answer every call on the tools. You <em>can</em> stop losing the
              ones that matter.
            </p>
          </div>
        </section>

        <section className="lp-section lp-problems">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-eyebrow">The real cost of admin</p>
              <h2>Missed calls are only half the story</h2>
            </div>
            <div className="lp-problem-grid">
              <article className="lp-problem">
                <h3>Quotes wait until tonight</h3>
                <p>
                  You finish the day, open Notes, guess the prices, and type a quote on your phone.
                  By then the customer has already spoken to someone else.
                </p>
              </article>
              <article className="lp-problem">
                <h3>Chasing falls through the cracks</h3>
                <p>
                  Accepted quotes sit unpaid. Reminders live in your head. Cash arrives when you
                  remember to nag — not when the job is done.
                </p>
              </article>
              <article className="lp-problem">
                <h3>Paperwork eats evenings</h3>
                <p>
                  Invoices, certificates, diary clashes, follow-ups. The paid work is done. The unpaid
                  office shift is just starting.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section lp-how" id="how">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-eyebrow">How it works</p>
              <h2>From missed call to money in three steps</h2>
              <p className="lp-section-lede">
                Built for the van — not a desk. Divert missed calls, speak the job, get paid, and keep
                paperwork moving while you&apos;re on the tools.
              </p>
            </div>

            <ol className="lp-steps">
              <li className="lp-step">
                <span className="lp-step-num">1</span>
                <div>
                  <h3>Rescue the enquiry</h3>
                  <p>
                    You get a dedicated UK number and divert missed calls to it. TradiesMate texts the
                    caller back, qualifies the job by SMS (or takes a voicemail), and drops a clean lead
                    onto your Jobs list.
                  </p>
                </div>
              </li>
              <li className="lp-step">
                <span className="lp-step-num">2</span>
                <div>
                  <h3>Draft the quote from the van</h3>
                  <p>
                    Type a few notes or record a voice memo. TradiesMate drafts line items from your
                    rates, so you can tweak prices and send a proper GBP quote with VAT.
                  </p>
                </div>
              </li>
              <li className="lp-step">
                <span className="lp-step-num">3</span>
                <div>
                  <h3>Send, get paid, keep the diary straight</h3>
                  <p>
                    Customer gets an SMS link to accept or decline. Auto-reminders chase. Raise a
                    bank-transfer invoice or take a card deposit with Pay Now — then book the job in
                    your diary and issue certificates when the work&apos;s done.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="lp-section lp-features" id="features">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-eyebrow">What you get</p>
              <h2>Everything a busy UK tradie actually needs</h2>
            </div>
            <ul className="lp-feature-grid">
              <li>
                <strong>Your TradiesMate number</strong>
                <span>Dedicated UK number with call divert — missed calls hit us, not your voicemail abyss.</span>
              </li>
              <li>
                <strong>Missed-call rescue</strong>
                <span>We text callers back and qualify the job by SMS, or take a voicemail and turn it into a job.</span>
              </li>
              <li>
                <strong>Voice &amp; notes to quote</strong>
                <span>Speak the job or type it. Your price book fills the lines — edit, then send.</span>
              </li>
              <li>
                <strong>Quotes, invoices &amp; Pay Now</strong>
                <span>SMS accept links, bank-transfer invoices, and optional card deposits via Stripe.</span>
              </li>
              <li>
                <strong>Diary &amp; reminders</strong>
                <span>Book jobs on your phone. Quote chase and invoice reminders run while you&apos;re on the tools.</span>
              </li>
              <li>
                <strong>Certificates</strong>
                <span>Fill, sign, and send common trade certs from the same job — no separate paperwork app.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-section lp-audience">
          <div className="lp-wrap lp-audience-inner">
            <div>
              <p className="lp-eyebrow">Who it&apos;s for</p>
              <h2>Plumbers, electricians, heating engineers — and the rest of the trades</h2>
              <p>
                Starter rates for call-outs, combi swaps, EICRs and more. Capture enquiries from
                missed calls, your website widget, or email to your{" "}
                <code>@in.tradiesmate.co.uk</code> address. Sign in with a one-time text — no
                password to forget on site.
              </p>
            </div>
            <ul className="lp-trade-tags" aria-label="Example trades">
              <li>Plumbing</li>
              <li>Heating</li>
              <li>Electrical</li>
              <li>Roofing</li>
              <li>Decorating</li>
              <li>Locksmith</li>
            </ul>
          </div>
        </section>

        <section className="lp-section lp-faq" id="faq" aria-labelledby="faq-heading">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-eyebrow">FAQ</p>
              <h2 id="faq-heading">Common questions</h2>
            </div>
            <div className="lp-faq-list">
              <details className="lp-faq-item">
                <summary>What is TradiesMate?</summary>
                <p>
                  Software for UK tradespeople. You get a dedicated UK number to divert missed calls
                  to, SMS job qualification, van-friendly quotes from your rates, payment chase, Pay
                  Now card deposits, a job diary, and certificates — in one place.
                </p>
              </details>
              <details className="lp-faq-item">
                <summary>How does missed-call rescue work?</summary>
                <p>
                  Divert missed calls to your TradiesMate number. Callers get an SMS to qualify the
                  job (or leave a voicemail), and a clean lead lands on your Jobs list.
                </p>
              </details>
              <details className="lp-faq-item">
                <summary>How much does it cost?</summary>
                <p>
                  £14 for a 14-day trial, then £49 every 30 days unless you cancel. Cancel before day
                  14 to avoid the £49 charge.
                </p>
              </details>
              <details className="lp-faq-item">
                <summary>Who is it for?</summary>
                <p>
                  Plumbers, electricians, heating engineers, roofers, decorators, locksmiths, and
                  other UK trades who lose work when they can&apos;t answer on the tools.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="lp-cta-band">
          <div className="lp-wrap lp-cta-inner">
            <h2>Stop losing work while you&apos;re doing the work</h2>
            <p>
              {signupsOpen
                ? "Start a £14 trial for 14 days. Rescue missed calls, quote from the van, take deposits, keep the diary and certs in one place. Then £49 every 30 days unless you cancel."
                : "We’re in private beta while we harden the product. Request early access, or sign in if you’re already on the list."}
            </p>
            <div className="lp-hero-cta">
              {signupsOpen ? (
                <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/signup">
                  Start £14 trial
                </Link>
              ) : (
                <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={openEarlyAccess}>
                  Request early access
                </button>
              )}
              <Link className="lp-btn lp-btn--ghost lp-btn--lg lp-btn--on-dark" to="/t/auth">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-brand-mark" aria-hidden="true">
              TM
            </span>
            <div>
              <strong>TradiesMate</strong>
              <p>Missed-call rescue, quoting, payments, diary and certs for UK trades.</p>
            </div>
          </div>
          <div className="lp-footer-links">
            {signupsOpen ? (
              <Link to="/signup">Start £14 trial</Link>
            ) : (
              <button type="button" className="lp-footer-btn" onClick={openEarlyAccess}>
                Request early access
              </button>
            )}
            <a href="mailto:hello@tradiesmate.co.uk">Contact</a>
          </div>
          <p className="lp-footer-note">© {new Date().getFullYear()} TradiesMate. Made for the tools, not the desk.</p>
        </div>
      </footer>

      {earlyAccessOpen && <EarlyAccessModal onClose={() => setEarlyAccessOpen(false)} />}
    </div>
  );
}

function EarlyAccessModal({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [occupation, setOccupation] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"new" | "pending" | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await tradieApi.requestEarlyAccess({ email, occupation, phone });
      setDone(result.alreadyPending ? "pending" : "new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp-modal-root" role="presentation" onClick={onClose}>
      <div
        className="lp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="lp-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {done ? (
          <div className="lp-modal-body">
            <p className="lp-eyebrow">Thanks</p>
            <h2 id={titleId}>{done === "pending" ? "You’re already on the list" : "Request received"}</h2>
            <p>
              {done === "pending"
                ? "We’ve already got a request for this email or mobile. We’ll be in touch when a spot opens."
                : "We’ll review your request and text you a one-time signup link if you’re approved."}
            </p>
            <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="lp-modal-body" onSubmit={submit}>
            <p className="lp-eyebrow">Private beta</p>
            <h2 id={titleId}>Request early access</h2>
            <p>Tell us how to reach you. If approved, you’ll get a one-time link to create your account.</p>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Occupation
              <input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="Plumber"
                required
              />
            </label>
            <label>
              Mobile
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07…"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>
            {error && <p className="lp-modal-error">{error}</p>}
            <button type="submit" className="lp-btn lp-btn--primary lp-btn--lg" disabled={busy}>
              {busy ? "Sending…" : "Submit request"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ComicPanel({
  n,
  title,
  caption,
  children,
  accent,
}: {
  n: string;
  title: string;
  caption: string;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <figure className={`lp-panel${accent ? " lp-panel--accent" : ""}`}>
      <div className="lp-panel-art">{children}</div>
      <figcaption>
        <span className="lp-panel-n">{n}</span>
        <strong>{title}</strong>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

function PhoneMock() {
  return (
    <div className="lp-phone">
      <img
        className="lp-phone-art"
        src="/images/story/hero-phone.webp"
        alt="TradiesMate Jobs screen: Martin £186 leak job and a missed-call alert"
        width={900}
        height={1200}
        decoding="async"
      />
    </div>
  );
}

/* ---------- Story panels (editorial artwork) ---------- */

function PanelUnderSink() {
  return (
    <img
      src="/images/story/hands-full.webp"
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}

function PanelCallerGivesUp() {
  return (
    <img
      src="/images/story/they-move-on.webp"
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}

function PanelBigClient() {
  return (
    <img
      src="/images/story/not-a-small-job.webp"
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}

function PanelRescued() {
  return (
    <img
      src="/images/story/tradiesmate-steps-in.webp"
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}
