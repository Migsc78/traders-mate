/**
 * Run: npx tsx src/__tests__/templateMatch.test.ts
 *
 * Covers folding a matched template into what the model heard. The model call
 * itself isn't tested — it needs an API key and costs money — but this is where
 * a mistake actually hurts: a duplicated line looks sloppy in front of a
 * customer, and an add-on nobody asked for prices work they didn't want.
 *
 * The "heard" lines below are what extraction returns for notes a tradie would
 * really dictate, quoted above each case.
 */
import { labelsMatch, mergeTemplateWithHeard, type TemplateLine } from "../services/quotes/templateMatch.js";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

const line = (label: string, unitPricePence: number, qty = 1, unit = "JOB"): TemplateLine => ({
  label,
  qty,
  unit,
  unitPricePence,
  vatRate: 20,
});

/* ------------------------------------------------------------ label matching */

check("exact label", labelsMatch("Magnetic filter", "Magnetic filter"));
check("case and punctuation", labelsMatch("magnetic filter.", "Magnetic Filter"));
check("tradie abbreviation", labelsMatch("mag filter", "Magnetic filter"));
check("substring", labelsMatch("thermostat", "Smart thermostat"));
check("filler words ignored", labelsMatch("fit a new magnetic filter", "Magnetic filter"));
// Extraction returns tidied line labels, not a verbatim transcript, so these are
// the shapes that actually reach the matcher rather than raw spoken phrases.
check("rad shorthand", labelsMatch("Rad (double panel)", "Radiator (double panel)"), "rad → radiator");
check("reordered words", labelsMatch("Double panel radiator", "Radiator (double panel)"));
// The case that matters most: one decisive word apart must NOT match.
check("service is not an installation", !labelsMatch("Boiler service", "Boiler installation"));
check("service is not a replacement", !labelsMatch("Radiator service", "Radiator replacement"));

check("different jobs do not match", !labelsMatch("Boiler service", "Boiler installation"));
check("unrelated items", !labelsMatch("Power flush", "Basin & pedestal"));
check("empty label", !labelsMatch("", "Magnetic filter"));

/* ----------------------------------------------------------------- merging */

const boilerInstall = {
  included: [
    line("Combi boiler (up to 30kW)", 98000),
    line("Standard flue kit", 9000),
    line("Magnetic filter", 8000),
    line("Removal & disposal of old boiler", 6000),
    line("Labour", 27500, 2, "DAY"),
  ],
  addOns: [
    line("Smart thermostat", 15000),
    line("Extended warranty (10 yr)", 20000),
    line("Power flush", 35000),
  ],
};

// "New combi boiler for a 3 bed semi. Remove the old boiler and tank.
//  Include magnetic filter and a smart thermostat. Customer available weekdays."
{
  const heard = [
    { label: "Combi boiler", qty: 1, unit: "JOB" },
    { label: "Remove old boiler and tank", qty: 1, unit: "JOB" },
    { label: "Magnetic filter", qty: 1, unit: "JOB" },
    { label: "Smart thermostat", qty: 1, unit: "JOB" },
  ];
  const r = mergeTemplateWithHeard(boilerInstall, heard);

  check("install: all included lines kept", r.lines.filter((l) => l.unitPricePence > 0).length >= 5);
  check(
    "install: thermostat pulled in because it was asked for",
    r.includedAddOns.some((a) => a.label === "Smart thermostat")
  );
  check(
    "install: warranty NOT added — nobody mentioned it",
    !r.includedAddOns.some((a) => a.label.startsWith("Extended warranty"))
  );
  check(
    "install: power flush NOT added — nobody mentioned it",
    !r.includedAddOns.some((a) => a.label === "Power flush")
  );
  check(
    "install: magnetic filter appears once, not twice",
    r.lines.filter((l) => l.label === "Magnetic filter").length === 1
  );
  check("install: nothing left over for the price book", r.extras.length === 0, JSON.stringify(r.extras));
}

const boilerService = {
  included: [line("Boiler service & safety check", 9000), line("Flue gas analysis", 0)],
  addOns: [line("Magnetic filter clean", 2500), line("Gas safety certificate", 3500)],
};

// "Annual service on the combi at 14 Elm Road. Landlord also wants a gas safety
//  certificate. While I'm there he's asked about a power flush."
{
  const heard = [
    { label: "Boiler service", qty: 1, unit: "JOB" },
    { label: "Gas safety certificate", qty: 1, unit: "JOB" },
    { label: "Power flush", qty: 1, unit: "JOB" },
  ];
  const r = mergeTemplateWithHeard(boilerService, heard);

  check(
    "service: certificate add-on pulled in",
    r.includedAddOns.some((a) => a.label === "Gas safety certificate")
  );
  check(
    "service: filter clean NOT added",
    !r.includedAddOns.some((a) => a.label === "Magnetic filter clean")
  );
  check(
    "service: power flush falls through to the price book",
    r.extras.length === 1 && r.extras[0].label === "Power flush",
    JSON.stringify(r.extras)
  );
}

// "Two rads upstairs, double panel, plus TRVs." — stated quantity must win over
// the template's default of one.
{
  const radSwap = {
    included: [line("Radiator (double panel)", 12000, 1), line("Thermostatic valve set", 4500, 1)],
    addOns: [],
  };
  const heard = [
    { label: "2 rads upstairs double panel", qty: 2, unit: "EACH" },
    { label: "TRV set", qty: 2, unit: "EACH" },
  ];
  const r = mergeTemplateWithHeard(radSwap, heard);
  const rad = r.lines.find((l) => l.label.startsWith("Radiator"));
  check("rads: heard quantity of 2 overrides template default", rad?.qty === 2, `got qty ${rad?.qty}`);
}

// "Burst pipe under the kitchen sink, emergency, replaced a section of 15mm
//  copper and two compression fittings." — nothing template-shaped here.
{
  const heard = [
    { label: "Section of 15mm copper pipe", qty: 1, unit: "METRE" },
    { label: "Compression fittings", qty: 2, unit: "EACH" },
  ];
  const r = mergeTemplateWithHeard(boilerService, heard);
  check(
    "unrelated notes: everything falls through, nothing invented",
    r.extras.length === 2 && r.includedAddOns.length === 0,
    JSON.stringify({ extras: r.extras.length, addOns: r.includedAddOns.length })
  );
}

// A template applied to silence still gives the tradie the standard scope.
{
  const r = mergeTemplateWithHeard(boilerService, []);
  check("no heard lines: included scope still comes through", r.lines.length === 2);
  check("no heard lines: no add-ons guessed", r.includedAddOns.length === 0);
}

if (failures > 0) throw new Error(`${failures} template-match failure(s)`);
console.log("OK: template matching and merge");
