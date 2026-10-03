// Inputs of the battery calculator as the interface shows them. Values are stored in engine units; `scale` converts to
// the displayed unit (0.85 → 85 %). min, max and the "usual" range that bounds a slider are in displayed units.
// Only what the v1 capability manifest switches on is an input (model-spec §1); the rest of the registry is fixed.
// v1.1a adds the special-auction reserve contract (spec v1.1 §15, §17): off in the base case (D01).
import { withDuration, type BessInputs, type ContractInputs } from "./engine";
import type { Duration } from "./engine/library";
import { CONTRACT_DEFAULTS, CONTRACT_PRESET_MW } from "./engine/registry";

export type BessGroupId = "scenario" | "battery" | "revenue" | "contract" | "contractOps" | "costs" | "grid" | "war" | "financing" | "valuation";
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
  /** The value this field has when left alone, if it follows other inputs (the award's preset follows the duration);
   *  otherwise the base case's. */
  follows?: (i: BessInputs) => BessFieldValue;
  get: (i: BessInputs) => BessFieldValue;
  set: (i: BessInputs, v: BessFieldValue) => BessInputs;
}

type NumKey = { [K in keyof BessInputs]-?: BessInputs[K] extends number ? K : never }[keyof BessInputs];
type BoolKey = { [K in keyof BessInputs]-?: BessInputs[K] extends boolean ? K : never }[keyof BessInputs];

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

/** The contract as the fields see it: the case's own, or the defaults — off, with the duration's preset award. */
export const contractOf = (i: BessInputs): ContractInputs =>
  i.contract ?? { ...CONTRACT_DEFAULTS, enabled: false, acceptedMW: CONTRACT_PRESET_MW[i.durationH] };
const withContract = (i: BessInputs, patch: Partial<ContractInputs>): BessInputs => ({ ...i, contract: { ...contractOf(i), ...patch } });

type CNumKey = { [K in keyof ContractInputs]-?: ContractInputs[K] extends number ? K : never }[keyof ContractInputs];
type CBoolKey = { [K in keyof ContractInputs]-?: ContractInputs[K] extends boolean ? K : never }[keyof ContractInputs];

/** A number of the contract; `whole` rounds it (MW and months are whole numbers, spec §14). */
const cNumber = (key: CNumKey, whole = false) => ({
  get: (i: BessInputs) => contractOf(i)[key],
  set: (i: BessInputs, v: BessFieldValue) => withContract(i, { [key]: whole ? Math.round(Number(v)) : Number(v) }),
});
const cToggle = (key: CBoolKey) => ({
  get: (i: BessInputs) => contractOf(i)[key],
  set: (i: BessInputs, v: BessFieldValue) => withContract(i, { [key]: Boolean(v) }),
});
/** A select over numeric values of the contract, kept as strings in the interface. */
function cChoice(key: CNumKey, options: number[]) {
  return {
    options: options.map(String),
    get: (i: BessInputs) => String(contractOf(i)[key]),
    set: (i: BessInputs, v: BessFieldValue) => (options.map(String).includes(String(v)) ? withContract(i, { [key]: Number(v) }) : i),
  };
}

const noContract = (i: BessInputs) => !i.contract?.enabled;
/** Balancing-energy prices of 2025 against the day-ahead price (NEURC open data; spec v1.1 §4): up +60 %, down −87.5 %. */
const BSP_2025 = { balancingPremiumUp: 0.6, balancingPremiumDown: 0.875 };

