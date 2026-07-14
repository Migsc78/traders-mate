// Per-trade content, colour identity and iconography used by the site template.
// Every trade has a full theme so a generated site feels bespoke to that trade.

export interface ServiceItem {
  title: string;
  desc: string;
  icon?: string; // icon name resolved in template.ts
}

export interface TradeContent {
  tagline: (town: string) => string;
  heroSub: string;
  about: string;
  primary: string; // brand colour
  accent: string; // CTA / highlight colour
  brandIcon: string; // signature icon name
  services: ServiceItem[];
  steps: { title: string; desc: string }[];
}

const DEFAULT_STEPS = [
  { title: "Get in touch", desc: "Call or message us and tell us what you need — no obligation." },
  { title: "Free quote", desc: "We assess the job and give you a clear, fixed price up front." },
  { title: "Job done right", desc: "We turn up on time, work tidily and leave you delighted." },
];

const GENERIC: TradeContent = {
  tagline: (town) => `Trusted local tradespeople in ${town}`,
  heroSub: "Reliable, professional work with free no-obligation quotes and a finish you'll be proud of.",
  about:
    "We're a local, family-run business proud of our reputation. We turn up when we say we will, keep things tidy, and treat your home like our own.",
  primary: "#1f3864",
  accent: "#f0a500",
  brandIcon: "wrench",
  services: [
    { title: "Quality workmanship", desc: "Careful, tidy work done right the first time.", icon: "medal" },
    { title: "Free quotes", desc: "Clear, honest pricing before any work begins.", icon: "pound" },
    { title: "Fully insured", desc: "Peace of mind on every job, big or small.", icon: "shield" },
    { title: "Local & reliable", desc: "A trusted name your neighbours already use.", icon: "pin" },
  ],
  steps: DEFAULT_STEPS,
};

