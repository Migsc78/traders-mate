import type { SiteData } from "./siteData.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function attr(s: string): string {
  return esc(s).replace(/'/g, "&#39;");
}
function telHref(phone: string): string {
  return "tel:" + phone.replace(/[^+\d]/g, "");
}
function stars(n: number): string {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}
function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 &]/g, "").split(/\s+/).filter(Boolean).filter((w) => !/^(and|the|ltd|limited|&)$/i.test(w));
  const letters = (words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "");
  return letters.toUpperCase() || "TM";
}

// --- Icon library (24x24). SOLID names render filled; others are line icons. ---
const SOLID = new Set(["bolt", "droplet", "flame", "leaf", "star"]);
const ICON: Record<string, string> = {
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  flame: '<path d="M12 2c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 .8-3.2 2-4.2C10 9.5 10.5 7 12 2z"/>',
  leaf: '<path d="M4 20c8 2 16-4 16-14C10 6 4 12 4 20z"/>',
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 16.9 6.8 19.2l1-5.9L3.5 9.2l5.9-.9z"/>',
  wrench: '<path d="M15.5 6.5a4 4 0 0 0-5.3 4.8L4 17.5 6.5 20l6.2-6.2a4 4 0 0 0 4.8-5.3l-2.6 2.6-2-2z"/>',
  shield: '<path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  medal: '<circle cx="12" cy="9" r="5.5"/><path d="M9 13.5L7 22l5-3 5 3-2-8.5"/>',
  pound: '<path d="M8 21h9"/><path d="M9 21c1.5-1 1.5-3 1.5-4.5V9a3.5 3.5 0 0 1 6.5-1.8M6 13h7"/>',
  pin: '<path d="M12 21s6.5-5 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 16 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  phone: '<path d="M6 3h3l2 5-2.4 1.4a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4 5.2 2 2 0 0 1 6 3z"/>',
  panel: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  ev: '<rect x="3" y="9" width="12" height="8" rx="1.5"/><path d="M6 9l1.5-3h6L15 9M6 17v2M12 17v2M18 8v6a2 2 0 0 0 4 0v-3l-2-2"/>',
  bath: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M6 12V6a2 2 0 0 1 3.9-.5M5 19l1 2M19 19l-1 2"/>',
  thermo: '<path d="M14 14V6a2 2 0 0 0-4 0v8a3.5 3.5 0 1 0 4 0z"/><path d="M12 14V8"/>',
  radiator: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M8 6v12M12 6v12M16 6v12M5 20h14"/>',
  roof: '<path d="M3 12l9-8 9 8"/><path d="M6 10.5V20h12v-9.5"/><path d="M10 20v-4h4v4"/>',
  tiles: '<path d="M3 8l3-2.5L9 8l3-2.5L15 8l3-2.5L21 8M3 14l3-2.5L9 14l3-2.5L15 14l3-2.5L21 14"/>',
  gutter: '<path d="M4 8h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 15v4M12 14v6M16 15v4"/>',
  roller: '<rect x="4" y="4.5" width="13" height="5.5" rx="1.5"/><path d="M17 7h3v3h-6v3a2 2 0 0 1-2 2h-1v5"/>',
  brush: '<path d="M14 3l7 7-3.5 2.2L11.8 6.5z"/><path d="M11 8l-6.2 6.2a3 3 0 1 0 4.2 4.2L15 12"/>',
  swatch: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  bucket: '<path d="M5 8h14l-1.4 11.5a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M5 8c0-1.7 3.1-3 7-3s7 1.3 7 3"/>',
  frame: '<path d="M4 21V6l8-3 8 3v15"/><path d="M4 10.5h16M12 3v18M4 15.5h16"/>',
  trowel: '<path d="M3 3l7 2.5-4.5 4.5z"/><path d="M9.5 10.5l4 4 6.5-9.5a1.5 1.5 0 0 0-2-2z"/>',
  shovel: '<path d="M12 2v10M10 2h4"/><path d="M8.5 12h7l-1 4.5a2.5 2.5 0 0 1-5 0z"/>',
  brick: '<path d="M3 6.5h18v3.5H3zM3 10h18v3.5H3zM3 13.5h18V17H3z"/><path d="M9 6.5V10M15 10v3.5M6 13.5V17M12 6.5V10M18 13.5V17"/>',
  fence: '<path d="M6 21V9l2-3 2 3v12M14 21V9l2-3 2 3v12M4 13h16M4 17h16"/>',
  tree: '<path d="M12 22v-5"/><path d="M12 17a5 5 0 0 0 4.6-6.9A4.5 4.5 0 0 0 12 4a4.5 4.5 0 0 0-4.6 6.1A5 5 0 0 0 12 17z"/>',
};

