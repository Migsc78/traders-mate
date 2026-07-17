import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "../landing.css";

export default function LandingPage() {
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
            <a href="#story">The problem</a>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
          </nav>
          <div className="lp-nav-actions">
            <Link className="lp-link-quiet" to="/t/auth">
              Sign in
            </Link>
            <Link className="lp-btn lp-btn--primary" to="/signup">
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">Built for UK trades</p>
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
                <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/signup">
                  Start your free 14-day trial
                </Link>
                <Link className="lp-btn lp-btn--ghost lp-btn--lg" to="/t/auth">
                  Sign in
                </Link>
              </div>
              <p className="lp-fine">No password. Sign up with a text code. Cancel anytime.</p>
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
                  Invoices, VAT, bank details, follow-ups. The work you got paid to do is done. The
                  unpaid office shift is just starting.
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
                Built for the van — not a desk. Speak the job, send the quote, keep chasing while
                you&apos;re on the tools.
              </p>
            </div>

            <ol className="lp-steps">
              <li className="lp-step">
                <span className="lp-step-num">1</span>
                <div>
                  <h3>Rescue the enquiry</h3>
                  <p>
                    Missed-call rescue texts the caller back, qualifies the job by SMS, and drops a
                    clean lead onto your Jobs list — with postcode and distance when you&apos;ve set
                    your base.
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
                  <h3>Send, chase, invoice</h3>
                  <p>
                    Customer gets an SMS link to accept or decline. Automatic reminders follow up.
                    When they say yes, raise a bank-transfer invoice and let reminders do the
                    chasing.
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
                <strong>Missed-call rescue</strong>
                <span>We text callers back and qualify the job by SMS — using your Twilio number.</span>
              </li>
              <li>
                <strong>Voice &amp; notes to quote</strong>
                <span>Speak the job or type it. Your price book fills the lines.</span>
              </li>
              <li>
                <strong>SMS quotes &amp; invoices</strong>
                <span>Customers open a link to accept, decline, or mark a bank transfer as paid.</span>
              </li>
              <li>
                <strong>Automatic reminders</strong>
                <span>Quote chase on day 2, 5 and 10. Invoice reminders on day 3 and 7.</span>
              </li>
              <li>
                <strong>VAT-ready GBP totals</strong>
                <span>UK bank details, sort code, and VAT number on customer-facing invoices.</span>
              </li>
              <li>
                <strong>No password login</strong>
                <span>Sign in with a one-time text code. Works from your phone in the van.</span>
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
                <code>@in.tradiesmate.co.uk</code> address.
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

        <section className="lp-cta-band">
          <div className="lp-wrap lp-cta-inner">
            <h2>Stop losing work while you&apos;re doing the work</h2>
            <p>
              Start a free 14-day trial. Quote from the van. Chase by SMS. Get paid via bank
              transfer — you confirm when the money lands.
            </p>
            <div className="lp-hero-cta">
              <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/signup">
                Start free trial
              </Link>
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
              <p>Quoting, missed-call rescue, and SMS chase for UK trades.</p>
            </div>
          </div>
          <div className="lp-footer-links">
            <Link to="/signup">Start free trial</Link>
            <Link to="/t/auth">Sign in</Link>
          </div>
          <p className="lp-footer-note">© {new Date().getFullYear()} TradiesMate. Made for the tools, not the desk.</p>
        </div>
      </footer>
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
      <div className="lp-phone-bezel">
        <div className="lp-phone-notch" />
        <div className="lp-phone-screen">
          <div className="lp-phone-top">
            <span>Jobs</span>
            <span className="lp-pill">New</span>
          </div>
          <div className="lp-phone-card">
            <div className="lp-phone-card-row">
              <strong>Martin</strong>
              <span className="lp-money">£186</span>
            </div>
            <p>GU22 7XH · ~2.4 mi</p>
            <p className="lp-snip">Fix a leak under the kitchen sink</p>
          </div>
          <div className="lp-phone-card lp-phone-card--muted">
            <div className="lp-phone-card-row">
              <strong>Priya</strong>
              <span className="lp-pill lp-pill--sent">Sent</span>
            </div>
            <p>KT14 · Combi swap quote</p>
          </div>
          <div className="lp-phone-sms">
            <p>
              <strong>TradiesMate</strong>
            </p>
            <p>New job from missed call: Martin (GU22 7XH). Fix a leak.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Comic panels (editorial SVG) ---------- */

function PanelUnderSink() {
  return (
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <rect width="320" height="220" fill="#f7f4ee" />
      <rect x="18" y="28" width="160" height="14" rx="3" fill="#d9d3c6" />
      <rect x="40" y="42" width="116" height="78" rx="6" fill="#ebe6db" stroke="#131c26" strokeWidth="2.5" />
      <ellipse cx="98" cy="78" rx="28" ry="12" fill="#c8e8f5" opacity="0.7" />
      <path d="M86 90c4 18 8 34 10 48" stroke="#3aa0c8" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M108 88c-2 16 2 32 6 46" stroke="#5bb8d8" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="96" cy="148" r="7" fill="#7ec8e0" opacity="0.85" />
      <circle cx="114" cy="156" r="5" fill="#7ec8e0" opacity="0.7" />
      <circle cx="88" cy="162" r="4" fill="#7ec8e0" opacity="0.55" />
      {/* plumber */}
      <ellipse cx="210" cy="168" rx="42" ry="14" fill="#e4dfd4" />
      <path d="M178 120c8-28 28-40 48-36 14 3 28 18 30 42l-6 48h-66l-6-54z" fill="#ff5a1f" stroke="#131c26" strokeWidth="2.2" />
      <circle cx="228" cy="86" r="18" fill="#f0c9a0" stroke="#131c26" strokeWidth="2.2" />
      <path d="M214 82h8M234 82h8" stroke="#131c26" strokeWidth="2" strokeLinecap="round" />
      <path d="M220 94c4 4 10 4 14 0" stroke="#131c26" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M168 138c-18 6-28 18-30 28" stroke="#131c26" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M252 136c16 10 28 8 36 2" stroke="#131c26" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* phone ringing */}
      <rect x="248" y="48" width="42" height="68" rx="8" fill="#131c26" />
      <rect x="252" y="56" width="34" height="48" rx="3" fill="#f5f3ee" />
      <path d="M268 36c8-6 18-6 26 0M272 28c10-8 22-8 32 0" stroke="#ff5a1f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <text x="24" y="204" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        Van seat · 11:42
      </text>
    </svg>
  );
}

function PanelCallerGivesUp() {
  return (
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <rect width="320" height="220" fill="#fbfaf7" />
      <rect x="36" y="36" width="140" height="150" rx="16" fill="#131c26" />
      <rect x="44" y="48" width="124" height="116" rx="6" fill="#f5f3ee" />
      <circle cx="106" cy="92" r="22" fill="#e8e4da" stroke="#131c26" strokeWidth="2" />
      <text x="62" y="136" fill="#131c26" fontFamily="Archivo, sans-serif" fontSize="13" fontWeight="700">
        Dave Plumbing
      </text>
      <text x="72" y="154" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        No answer…
      </text>
      <path d="M200 70h84" stroke="#e8e4da" strokeWidth="8" strokeLinecap="round" />
      <path d="M200 98h64" stroke="#e8e4da" strokeWidth="8" strokeLinecap="round" />
      <path d="M200 126h76" stroke="#e8e4da" strokeWidth="8" strokeLinecap="round" />
      <g transform="translate(210 150)">
        <rect width="88" height="36" rx="8" fill="#ff5a1f" />
        <text x="14" y="23" fill="#fff" fontFamily="Archivo, sans-serif" fontSize="12" fontWeight="700">
          Next result
        </text>
      </g>
      <text x="24" y="204" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        Customer scrolls on
      </text>
    </svg>
  );
}

function PanelBigClient() {
  return (
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <rect width="320" height="220" fill="#f7f4ee" />
      {/* building */}
      <rect x="40" y="56" width="100" height="120" fill="#ebe6db" stroke="#131c26" strokeWidth="2.5" />
      <rect x="52" y="72" width="22" height="22" fill="#c5d8f0" stroke="#131c26" strokeWidth="1.5" />
      <rect x="82" y="72" width="22" height="22" fill="#c5d8f0" stroke="#131c26" strokeWidth="1.5" />
      <rect x="112" y="72" width="16" height="22" fill="#c5d8f0" stroke="#131c26" strokeWidth="1.5" />
      <rect x="52" y="106" width="22" height="22" fill="#c5d8f0" stroke="#131c26" strokeWidth="1.5" />
      <rect x="82" y="106" width="22" height="22" fill="#c5d8f0" stroke="#131c26" strokeWidth="1.5" />
      <rect x="78" y="148" width="28" height="28" fill="#131c26" />
      {/* clipboard */}
      <rect x="168" y="48" width="120" height="140" rx="8" fill="#fff" stroke="#131c26" strokeWidth="2.5" />
      <rect x="196" y="40" width="64" height="16" rx="4" fill="#ff5a1f" />
      <text x="184" y="84" fill="#131c26" fontFamily="Archivo, sans-serif" fontSize="13" fontWeight="800">
        Insurance claim
      </text>
      <text x="184" y="106" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        Escape of water
      </text>
      <text x="184" y="128" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        Landlord portfolio
      </text>
      <path d="M184 148h88" stroke="#e8e4da" strokeWidth="6" strokeLinecap="round" />
      <path d="M184 166h64" stroke="#e8e4da" strokeWidth="6" strokeLinecap="round" />
      <text x="24" y="204" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        Not just a tap washer
      </text>
    </svg>
  );
}

function PanelRescued() {
  return (
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <rect width="320" height="220" fill="#fff4ee" />
      <rect x="36" y="40" width="248" height="128" rx="16" fill="#fff" stroke="#131c26" strokeWidth="2.5" />
      <circle cx="68" cy="72" r="16" fill="#ff5a1f" />
      <text x="60" y="77" fill="#fff" fontFamily="Archivo, sans-serif" fontSize="11" fontWeight="800">
        TM
      </text>
      <text x="96" y="68" fill="#131c26" fontFamily="Archivo, sans-serif" fontSize="14" fontWeight="800">
        Missed-call rescue
      </text>
      <text x="96" y="88" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        SMS to customer
      </text>
      <rect x="52" y="108" width="216" height="40" rx="8" fill="#f5f3ee" />
      <text x="64" y="126" fill="#131c26" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        Hi — sorry we missed your call.
      </text>
      <text x="64" y="142" fill="#131c26" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        What do you need and your postcode?
      </text>
      <path d="M250 178c12 0 22 8 22 18" stroke="#0d8a4e" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M262 188l6 6 12-14" stroke="#0d8a4e" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x="24" y="204" fill="#5c6672" fontFamily="Instrument Sans, sans-serif" fontSize="11">
        Job saved · on your phone
      </text>
    </svg>
  );
}
