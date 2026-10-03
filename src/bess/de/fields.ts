// Inputs of the German battery calculator as the interface shows them (spec v1.2 R2.2; registry-de.md). Values are
// stored in engine units; `scale` converts to the displayed unit. The rest of the registry is fixed. Source ids are
// DE_SOURCES keys.
import type { FieldDef, FieldValue } from "../field-kit";
import { withDeDuration } from "./index";
import { DE_BASE, DE_DURATION_PRESETS, DE_VARIANTS } from "./registry";
import type { DeInputs } from "./types";

export type DeGroupId = "market" | "battery" | "toll" | "grid" | "costs" | "tax" | "financing" | "valuation";
export type DeFieldDef = FieldDef<DeInputs, DeGroupId>;

type NumKey = { [K in keyof DeInputs]-?: DeInputs[K] extends number ? K : never }[keyof DeInputs];
type BoolKey = { [K in keyof DeInputs]-?: DeInputs[K] extends boolean ? K : never }[keyof DeInputs];

const number = (key: NumKey, whole = false) => ({
  get: (i: DeInputs) => i[key],
  set: (i: DeInputs, v: FieldValue) => ({ ...i, [key]: whole ? Math.round(Number(v)) : Number(v) }),
});
const toggle = (key: BoolKey) => ({
  get: (i: DeInputs) => i[key],
  set: (i: DeInputs, v: FieldValue) => ({ ...i, [key]: Boolean(v) }),
});
/** A select over values of the inputs, kept as strings in the interface. */
function choice<K extends keyof DeInputs>(key: K, options: DeInputs[K][]) {
  return {
    options: options.map(String),
    get: (i: DeInputs) => String(i[key]),
    set: (i: DeInputs, v: FieldValue) => {
      const hit = options.find((o) => String(o) === String(v));
      return hit === undefined ? i : { ...i, [key]: hit };
    },
  };
}

const noDebt = (i: DeInputs) => !i.debt;
const noToll = (i: DeInputs) => !i.tollEnabled;

/** Values that follow the toll switch (registry FIN, DE_VARIANTS.merchant): a loan only with a toll (spec §7.3) and
 *  the rates of each variant — 12 % and 8 % with a toll, 15 % and 10 % without — unless the visitor set them. */
const BY_TOLL = {
  debt: { on: DE_BASE.debt, off: DE_VARIANTS.merchant.debt },
  equityHurdle: { on: DE_BASE.equityHurdle, off: DE_VARIANTS.merchant.equityHurdle },
  projectDiscountRate: { on: DE_BASE.projectDiscountRate, off: DE_VARIANTS.merchant.projectDiscountRate },
} as const;
type ByToll = keyof typeof BY_TOLL;
const followsToll = (key: ByToll) => (i: DeInputs) => (i.tollEnabled ? BY_TOLL[key].on : BY_TOLL[key].off);
function setToll(i: DeInputs, on: boolean): DeInputs {
  if (on === i.tollEnabled) return i;
  const next = { ...i, tollEnabled: on };
  for (const key of Object.keys(BY_TOLL) as ByToll[]) {
    if (i[key] === followsToll(key)(i)) (next as Record<ByToll, number | boolean>)[key] = followsToll(key)(next);
  }
  return next;
}
/** The value a duration preset gives a field (de-cases.json durationPresets); 1 h has none and keeps the 2 h value. */
const preset = (key: keyof (typeof DE_DURATION_PRESETS)[2]) => (i: DeInputs) => (DE_DURATION_PRESETS[i.durationHours as 2 | 4] ?? DE_DURATION_PRESETS[2])[key]!;