const TRADES: Record<string, TradeContent> = {
  electrician: {
    tagline: (town) => `Qualified electricians in ${town}`,
    heroSub: "From extra sockets to full rewires — safe, certified electrical work with a spotless finish.",
    about:
      "We're fully qualified, registered electricians serving homes and businesses. Every job leaves with the correct certification and a tidy finish.",
    primary: "#14213d",
    accent: "#ffc300",
    brandIcon: "bolt",
    services: [
      { title: "Rewires & upgrades", desc: "Full or partial rewires and consumer unit upgrades.", icon: "panel" },
      { title: "Sockets & lighting", desc: "Extra sockets, LED lighting and fault-finding.", icon: "bulb" },
      { title: "EV chargers", desc: "Home EV charging points installed and certified.", icon: "ev" },
      { title: "EICR & testing", desc: "Landlord certificates and electrical safety checks.", icon: "shield" },
    ],
    steps: DEFAULT_STEPS,
  },
  plumber: {
    tagline: (town) => `Reliable plumbers in ${town}`,
    heroSub: "Leaks, boilers and bathrooms — fast, clean plumbing you can rely on, day or night.",
    about:
      "We're local plumbers with years of experience keeping homes running. No mess, no fuss, and a price agreed before we start.",
    primary: "#0a558c",
    accent: "#f4a300",
    brandIcon: "droplet",
    services: [
      { title: "Leaks & repairs", desc: "Fast fixes for leaks, blockages and burst pipes.", icon: "droplet" },
      { title: "Bathrooms", desc: "Full bathroom installs and stylish upgrades.", icon: "bath" },
      { title: "Boilers & heating", desc: "Boiler servicing, repairs and radiator work.", icon: "flame" },
      { title: "Emergencies", desc: "Same-day help when things go wrong.", icon: "clock" },
    ],
    steps: DEFAULT_STEPS,
  },
  "heating engineer": {
    tagline: (town) => `Heating & boiler engineers in ${town}`,
    heroSub: "Boiler installs, servicing and repairs — warm homes, done properly and guaranteed.",
    about:
      "Registered heating engineers you can trust with your home's warmth. Honest advice and workmanship that lasts.",
    primary: "#9d2b1e",
    accent: "#ff8c42",
    brandIcon: "flame",
    services: [
      { title: "Boiler installs", desc: "New boilers supplied and fitted with warranty.", icon: "flame" },
      { title: "Servicing", desc: "Annual servicing to keep things running safely.", icon: "wrench" },
      { title: "Repairs", desc: "Fast diagnosis and repair of heating faults.", icon: "thermo" },
      { title: "Power flushing", desc: "Improve efficiency and fix cold radiators.", icon: "radiator" },
    ],
    steps: DEFAULT_STEPS,
  },
  roofer: {
    tagline: (town) => `Trusted roofers in ${town}`,
    heroSub: "Repairs, re-roofs and guttering — watertight work at height, fully guaranteed.",
    about:
      "Experienced local roofers working safely at height. Free inspections and clear quotes, with workmanship guaranteed.",
    primary: "#37474f",
    accent: "#e07a2f",
    brandIcon: "roof",
    services: [
      { title: "Roof repairs", desc: "Leaks, slipped tiles and storm damage sorted fast.", icon: "roof" },
      { title: "New roofs", desc: "Full re-roofs using quality, long-lasting materials.", icon: "tiles" },
      { title: "Flat roofs", desc: "Durable flat-roof systems for extensions and garages.", icon: "roof" },
      { title: "Guttering", desc: "Gutter cleaning, repair and replacement.", icon: "gutter" },
    ],
    steps: DEFAULT_STEPS,
  },
  "painter and decorator": {
    tagline: (town) => `Painters & decorators in ${town}`,
    heroSub: "Interior and exterior decorating with a flawless, tidy finish that transforms your home.",
    about:
      "Local decorators who take pride in a spotless finish and an even tidier site. We protect your home and clean up every day.",
    primary: "#1c6b8c",
    accent: "#ffb703",
    brandIcon: "roller",
    services: [
      { title: "Interior painting", desc: "Walls, ceilings and woodwork — crisp and clean.", icon: "roller" },
      { title: "Exterior painting", desc: "Weatherproof finishes that protect and impress.", icon: "brush" },
      { title: "Wallpapering", desc: "Expert hanging for a perfect, bubble-free result.", icon: "swatch" },
      { title: "Prep & repairs", desc: "Filling, sanding and prep for a lasting finish.", icon: "bucket" },
    ],
    steps: DEFAULT_STEPS,
  },
  builder: {
    tagline: (town) => `Local builders in ${town}`,
    heroSub: "Extensions, renovations and repairs — built to last, on time and on budget.",
    about:
      "A local building firm with a reputation built on quality and reliability. Clear communication from first quote to final handover.",
    primary: "#5c4433",
    accent: "#f4a300",
    brandIcon: "brick",
    services: [
      { title: "Extensions", desc: "Single and double-storey extensions, managed end to end.", icon: "frame" },
      { title: "Renovations", desc: "Full refurbishments and structural work.", icon: "trowel" },
      { title: "Groundwork", desc: "Foundations, drainage and driveways.", icon: "shovel" },
      { title: "General building", desc: "Brickwork, repairs and property maintenance.", icon: "brick" },
    ],
    steps: DEFAULT_STEPS,
  },
  landscaper: {
    tagline: (town) => `Garden & landscaping in ${town}`,
    heroSub: "Patios, fencing, turf and full garden makeovers — outdoor spaces you'll love to live in.",
    about:
      "We design and build gardens people love to spend time in. Quality materials, neat work, and a finish that lasts.",
    primary: "#2e6b3e",
    accent: "#f4a300",
    brandIcon: "leaf",
    services: [
      { title: "Patios & paving", desc: "Beautiful, hard-wearing patios and pathways.", icon: "brick" },
      { title: "Fencing & decking", desc: "Supply and fit of fencing, gates and decking.", icon: "fence" },
      { title: "Turf & planting", desc: "New lawns, borders and planting schemes.", icon: "leaf" },
      { title: "Maintenance", desc: "Ongoing garden care and seasonal tidy-ups.", icon: "tree" },
    ],
    steps: DEFAULT_STEPS,
  },
};

export function tradeContent(occupation: string): TradeContent {
  const key = occupation.trim().toLowerCase();
  if (key in TRADES) return TRADES[key];
  for (const [trade, content] of Object.entries(TRADES)) {
    if (key.includes(trade) || trade.includes(key)) return content;
  }
  return GENERIC;
}

// A tidy, human title-case of the occupation for headings.
export function titleCaseTrade(occupation: string): string {
  return occupation
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