function icon(name: string, cls = ""): string {
  const body = ICON[name] || ICON.wrench;
  if (SOLID.has(name)) {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
  }
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function renderSite(d: SiteData): string {
  const townInTitle = d.town && d.town !== "your area" ? ` in ${d.town}` : "";
  const title = `${esc(d.businessName)} | ${d.tradeTitle}${esc(townInTitle)}`;
  const description = `${esc(d.businessName)} — trusted ${d.tradeTitle.toLowerCase()} serving ${esc(
    d.town
  )}. ${esc(d.heroSub)} Call ${esc(d.phone)} for a free quote.`;
  const canonical = d.domain ? `https://${d.domain}` : "";
  const tel = telHref(d.phone);
  const routed = Boolean(d.routeKey && d.intakeBase);
  const base = d.intakeBase || "";
  const callHref = routed ? `${base}/c/${d.routeKey}/call` : tel;
  const waHref = routed ? `${base}/c/${d.routeKey}/whatsapp` : (d.whatsapp ? `https://wa.me/${d.whatsapp.replace(/[^\d]/g, "")}` : "");
  const mapQuery = encodeURIComponent(d.address || `${d.businessName} ${d.town}`);
  const mono = initials(d.businessName);
  const satisfaction = d.rating ? Math.round((d.rating / 5) * 100) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: d.businessName,
    description: `${d.tradeTitle} serving ${d.town}`,
    telephone: d.phone || undefined,
    email: d.email || undefined,
    address: d.address
      ? { "@type": "PostalAddress", streetAddress: d.address, addressLocality: d.town, addressCountry: "GB" }
      : undefined,
    areaServed: d.areas,
    url: canonical || undefined,
    aggregateRating:
      d.rating && d.reviewCount
        ? { "@type": "AggregateRating", ratingValue: d.rating, reviewCount: d.reviewCount }
        : undefined,
  };

  const servicesHtml = d.services
    .map(
      (s, i) => `
        <article class="service reveal" style="--i:${i}">
          <span class="svc-icon">${icon(s.icon || "wrench")}</span>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.desc)}</p>
          <span class="svc-arrow" aria-hidden="true">→</span>
        </article>`
    )
    .join("");

  const stepsHtml = d.steps
    .map(
      (s, i) => `
        <div class="step reveal" style="--i:${i}">
          <span class="step-num">${i + 1}</span>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.desc)}</p>
        </div>`
    )
    .join("");

  const galleryHtml = d.services
    .slice(0, 6)
    .concat(d.services.slice(0, 6))
    .slice(0, 6)
    .map(
      (s, i) => `
        <figure class="tile tile-${(i % 3) + 1} reveal" style="--i:${i}">
          <span class="tile-icon">${icon(s.icon || d.brandIcon)}</span>
          <figcaption>${esc(s.title)}</figcaption>
        </figure>`
    )
    .join("");

  const reviewsHtml = d.reviews
    .map(
      (r, i) => `
        <figure class="review reveal" style="--i:${i}">
          <div class="review-top"><span class="g-badge">G</span><div class="stars">${stars(r.rating)}</div></div>
          <blockquote>${esc(r.text)}</blockquote>
          <figcaption><span class="avatar">${esc((r.name[0] || "?").toUpperCase())}</span>${esc(r.name)}</figcaption>
        </figure>`
    )
    .join("");

  const areasHtml = d.areas.map((a) => `<li>${icon("pin")}${esc(a)}</li>`).join("");

  const stats = [
    d.rating ? { value: d.rating.toFixed(1), label: "Average rating", num: true } : { value: "5★", label: "Top rated", num: false },
    d.reviewCount ? { value: String(d.reviewCount), label: "Google reviews", num: true, plus: false } : { value: "100%", label: "Recommended", num: false },
    satisfaction ? { value: String(satisfaction), label: "Would recommend", num: true, suffix: "%" } : { value: "24/7", label: "Availability", num: false },
    { value: "Free", label: "No-obligation quotes", num: false },
  ];
  const statsHtml = stats
    .map((s) => {
      const suffix = (s as { suffix?: string }).suffix || "";
      const dataCount = s.num ? ` data-count="${s.value}" data-suffix="${suffix}"` : "";
      const shown = s.num ? `0${suffix}` : s.value;
      return `<div class="stat reveal"><strong${dataCount}>${shown}</strong><span>${esc(s.label)}</span></div>`;
    })
    .join("");

  const whatsappBtn = waHref
    ? `<a class="btn btn-ghost" href="${attr(waHref)}">WhatsApp</a>`
    : "";
  const heroRating = d.rating
    ? `<div class="hero-rating"><div class="hr-score">${d.rating.toFixed(1)}</div><div class="hr-meta"><div class="stars">${stars(
        d.rating
      )}</div><span>${d.reviewCount ? d.reviewCount + " Google reviews" : "Rated on Google"}</span></div></div>`
    : "";

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${attr(description)}" />
${canonical ? `<link rel="canonical" href="${attr(canonical)}" />` : ""}
<meta property="og:title" content="${attr(title)}" />
<meta property="og:description" content="${attr(description)}" />
<meta property="og:type" content="website" />
<meta name="theme-color" content="${attr(d.primaryColor)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
:root{--primary:${d.primaryColor};--accent:${d.accentColor};--ink:#0f172a;--muted:#5a6474;--line:#e8ecf3;--bg:#fff;--soft:#f6f8fc;--radius:18px;--shadow:0 18px 44px -20px rgba(15,23,42,.28)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);line-height:1.6;background:var(--bg);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.container{width:min(1160px,92%);margin:0 auto}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.eyebrow.dark{color:var(--primary)}
.stars{color:#ffb400;letter-spacing:2px;font-size:.95rem}
.btn{display:inline-flex;align-items:center;gap:8px;padding:15px 26px;border-radius:999px;font-weight:700;font-size:1rem;transition:transform .15s ease,box-shadow .15s ease;cursor:pointer;border:none}
.btn svg{width:18px;height:18px}
.btn-call{background:var(--accent);color:#111;box-shadow:0 12px 26px -10px var(--accent)}
.btn-call:hover{transform:translateY(-2px)}
.btn-ghost{background:rgba(255,255,255,.12);color:#fff;border:1.5px solid rgba(255,255,255,.45)}
.btn-ghost:hover{background:rgba(255,255,255,.2)}
.btn-dark{background:var(--primary);color:#fff}
.btn-dark:hover{transform:translateY(-2px)}
/* header */
header.site{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.9);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid transparent;transition:box-shadow .25s,border-color .25s}
header.site.scrolled{box-shadow:0 8px 30px -18px rgba(15,23,42,.4);border-color:var(--line)}
.nav{display:flex;align-items:center;justify-content:space-between;padding:14px 0;gap:16px}
.logo{display:flex;align-items:center;gap:11px;font-weight:800;font-size:1.08rem;color:var(--ink)}
.mono{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:.95rem;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 60%,#000));position:relative;overflow:hidden}
.mono .mono-ic{position:absolute;right:-6px;bottom:-6px;width:26px;height:26px;color:var(--accent);opacity:.9}
.logo small{display:block;font-size:.68rem;font-weight:600;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-top:1px}
.nav-links{display:none;gap:26px;font-weight:600;font-size:.95rem}
.nav-links a{color:var(--ink);opacity:.8}
.nav-links a:hover{opacity:1;color:var(--primary)}
.nav-call{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;padding:10px 18px;border-radius:999px;font-weight:700;font-size:.92rem}
.nav-call svg{width:16px;height:16px}
/* hero */
.hero{position:relative;overflow:hidden;color:#fff;background:radial-gradient(120% 120% at 85% 0%,color-mix(in srgb,var(--primary) 75%,#fff 0%) 0,var(--primary) 45%,color-mix(in srgb,var(--primary) 55%,#000) 100%)}
.hero::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.06) 1.5px,transparent 1.5px);background-size:22px 22px;opacity:.6}
.hero .orb{position:absolute;border-radius:50%;filter:blur(60px);opacity:.5}
.hero .orb-a{width:340px;height:340px;background:var(--accent);top:-120px;right:-60px;opacity:.28}
.hero .orb-b{width:300px;height:300px;background:#fff;bottom:-140px;left:-80px;opacity:.08}
.hero-grid{position:relative;display:grid;grid-template-columns:1fr;gap:40px;padding:56px 0 66px;align-items:center}
.hero h1{font-size:clamp(2.1rem,5.4vw,3.5rem);line-height:1.08;letter-spacing:-.02em;margin:16px 0 16px;font-weight:800}
.hero h1 .hl{color:var(--accent)}
.hero .sub{font-size:1.12rem;opacity:.92;max-width:560px}
.hero .cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.hero .chips{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:26px;font-size:.9rem;font-weight:600;opacity:.95}
.hero .chips span{display:inline-flex;align-items:center;gap:7px}
.hero .chips svg{width:17px;height:17px;color:var(--accent)}
/* hero visual */
.hero-card{position:relative;overflow:hidden;background:linear-gradient(160deg,rgba(255,255,255,.15),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.2);border-radius:26px;padding:30px;backdrop-filter:blur(6px);animation:floaty 7s ease-in-out infinite}
.hero-watermark{position:absolute;right:-14px;top:-12px;width:150px;height:150px;color:var(--accent);opacity:.16;pointer-events:none}
.hc-inner{position:relative;z-index:1;display:flex;flex-direction:column;gap:18px}
.hero-badge{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);padding:10px 14px;border-radius:14px;font-weight:700;width:fit-content}
.hero-badge .bi{width:38px;height:38px;border-radius:11px;background:var(--accent);color:#111;display:grid;place-items:center;flex:none}
.hero-badge .bi svg{width:22px;height:22px}
.hero-rating{display:flex;align-items:center;gap:14px;background:#fff;color:var(--ink);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow)}
.hr-score{font-size:2.2rem;font-weight:800;line-height:1;color:var(--primary);flex:none}
.hr-meta .stars{font-size:1rem}
.hr-meta span{display:block;font-size:.82rem;color:var(--muted);margin-top:3px}
.hero-pills{display:flex;flex-wrap:wrap;gap:10px}
.hero-pills span{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.2);padding:8px 13px;border-radius:999px;font-weight:600;font-size:.85rem}
.hero-pills svg{width:15px;height:15px;color:var(--accent)}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
/* stats */
.stats{background:var(--soft);border-bottom:1px solid var(--line)}
.stats-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:22px;padding:34px 0}
.stat{text-align:center}
.stat strong{display:block;font-size:2rem;font-weight:800;color:var(--primary);line-height:1}
.stat span{font-size:.85rem;color:var(--muted);font-weight:600}
/* sections */
section{padding:76px 0}
.section-head{max-width:640px;margin:0 auto 44px;text-align:center}
.section-head h2{font-size:clamp(1.7rem,4vw,2.5rem);letter-spacing:-.02em;margin:12px 0 10px;font-weight:800}
.section-head p{color:var(--muted);font-size:1.05rem}
/* services */
.services{display:grid;grid-template-columns:1fr;gap:20px}
.service{position:relative;background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:28px;transition:transform .2s,box-shadow .2s,border-color .2s;overflow:hidden}
.service::before{content:"";position:absolute;left:0;top:0;height:4px;width:100%;background:linear-gradient(90deg,var(--primary),var(--accent));transform:scaleX(0);transform-origin:left;transition:transform .3s}
.service:hover{transform:translateY(-6px);box-shadow:var(--shadow);border-color:transparent}
.service:hover::before{transform:scaleX(1)}
.svc-icon{display:inline-grid;place-items:center;width:56px;height:56px;border-radius:15px;background:color-mix(in srgb,var(--primary) 10%,#fff);color:var(--primary);margin-bottom:16px;transition:transform .2s}
.service:hover .svc-icon{transform:scale(1.08) rotate(-4deg);background:var(--accent);color:#111}
.svc-icon svg{width:28px;height:28px}
.service h3{font-size:1.18rem;margin-bottom:6px}
.service p{color:var(--muted)}
.svc-arrow{position:absolute;right:22px;bottom:20px;color:var(--accent);font-weight:800;opacity:0;transform:translateX(-6px);transition:.25s}
.service:hover .svc-arrow{opacity:1;transform:none}
/* process */
.process{background:var(--soft)}
.steps{display:grid;grid-template-columns:1fr;gap:22px;counter-reset:step}
.step{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:28px;position:relative}
.step-num{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--primary);color:#fff;font-weight:800;font-size:1.1rem;margin-bottom:14px}
.step h3{margin-bottom:6px}
.step p{color:var(--muted)}
/* about + gallery */
.about-grid{display:grid;grid-template-columns:1fr;gap:34px;align-items:center}
.about-copy .feat{list-style:none;margin-top:20px;display:grid;gap:12px}
.about-copy .feat li{display:flex;gap:11px;align-items:flex-start;font-weight:600}
.about-copy .feat svg{width:22px;height:22px;color:#16a34a;flex:none;margin-top:1px}
.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.tile{position:relative;aspect-ratio:1/1;border-radius:16px;overflow:hidden;display:flex;align-items:flex-end;padding:16px;color:#fff}
.tile-icon{position:absolute;right:-10px;top:-10px;width:90px;height:90px;opacity:.22}
.tile-icon svg{width:100%;height:100%}
.tile figcaption{position:relative;font-weight:700;font-size:.92rem;background:rgba(0,0,0,.25);padding:6px 12px;border-radius:10px;backdrop-filter:blur(2px)}
.tile-1{background:linear-gradient(150deg,var(--primary),color-mix(in srgb,var(--primary) 55%,#000))}
.tile-2{background:linear-gradient(150deg,color-mix(in srgb,var(--primary) 80%,var(--accent)),var(--primary))}
.tile-3{background:linear-gradient(150deg,#334155,#0f172a)}
/* reviews */
.reviews{display:grid;grid-template-columns:1fr;gap:20px}
.review{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:26px;box-shadow:0 1px 0 rgba(15,23,42,.02)}
.review-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.g-badge{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-weight:800;color:#fff;background:conic-gradient(from -45deg,#ea4335,#fbbc05,#34a853,#4285f4,#ea4335);font-size:.9rem}
.review blockquote{font-size:1.02rem;color:#1f2937}
.review figcaption{display:flex;align-items:center;gap:10px;margin-top:16px;font-weight:700}
.avatar{width:34px;height:34px;border-radius:50%;background:color-mix(in srgb,var(--primary) 15%,#fff);color:var(--primary);display:grid;place-items:center;font-weight:800}
.placeholder-note{text-align:center;color:var(--muted);font-size:.85rem;margin-top:22px}
/* areas + guarantee */
.areas ul{list-style:none;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:8px}
.areas li{display:inline-flex;align-items:center;gap:7px;background:var(--soft);border:1px solid var(--line);padding:9px 16px;border-radius:999px;font-weight:600}
.areas li svg{width:15px;height:15px;color:var(--accent)}
.guarantee{background:linear-gradient(120deg,var(--primary),color-mix(in srgb,var(--primary) 60%,#000));color:#fff;border-radius:24px;padding:40px;text-align:center;position:relative;overflow:hidden}
.guarantee .g-ic{width:60px;height:60px;margin:0 auto 14px;color:var(--accent)}
.guarantee h2{font-size:clamp(1.5rem,3.5vw,2.1rem);margin-bottom:8px}
.guarantee p{opacity:.9;max-width:560px;margin:0 auto}
/* contact */
.contact{background:var(--soft)}
.contact-grid{display:grid;grid-template-columns:1fr;gap:28px}
.contact-info h2{font-size:clamp(1.6rem,4vw,2.4rem);letter-spacing:-.02em}
.contact-info .lead-line{font-size:1.08rem;color:var(--muted);margin:10px 0 22px}
.big-call{display:inline-flex;align-items:center;gap:12px;font-size:1.5rem;font-weight:800;color:var(--primary)}
.big-call .bc-ic{width:48px;height:48px;border-radius:14px;background:var(--accent);color:#111;display:grid;place-items:center}
.big-call .bc-ic svg{width:24px;height:24px}
.contact-line{display:flex;align-items:center;gap:10px;margin-top:14px;color:var(--muted);font-weight:600}
.contact-line svg{width:18px;height:18px;color:var(--primary)}
.map{margin-top:20px;border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.map iframe{width:100%;height:230px;border:0;display:block}
.form{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px;box-shadow:var(--shadow)}
.form h3{margin-bottom:6px}
.form .form-sub{color:var(--muted);font-size:.92rem;margin-bottom:8px}
.form label{display:block;font-weight:600;font-size:.88rem;margin:14px 0 5px}
.form input,.form textarea{width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:11px;font:inherit;background:var(--soft);transition:border-color .15s,background .15s}
.form input:focus,.form textarea:focus{outline:none;border-color:var(--primary);background:#fff}
.form .btn{margin-top:18px;width:100%;justify-content:center}
/* footer */
footer.site{background:#0b1220;color:#aeb8c9;padding:44px 0 90px;font-size:.92rem}
.footer-grid{display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:center}
footer .logo{color:#fff}
footer .logo small{color:#8a95a8}
footer a{color:#fff}
.footer-bottom{margin-top:26px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1);opacity:.75}
/* sticky mobile cta */
.mobile-cta{position:fixed;left:0;right:0;bottom:0;z-index:70;display:flex;gap:1px;box-shadow:0 -8px 24px -12px rgba(0,0,0,.4)}
.mobile-cta a{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:15px;font-weight:800;color:#111;background:var(--accent)}
.mobile-cta a.wa{background:#25d366;color:#fff}
.mobile-cta svg{width:18px;height:18px}
/* reveal */
.reveal{opacity:0;transform:translateY(26px);transition:opacity .6s ease,transform .6s ease;transition-delay:calc(var(--i,0) * 70ms)}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none}.hero-card{animation:none}}
@media(min-width:760px){
  .nav-links{display:flex}
  .hero-grid{grid-template-columns:1.05fr .95fr;padding:78px 0 90px}
  .stats-grid{grid-template-columns:repeat(4,1fr)}
  .services{grid-template-columns:repeat(2,1fr)}
  .steps{grid-template-columns:repeat(3,1fr)}
  .about-grid{grid-template-columns:1.05fr .95fr}
  .gallery{grid-template-columns:repeat(3,1fr)}
  .reviews{grid-template-columns:repeat(3,1fr)}
  .contact-grid{grid-template-columns:1fr 1fr}
  .mobile-cta{display:none}
}
@media(min-width:980px){.services{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<header class="site" id="hdr">
  <div class="container nav">
    <a class="logo" href="#top">
      <span class="mono">${esc(mono)}<span class="mono-ic">${icon(d.brandIcon)}</span></span>
      <span>${esc(d.businessName)}<small>${esc(d.tradeTitle)}${esc(townInTitle)}</small></span>
    </a>
    <nav class="nav-links">
      <a href="#services">Services</a>
      <a href="#process">How it works</a>
      <a href="#reviews">Reviews</a>
      <a href="#contact">Contact</a>
    </nav>
    <a class="nav-call" href="${attr(callHref)}">${icon("phone")}<span>${esc(d.phone)}</span></a>
  </div>
</header>

<section class="hero" id="top">
  <span class="orb orb-a"></span><span class="orb orb-b"></span>
  <div class="container hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">${icon(d.brandIcon)} ${esc(d.tradeTitle)}${d.town && d.town !== "your area" ? " · " + esc(d.town) : ""}</span>
      <h1>${esc(d.tagline)}</h1>
      <p class="sub">${esc(d.heroSub)}</p>
      <div class="cta">
        <a class="btn btn-call" href="${attr(callHref)}">${icon("phone")} Call ${esc(d.phone)}</a>
        <a class="btn btn-ghost" href="#contact">Get a free quote</a>
        ${whatsappBtn}
      </div>
      <div class="chips">
        <span>${icon("shield")} Fully insured</span>
        <span>${icon("pound")} Free quotes</span>
        <span>${icon("medal")} Workmanship guaranteed</span>
      </div>
    </div>
    <div class="hero-visual reveal">
      <div class="hero-card">
        <span class="hero-watermark">${icon(d.brandIcon)}</span>
        <div class="hc-inner">
          <div class="hero-badge"><span class="bi">${icon(d.brandIcon)}</span><span>${esc(d.tradeTitle)}${esc(townInTitle)}</span></div>
          ${heroRating}
          <div class="hero-pills"><span>${icon("shield")} Fully insured</span><span>${icon("pin")} Local &amp; trusted</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<div class="stats">
  <div class="container stats-grid">${statsHtml}</div>
</div>

<section id="services">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow dark">What we do</span>
      <h2>Expert ${esc(d.tradeTitle.toLowerCase())} services</h2>
      <p>Everything you need${d.town && d.town !== "your area" ? ", right here in " + esc(d.town) : ""} — done properly, first time.</p>
    </div>
    <div class="services">${servicesHtml}</div>
  </div>
</section>

<section id="process" class="process">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow dark">How it works</span>
      <h2>Getting started is simple</h2>
      <p>Three easy steps from first call to a job well done.</p>
    </div>
    <div class="steps">${stepsHtml}</div>
  </div>
</section>

<section id="about">
  <div class="container about-grid">
    <div class="about-copy reveal">
      <span class="eyebrow dark">About us</span>
      <h2 style="font-size:clamp(1.7rem,4vw,2.4rem);letter-spacing:-.02em;margin:12px 0 12px">Why ${esc(d.town && d.town !== "your area" ? d.town : "locals")} choose ${esc(d.businessName)}</h2>
      <p style="color:var(--muted)">${esc(d.about)}</p>
      <ul class="feat">
        <li>${icon("shield")} Fully insured and qualified for total peace of mind</li>
        <li>${icon("pound")} Clear, fixed quotes with no hidden surprises</li>
        <li>${icon("clock")} Reliable, on-time and tidy from start to finish</li>
        <li>${icon("medal")} Workmanship you can count on, guaranteed</li>
      </ul>
    </div>
    <div class="gallery">${galleryHtml}</div>
  </div>
</section>

<section id="reviews" class="reviews-section">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow dark">Reviews</span>
      <h2>Loved by local customers</h2>
      <p>${d.rating ? "Rated " + d.rating.toFixed(1) + " out of 5 on Google." : "What our customers say about us."}</p>
    </div>
    <div class="reviews">${reviewsHtml}</div>
    ${d.reviewsArePlaceeholder ? '<p class="placeholder-note">Example testimonials — replace with your real Google reviews before going live.</p>' : ""}
  </div>
</section>

<section class="areas">
  <div class="container">
    <div class="section-head reveal"><span class="eyebrow dark">Coverage</span><h2>Areas we cover</h2></div>
    <ul>${areasHtml}</ul>
  </div>
</section>

<section>
  <div class="container">
    <div class="guarantee reveal">
      <div class="g-ic">${icon("shield")}</div>
      <h2>Our promise to you</h2>
      <p>Turn up on time, tidy up after ourselves, and never leave until you're completely happy. That's the ${esc(d.businessName)} guarantee.</p>
    </div>
  </div>
</section>

<section id="contact" class="contact">
  <div class="container contact-grid">
    <div class="contact-info reveal">
      <span class="eyebrow dark">Get in touch</span>
      <h2>Get your free quote today</h2>
      <p class="lead-line">Call now or send a message — we'll get straight back to you.</p>
      <a class="big-call" href="${attr(callHref)}"><span class="bc-ic">${icon("phone")}</span>${esc(d.phone)}</a>
      ${d.email ? `<div class="contact-line">${icon("phone")}<a href="mailto:${attr(d.email)}">${esc(d.email)}</a></div>` : ""}
      ${d.address ? `<div class="contact-line">${icon("pin")}${esc(d.address)}</div>` : ""}
      <div class="map"><iframe loading="lazy" src="https://www.google.com/maps?q=${mapQuery}&output=embed" title="Map"></iframe></div>
    </div>
    <form class="form reveal" onsubmit="return sendEnquiry(event)">
      <input type="text" name="company" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
      <h3>Request a callback</h3>
      <p class="form-sub">No obligation — we'll call you straight back.</p>
      <label for="name">Your name</label>
      <input id="name" name="name" required />
      <label for="phone">Phone</label>
      <input id="phone" name="phone" required />
      <label for="postcode">Postcode</label>
      <input id="postcode" name="postcode" autocomplete="postal-code" placeholder="e.g. SW1A 1AA" />
      <label for="msg">What do you need?</label>
      <textarea id="msg" name="msg" rows="4"></textarea>
      <label for="photos">Photo of the problem (optional)</label>
      <input id="photos" name="photos" type="file" accept="image/*" multiple />
      <button class="btn btn-call" type="submit">Send enquiry ${icon("phone")}</button>
    </form>
  </div>
</section>

<footer class="site">
  <div class="container">
    <div class="footer-grid">
      <a class="logo" href="#top"><span class="mono">${esc(mono)}<span class="mono-ic">${icon(d.brandIcon)}</span></span><span>${esc(
    d.businessName
  )}<small>${esc(d.tradeTitle)}${esc(townInTitle)}</small></span></a>
      <a class="btn btn-call" href="${attr(callHref)}">${icon("phone")} Call ${esc(d.phone)}</a>
    </div>
    <div class="footer-bottom">&copy; ${d.year} ${esc(d.businessName)} · ${esc(d.tradeTitle)}${esc(
    townInTitle
  )} · All rights reserved.</div>
  </div>
</footer>

<div class="mobile-cta">
  <a href="${attr(callHref)}">${icon("phone")} Call now</a>
  ${waHref ? `<a class="wa" href="${attr(waHref)}">WhatsApp</a>` : ""}
</div>

<script>
(function(){
  var hdr=document.getElementById("hdr");
  window.addEventListener("scroll",function(){ if(window.scrollY>10){hdr.classList.add("scrolled");}else{hdr.classList.remove("scrolled");} },{passive:true});

  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target);
      if(e.target.classList.contains("stat")){ animateCounters(e.target); } } });
  },{threshold:0.15});
  document.querySelectorAll(".reveal").forEach(function(el){ io.observe(el); });

  function animateCounters(scope){
    scope.querySelectorAll("strong[data-count]").forEach(function(el){
      var target=parseFloat(el.getAttribute("data-count"));
      var suffix=el.getAttribute("data-suffix")||"";
      var dec=(String(target).indexOf(".")>-1)?1:0;
      var start=0, dur=1100, t0=performance.now();
      function tick(now){
        var p=Math.min(1,(now-t0)/dur);
        var val=(start+(target-start)*(1-Math.pow(1-p,3)));
        el.textContent=(dec?val.toFixed(1):Math.round(val))+suffix;
        if(p<1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
})();
function readAsDataURL(file){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){res(r.result);}; r.onerror=rej; r.readAsDataURL(file); }); }

function uploadEnquiryPhotos(uploadEp, files){
  var urls=[]; var max=Math.min(files.length,4);
  var chain=Promise.resolve();
  files=Array.prototype.slice.call(files,0,max);
  return files.reduce(function(p,file){
    return p.then(function(){
      return readAsDataURL(file).then(function(dataUrl){
        return fetch(uploadEp,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contentType:file.type,dataBase64:dataUrl})});
      }).then(function(r){return r.json();}).then(function(j){ if(j&&j.url) urls.push(j.url); }).catch(function(){ /* skip a failed photo */ });
    });
  },chain).then(function(){ return urls; });
}

function sendEnquiry(e){
  e.preventDefault();
  var f=e.target;
  if(f.company&&f.company.value){return false;}
  var __routed=${routed ? "true" : "false"};
  if(__routed){
    var __ep=${JSON.stringify(routed ? (base + "/api/intake") : "")};
    var __uploadEp=${JSON.stringify(routed ? (base + "/api/upload") : "")};
    var __rk=${JSON.stringify(d.routeKey || "")};
    var __btn=f.querySelector("button[type=submit]");
    if(__btn){__btn.disabled=true;__btn.textContent="Sending\u2026";}
    var __photoFiles=(f.photos&&f.photos.files)?f.photos.files:[];
    (__photoFiles.length?uploadEnquiryPhotos(__uploadEp,__photoFiles):Promise.resolve([])).then(function(photoUrls){
      return fetch(__ep,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({routeKey:__rk,name:f.name.value,phone:f.phone.value,postcode:f.postcode.value,message:f.msg.value,photos:photoUrls,source:"site"})});
    }).then(function(r){return r.json();}).then(function(){f.reset();if(__btn){__btn.disabled=false;__btn.textContent="Sent \u2713";}alert("Thanks "+f.name.value+"! We\u2019ve got your message and will call you back shortly.");}).catch(function(){if(__btn){__btn.disabled=false;__btn.textContent="Send enquiry";}alert("Sorry, something went wrong \u2014 please call us.");});
    return false;
  }
  var to=${JSON.stringify(d.email || "")};
  var body=encodeURIComponent("Name: "+f.name.value+"\\nPhone: "+f.phone.value+"\\nPostcode: "+f.postcode.value+"\\n\\n"+f.msg.value);
  if(to){ window.location.href="mailto:"+to+"?subject="+subject+"&body="+body; }
  else { alert("Thanks "+f.name.value+"! Please call "+${JSON.stringify(d.phone)}+" and we'll help right away."); }
  return false;
}
</script>
</body>
</html>`;
}