export const BESS_FIELDS: BessFieldDef[] = [
  // Market scenario
  { id: "scn", group: "scenario", kind: "select", quick: true, sources: ["neighbours2025", "assumption"], ...choice("scenario", ["reference", "low", "high"]) },
  { id: "snap", group: "scenario", kind: "select", quick: true, sources: ["oreeDam"], ...choice("snapshot", ["UA-2025", "UA-LTM-2026-09"]) },
  { id: "cur", group: "scenario", kind: "select", sources: ["assumption"], ...choice("pathCurrency", ["EUR", "UAH"]) },

  // Battery
  {
    // the award at its preset follows the duration (spec v1.1 §3, V03)
    id: "dur", group: "battery", kind: "select", quick: true, sources: ["assumption"],
    options: ["1", "2", "4"],
    get: (i) => String(i.durationH),
    set: (i, v) => (["1", "2", "4"].includes(String(v)) ? withDuration(i, Number(v) as Duration) : i),
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

  // Reserve contract (v1.1a): the award
  {
    id: "ctr", group: "contract", kind: "switch", quick: true, sources: ["marketRules", "ukrenergoAuctions", "assumption"],
    get: (i) => i.contract?.enabled ?? false,
    set: (i, v) => withContract(i, { enabled: Boolean(v) }),
  },
  {
    id: "cmw", group: "contract", kind: "number", quick: true, unit: "MW", decimals: 0, min: 1, max: 50, usual: [5, 50], step: 1,
    sources: ["assumption"], hidden: noContract, follows: (i) => CONTRACT_PRESET_MW[i.durationH], ...cNumber("acceptedMW", true),
  },
  {
    // the renewal price follows the award price until it is set apart (spec §17: = p_c unless given)
    id: "cpr", group: "contract", kind: "number", quick: true, unit: "€/MW·h", decimals: 2, min: 0.5, max: 40, usual: [10, 25], step: 0.5,
    sources: ["ukrenergoRoundMay2025", "ukrenergoRoundDec2024", "ukrenergoRoundAug2024", "ukrenergoCaps", "assumption"], hidden: noContract,
    get: (i) => contractOf(i).eurPerMWHour,
    set: (i, v) => {
      const c = contractOf(i);
      return withContract(i, { eurPerMWHour: Number(v), ...(c.renewalPrice === c.eurPerMWHour && { renewalPrice: Number(v) }) });
    },
  },
  { id: "cren", group: "contract", kind: "switch", quick: true, sources: ["assumption"], hidden: noContract, ...cToggle("renewal") },
  {
    id: "crp", group: "contract", kind: "number", quick: true, unit: "€/MW·h", decimals: 2, min: 0.5, max: 40, usual: [10, 25], step: 0.5,
    sources: ["ukrenergoCaps", "assumption"], hidden: (i) => noContract(i) || !contractOf(i).renewal, follows: (i) => contractOf(i).eurPerMWHour,
    ...cNumber("renewalPrice"),
  },
  {
    id: "crt", group: "contract", kind: "number", quick: true, unit: "months", decimals: 0, min: 13, max: 60, usual: [13, 60], step: 1,
    sources: ["marketRules"], hidden: (i) => noContract(i) || !contractOf(i).renewal, ...cNumber("renewalTenorMonths", true),
  },
  { id: "cten", group: "contract", kind: "number", unit: "months", decimals: 0, min: 13, max: 60, usual: [13, 60], step: 1, sources: ["marketRules"], hidden: noContract, ...cNumber("tenorMonths", true) },
  {
    id: "chit", group: "contract", kind: "select", sources: ["marketRules", "assumption"], hidden: noContract,
    options: ["terminated", "suspended"],
    get: (i) => contractOf(i).onHit,
    set: (i, v) => (v === "terminated" || v === "suspended" ? withContract(i, { onHit: v }) : i),
  },
  { id: "cev", group: "contract", kind: "number", unit: "a year", decimals: 0, min: 0, max: 12, usual: [0, 6], step: 1, sources: ["marketRules", "neurc1294", "assumption"], hidden: noContract, ...cNumber("failureEvents") },
  { id: "cph", group: "contract", kind: "number", unit: "hours", decimals: 0, min: 0, max: 720, usual: [1, 48], step: 1, sources: ["marketRules"], hidden: noContract, ...cNumber("penaltyHours") },
  { id: "cliq", group: "contract", kind: "number", unit: "days", decimals: 0, min: 0, max: 30, usual: [0, 10], step: 1, sources: ["assumption"], hidden: noContract, ...cNumber("liquidityDays") },
  { id: "cded", group: "contract", kind: "switch", sources: ["taxCode", "assumption"], hidden: noContract, ...cToggle("deductible") },

  // Reserve contract: activation and payments
  {
    id: "cbsp", group: "contractOps", kind: "switch", quick: true, sources: ["neurcOpenData"], hidden: noContract,
    get: (i) => contractOf(i).balancingPremiumUp > 0 || contractOf(i).balancingPremiumDown > 0,
    set: (i, v) => withContract(i, v ? BSP_2025 : { balancingPremiumUp: 0, balancingPremiumDown: 0 }),
  },
  { id: "clag", group: "contractOps", kind: "select", quick: true, sources: ["marketRules", "assumption"], hidden: noContract, ...cChoice("balancingLagMonths", [1, 6, 12, 24]) },
  {
    id: "cnet", group: "contractOps", kind: "switch", quick: true, sources: ["marketRules"], hidden: noContract,
    get: (i) => contractOf(i).settlementRegime === "noOffset",
    set: (i, v) => withContract(i, { settlementRegime: v ? "noOffset" : "offset" }),
  },
  { id: "cas", group: "contractOps", kind: "select", quick: true, sources: ["marketRules"], hidden: noContract, ...cChoice("asPaymentLagMonths", [1, 2, 3, 4]) },
  { id: "csus", group: "contractOps", kind: "select", sources: ["tsc"], hidden: noContract, ...cChoice("sustainHours", [1, 1.5]) },
  { id: "crho", group: "contractOps", kind: "number", unit: "% of award", scale: 100, decimals: 0, min: 1, max: 100, usual: [10, 25], step: 1, sources: ["assumption"], hidden: noContract, ...cNumber("recoveryPowerShare") },
  { id: "cphi", group: "contractOps", kind: "number", unit: "×", decimals: 1, min: 1, max: 5, usual: [1.5, 3], step: 0.1, sources: ["assumption"], hidden: noContract, ...cNumber("peakDayFactor") },
  { id: "cau", group: "contractOps", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 15, usual: [0, 10], step: 0.5, sources: ["assumption"], hidden: noContract, ...cNumber("activationUp") },
  { id: "cad", group: "contractOps", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 15, usual: [0, 10], step: 0.5, sources: ["assumption"], hidden: noContract, ...cNumber("activationDown") },
  { id: "cnu", group: "contractOps", kind: "number", unit: "%", scale: 100, decimals: 0, min: 0, max: 100, usual: [0, 100], step: 5, sources: ["assumption"], hidden: noContract, ...cNumber("nettingShare") },
  { id: "ckap", group: "contractOps", kind: "number", unit: "%", scale: 100, decimals: 0, min: 0, max: 100, usual: [80, 100], step: 1, sources: ["assumption"], hidden: noContract, ...cNumber("balancingCollection") },
  { id: "cfee", group: "contractOps", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 100, usual: [0, 2], step: 0.1, sources: ["marketRules", "assumption"], hidden: noContract, ...cNumber("bsFeeShare") },
  { id: "clo", group: "contractOps", kind: "number", unit: "%/yr", scale: 100, decimals: 1, min: 0, max: 100, usual: [0, 5], step: 0.5, sources: ["marketRules", "assumption"], hidden: noContract, ...cNumber("otherLossRate") },
  { id: "clam", group: "contractOps", kind: "number", unit: "% of award", scale: 100, decimals: 1, min: 0, max: 5, usual: [0, 1], step: 0.1, sources: ["assumption"], hidden: noContract, ...cNumber("standingLoadShare") },

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

export const BESS_GROUPS: BessGroupId[] = ["scenario", "battery", "revenue", "contract", "contractOps", "costs", "grid", "war", "financing", "valuation"];

/** What a field counts as unchanged against: the value it follows, else the base case's. */
export function baseValue(f: BessFieldDef, inputs: BessInputs, base: BessInputs): BessFieldValue {
  return f.follows ? f.follows(inputs) : f.get(base);
}

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