export const DE_FIELDS: DeFieldDef[] = [
  // Market
  { id: "path", group: "market", kind: "select", quick: true, sources: ["spreadOutlook", "iseSimulator", "capexDe", "assumption"], ...choice("spreadPath", ["reference", "low", "high"]) },
  { id: "snap", group: "market", kind: "select", quick: true, sources: ["energyCharts"], ...choice("snapshot", ["DE-2025", "DE-LTM-2026-09"]) },
  { id: "k", group: "market", kind: "number", unit: "×", decimals: 2, min: 0.5, max: 3, usual: [0.5, 1.5], step: 0.05, sources: ["assumption"], ...number("spreadMultiplierK") },
  { id: "capt", group: "market", kind: "number", quick: true, decimals: 2, min: 0.3, max: 1, usual: [0.6, 0.9], step: 0.01, sources: ["captureDe", "assumption"], ...number("captureFactor") },
  { id: "fee", group: "market", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 30, usual: [5, 15], step: 0.5, sources: ["optimiserFee"], ...number("optimiserFeeRate") },

  // Battery
  {
    // the cost and toll presets follow the duration (de-cases.json durationPresets)
    id: "dur", group: "battery", kind: "select", quick: true, sources: ["assumption"],
    options: ["1", "2", "4"],
    get: (i) => String(i.durationHours),
    set: (i, v) => (v === "2" || v === "4" ? withDeDuration(i, Number(v)) : v === "1" ? { ...i, durationHours: 1 } : i),
  },
  { id: "rte", group: "battery", kind: "select", sources: ["opexDe", "enervisIndex"], ...choice("rte", [0.85, 0.88, 0.9]) },
  { id: "cyc", group: "battery", kind: "select", sources: ["warranty"], ...choice("cycleCap", [1, 1.5]) },
  { id: "av", group: "battery", kind: "number", unit: "%", scale: 100, decimals: 1, min: 80, max: 100, usual: [93, 99], step: 0.5, sources: ["enervisIndex", "availabilityGuarantee"], ...number("availability") },
  { id: "av1", group: "battery", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 100, usual: [90, 99], step: 0.5, sources: ["availabilityGuarantee", "assumption"], ...number("availabilityYear1") },
  { id: "deg", group: "battery", kind: "switch", sources: ["degradation"], ...toggle("degradationStress") },

  // Toll
  {
    id: "toll", group: "toll", kind: "switch", quick: true, sources: ["tollPractice"],
    get: (i) => i.tollEnabled,
    set: (i, v) => setToll(i, Boolean(v)),
  },
  {
    id: "tp", group: "toll", kind: "number", quick: true, unit: "€/MW·yr", decimals: 0, min: 0, max: 500_000, usual: [80_000, 250_000], step: 5_000,
    sources: ["tollMarket", "tollPractice"], hidden: noToll, follows: preset("tollPrice"), ...number("tollPrice"),
  },
  { id: "ts", group: "toll", kind: "number", quick: true, unit: "%", scale: 100, decimals: 0, min: 10, max: 100, usual: [50, 100], step: 5, sources: ["tollPractice"], hidden: noToll, ...number("tollShare") },
  { id: "tm", group: "toll", kind: "number", unit: "months", decimals: 0, min: 12, max: 180, usual: [60, 120], step: 12, sources: ["tollPractice"], hidden: noToll, ...number("tollMonths", true) },

  // Grid, fees and timing
  { id: "agnes", group: "grid", kind: "number", quick: true, unit: "€/MW·yr", decimals: 0, min: 0, max: 15_000, usual: [0, 7_000], step: 500, sources: ["agnes"], ...number("agnesFee") },
  { id: "gf", group: "grid", kind: "switch", sources: ["grandfathering"], ...toggle("grandfathered") },
  { id: "bkz", group: "grid", kind: "number", unit: "€/kW", decimals: 0, min: 0, max: 300, usual: [0, 165], step: 5, sources: ["bkz", "netzeBwBkz", "transnetBwTariff"], ...number("bkzPerKw") },
  { id: "auxc", group: "grid", kind: "number", unit: "€/MW·yr", decimals: 0, min: 0, max: 10_000, usual: [0, 4_000], step: 250, sources: ["auxCharges"], ...number("auxChargesPerMw") },
  { id: "delay", group: "grid", kind: "number", unit: "months", decimals: 0, min: 0, max: 24, usual: [0, 6], step: 1, sources: ["assumption"], ...number("codDelayMonths", true) },

  // Costs
  { id: "capex", group: "costs", kind: "number", quick: true, unit: "% of estimate", scale: 100, decimals: 0, min: 50, max: 200, usual: [80, 120], step: 1, sources: ["capexDe", "speOutlook", "ember"], ...number("capexFactor") },
  { id: "dev", group: "costs", kind: "number", unit: "% of estimate", scale: 100, decimals: 0, min: 0, max: 300, usual: [50, 150], step: 5, sources: ["capexDe", "assumption"], ...number("developmentFactor") },
  { id: "om", group: "costs", kind: "number", unit: "€/MW·yr", decimals: 0, min: 0, max: 40_000, usual: [6_000, 20_000], step: 500, sources: ["opexDe"], follows: preset("omPerMw"), ...number("omPerMw") },
  { id: "ins", group: "costs", kind: "number", unit: "% of value/yr", scale: 100, decimals: 2, min: 0, max: 3, usual: [0.3, 1], step: 0.05, sources: ["insurance"], ...number("insuranceRate") },
  { id: "adm", group: "costs", kind: "number", unit: "€/yr", decimals: 0, min: 0, max: 1_000_000, usual: [50_000, 300_000], step: 10_000, sources: ["assumption"], ...number("spvAdmin") },

  // Tax
  { id: "heb", group: "tax", kind: "number", unit: "%", scale: 100, decimals: 0, min: 200, max: 900, usual: [300, 500], step: 10, sources: ["taxLaw"], ...number("hebesatz") },
  { id: "afab", group: "tax", kind: "select", sources: ["afa", "afaGeneral"], ...choice("afaBatteryYears", [10, 15]) },

  // Financing
  { id: "debt", group: "financing", kind: "switch", quick: true, sources: ["bankPractice"], follows: followsToll("debt"), ...toggle("debt") },
  { id: "rate", group: "financing", kind: "number", unit: "%", scale: 100, decimals: 2, min: 0, max: 15, usual: [4, 8], step: 0.25, sources: ["euribor", "bankPractice"], hidden: noDebt, ...number("interestRate") },
  { id: "term", group: "financing", kind: "select", sources: ["bankPractice", "umweltbank"], hidden: noDebt, ...choice("repaymentCount", [20, 30]) },
  { id: "dscrc", group: "financing", kind: "number", unit: "x", decimals: 2, min: 1, max: 2, usual: [1.1, 1.4], step: 0.05, sources: ["bankPractice", "dscrPractice"], hidden: noDebt, ...number("targetDscrContracted") },
  { id: "dscrm", group: "financing", kind: "number", unit: "x", decimals: 2, min: 1.2, max: 4, usual: [1.5, 2.5], step: 0.05, sources: ["bankPractice", "dscrPractice"], hidden: noDebt, ...number("targetDscrMerchant") },
  { id: "gear", group: "financing", kind: "number", unit: "%", scale: 100, decimals: 0, min: 0, max: 90, usual: [50, 80], step: 1, sources: ["bankPractice", "gearingPractice"], hidden: noDebt, ...number("maxGearing") },

  // Valuation
  {
    id: "hurdle", group: "valuation", kind: "number", quick: true, unit: "%", scale: 100, decimals: 1, min: 3, max: 30, usual: [8, 18], step: 0.5,
    sources: ["assumption"], follows: followsToll("equityHurdle"), ...number("equityHurdle"),
  },
  {
    id: "disc", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: 3, max: 25, usual: [6, 12], step: 0.5,
    sources: ["assumption"], follows: followsToll("projectDiscountRate"), ...number("projectDiscountRate"),
  },
];

export const DE_GROUPS: DeGroupId[] = ["market", "battery", "toll", "grid", "costs", "tax", "financing", "valuation"];
