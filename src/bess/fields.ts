// Inputs of the battery calculator as the interface shows them. Values are stored in engine units; `scale` converts to
// the displayed unit (0.85 → 85 %). min, max and the "usual" range that bounds a slider are in displayed units.
// Only what the v1 capability manifest switches on is an input (model-spec §1); the rest of the registry is fixed.
import type { BessInputs } from "./engine";
import type { Duration } from "./engine/library";

export type BessGroupId = "scenario" | "battery" | "revenue" | "costs" | "grid" | "war" | "financing" | "valuation";
export type BessFieldKind = "number" | "select" | "switch";
export type BessFieldValue = number | string | boolean;

export interface BessFieldDef {
  /** Also the name of the URL parameter: short and never reused for something else. */
  id: string;
  group: BessGroupId;
  kind: BessFieldKind;
  quick?: boolean;
  unit?: string;
  scale?: number;
  decimals?: number;
  min?: number;
  max?: number;
  usual?: [number, number];
  step?: number;
  options?: string[];
  /** Source ids (BESS_SOURCES) or "assumption". */
  sources?: string[];
  hidden?: (i: BessInputs) => boolean;
  get: (i: BessInputs) => BessFieldValue;
  set: (i: BessInputs, v: BessFieldValue) => BessInputs;
}

type NumKey = { [K in keyof BessInputs]: BessInputs[K] extends number ? K : never }[keyof BessInputs];
type BoolKey = { [K in keyof BessInputs]: BessInputs[K] extends boolean ? K : never }[keyof BessInputs];

const number = (key: NumKey) => ({
  get: (i: BessInputs) => i[key],
  set: (i: BessInputs, v: BessFieldValue) => ({ ...i, [key]: Number(v) }),
});
const toggle = (key: BoolKey) => ({
  get: (i: BessInputs) => i[key],
  set: (i: BessInputs, v: BessFieldValue) => ({ ...i, [key]: Boolean(v) }),
});
/** A select over string values of the inputs, e.g. the scenario. */
function choice<K extends keyof BessInputs>(key: K, options: BessInputs[K][]) {
  return {
    options: options.map(String),
    get: (i: BessInputs) => String(i[key]),
    set: (i: BessInputs, v: BessFieldValue) => {
      const hit = options.find((o) => String(o) === String(v));
      return hit === undefined ? i : { ...i, [key]: hit };
    },
  };
}

const noDebt = (i: BessInputs) => !i.debt;

