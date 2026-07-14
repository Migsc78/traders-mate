// Trade value multiplier -> contributes to the "trade value" scoring factor.
// Higher = higher job value / more able to afford a site. Value is 0..1.

const TRADE_VALUE: Record<string, number> = {
  electrician: 1.0,
  "heating engineer": 1.0,
  "gas engineer": 1.0,
  plumber: 0.9,
  roofer: 1.0,
  builder: 0.9,
  "kitchen fitter": 0.9,
  "bathroom fitter": 0.9,
  plasterer: 0.7,
  "painter and decorator": 0.6,
  painter: 0.6,
  decorator: 0.6,
  joiner: 0.8,
  carpenter: 0.8,
  landscaper: 0.7,
  "driveway": 0.8,
  "fencing": 0.6,
  locksmith: 0.7,
  "tiler": 0.6,
  handyman: 0.4,
  cleaner: 0.4,
  gardener: 0.5,
};

export function tradeValue(occupation: string): number {
  const key = occupation.trim().toLowerCase();
  if (key in TRADE_VALUE) return TRADE_VALUE[key];
  // Partial match fallback (e.g. "emergency electrician" -> electrician)
  for (const [trade, value] of Object.entries(TRADE_VALUE)) {
    if (key.includes(trade)) return value;
  }
  return 0.6; // sensible default
}