export const BESS_FIELDS: BessFieldDef[] = [
  // Market scenario
  { id: "scn", group: "scenario", kind: "select", quick: true, sources: ["neighbours2025", "assumption"], ...choice("scenario", ["reference", "low", "high"]) },
  { id: "snap", group: "scenario", kind: "select", quick: true, sources: ["oreeDam"], ...choice("snapshot", ["UA-2025", "UA-LTM-2026-09"]) },
  { id: "cur", group: "scenario", kind: "select", sources: ["assumption"], ...choice("pathCurrency", ["EUR", "UAH"]) },

  // Battery
  {
    id: "dur", group: "battery", kind: "select", quick: true, sources: ["assumption"],
    options: ["1", "2", "4"],
    get: (i) => String(i.durationH),
    set: (i, v) => (["1", "2", "4"].includes(String(v)) ? { ...i, durationH: Number(v) as Duration } : i),
  },
  {
    id: "rte", group: "battery", kind: "select", sources: ["lazardLcos", "nlrAtb"],
    options: ["0.85", "0.88", "0.9"],
    get: (i) => String(i.rte),
    set: (i, v) => (["0.85", "0.88", "0.9"].includes(String(v)) ? { ...i, rte: Number(v) } : i),
  },
  {
    id: "cyc", group: "battery", kind: "select", sources: ["warranty"],
    options: ["1", "1.5"],
    get: (i) => String(i.cycleCap),
    set: (i, v) => (["1", "1.5"].includes(String(v)) ? { ...i, cycleCap: Number(v) } : i),
  },
  { id: "aug", group: "battery", kind: "switch", sources: ["spe2026", "assumption"], ...toggle("augmentation") },
  { id: "deg", group: "battery", kind: "switch", sources: ["blastLite", "nlrAtb"], ...toggle("degradationStress") },

  // Revenue
  { id: "capt", group: "revenue", kind: "number", quick: true, decimals: 2, min: 0.3, max: 1, usual: [0.6, 0.9], step: 0.01, sources: ["assumption"], ...number("captureFactor") },
  { id: "fee", group: "revenue", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 30, usual: [5, 15], step: 0.5, sources: ["assumption"], ...number("optimiserFeeRate") },

  // Costs
  { id: "capex", group: "costs", kind: "number", quick: true, unit: "% of estimate", scale: 100, decimals: 0, min: 50, max: 200, usual: [80, 120], step: 1, sources: ["spe2026", "assumption"], ...number("capexFactor") },
  { id: "conn", group: "costs", kind: "select", sources: ["connectionFee", "assumption"], ...choice("connection", ["dso110kV", "ukrenergoBay"]) },

  // Grid and timing
  { id: "delay", group: "grid", kind: "number", unit: "months", decimals: 0, min: 0, max: 24, usual: [0, 6], step: 1, sources: ["law4834"], ...number("codDelayMonths") },
  { id: "aux", group: "grid", kind: "switch", sources: ["oreeStudy"], ...toggle("auxStress") },

  // War risk
  {
    // shown as the expected loss a year, % of replacement value: 8 % market premium × loss ratio (model-spec §10)
    id: "war", group: "war", kind: "number", quick: true, unit: "%/yr", scale: 8, decimals: 1, min: 0, max: 8, usual: [1.6, 4], step: 0.1,
    sources: ["warPremium", "assumption"], ...number("lossRatio"),
  },
  { id: "ins", group: "war", kind: "switch", sources: ["warPremium", "assumption"], ...toggle("insurance") },
  { id: "cover", group: "war", kind: "switch", sources: ["warPremium"], hidden: (i) => !i.insurance, ...toggle("coverAvailable") },
  { id: "state", group: "war", kind: "switch", sources: ["compensation"], ...toggle("stateBudgetAvailable") },

  // Financing
  { id: "debt", group: "financing", kind: "switch", quick: true, sources: ["assumption"], ...toggle("debt") },
  { id: "rate", group: "financing", kind: "number", unit: "%", scale: 100, decimals: 2, min: 0, max: 20, usual: [6, 10], step: 0.25, sources: ["euribor", "swaps", "assumption"], hidden: noDebt, ...number("interestRate") },
  { id: "dscr", group: "financing", kind: "number", unit: "x", decimals: 2, min: 1.1, max: 3, usual: [1.4, 2], step: 0.05, sources: ["assumption"], hidden: noDebt, ...number("targetDscr") },
  { id: "gear", group: "financing", kind: "number", unit: "%", scale: 100, decimals: 0, min: 0, max: 80, usual: [40, 70], step: 1, sources: ["ebrdEquity", "assumption"], hidden: noDebt, ...number("maxGearing") },
  { id: "term", group: "financing", kind: "select", sources: ["nbuCurrency", "assumption"], ...choice("terminalRemittance", ["capped", "blocked"]) },

  // Currency and valuation
  { id: "fx", group: "valuation", kind: "switch", sources: ["budgetFx", "assumption"], ...toggle("fxStress") },
  { id: "hurdle", group: "valuation", kind: "number", quick: true, unit: "%", scale: 100, decimals: 1, min: 5, max: 30, usual: [12, 20], step: 0.5, sources: ["damodaran", "assumption"], ...number("equityHurdle") },
  { id: "disc", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: 3, max: 25, usual: [8, 14], step: 0.5, sources: ["assumption"], ...number("projectDiscountRate") },
];

export const BESS_GROUPS: BessGroupId[] = ["scenario", "battery", "revenue", "costs", "grid", "war", "financing", "valuation"];

export function toDisplay(f: BessFieldDef, v: BessFieldValue): BessFieldValue {
  return typeof v === "number" ? v * (f.scale ?? 1) : v;
}

export function fromDisplay(f: BessFieldDef, v: number): number {
  return v / (f.scale ?? 1);
}

export function sameValue(a: BessFieldValue, b: BessFieldValue): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return a === b;
}
