// German sensitivity (spec v1.2 R2.2 §15, registry SENS): the tornado with the funding fixed at close — each driver moved
// alone, the loan as signed — and the variants before investment, each with the loan sized again. The investor NPV at
// the hurdle is the measure (it exists in every supported case); the IRR comes along where it is defined.
import { contractualFunding, runDe, withDeDuration } from "./index";
import type { DeLibrary } from "./library";
import { DE_VARIANTS } from "./registry";
import type { DeInputs, DeLockedFunding, DeMetric, DeStatus } from "./types";

export type DeDriverId =
  | "spread" | "capture" | "capex" | "development" | "rate" | "rte" | "degradation" | "tollPrice" | "availability" | "agnes" | "bkz" | "afaBattery";

type Patch = (i: DeInputs) => Partial<DeInputs>;

/** The low and high settings of registry SENS; a stress that only goes one way has no other side. */
export const DE_DRIVERS: { id: DeDriverId; low: Patch | null; high: Patch | null; applies?: (i: DeInputs) => boolean }[] = [
  { id: "spread", low: (i) => ({ spreadMultiplierK: i.spreadMultiplierK * 0.8 }), high: (i) => ({ spreadMultiplierK: i.spreadMultiplierK * 1.2 }) },
  { id: "capture", low: () => ({ captureFactor: 0.65 }), high: () => ({ captureFactor: 0.85 }) },
  { id: "capex", low: (i) => ({ capexFactor: i.capexFactor * 0.9 }), high: (i) => ({ capexFactor: i.capexFactor * 1.11 }) },
  { id: "development", low: (i) => ({ developmentFactor: i.developmentFactor * 0.5 }), high: (i) => ({ developmentFactor: i.developmentFactor * 1.5 }) },
  {
    id: "rate",
    low: (i) => ({ interestRate: Math.max(0, i.interestRate - 0.015) }),
    high: (i) => ({ interestRate: i.interestRate + 0.015 }),
    applies: (i) => i.debt,
  },
  { id: "rte", low: () => ({ rte: 0.88 }), high: () => ({ rte: 0.9 }) },
  { id: "degradation", low: null, high: () => ({ degradationStress: true }) },
  // G03: €110 000 against €120 000 for 2 h, €137 500 against €150 000 for 4 h
  { id: "tollPrice", low: (i) => ({ tollPrice: (i.tollPrice * 110) / 120 }), high: null, applies: (i) => i.tollEnabled && i.tollShare > 0 },
  { id: "availability", low: null, high: () => ({ availability: 0.93, availabilityYear1: 0.93 }) },
  { id: "agnes", low: () => ({ agnesFee: 0 }), high: () => ({ agnesFee: 7000 }) },
  { id: "bkz", low: () => ({ bkzPerKw: 0 }), high: () => ({ bkzPerKw: 165 }) },
  { id: "afaBattery", low: null, high: () => ({ afaBatteryYears: 10 }) },
];

export interface DeOutcome {
  npv: number | null;
  irr: DeMetric;
  /** A setting without a result (outside the input domain or the library) is shown as its status, not a number. */
  status?: DeStatus["primary"];
}

export interface DeTornadoBar {
  id: DeDriverId;
  low: DeOutcome | null;
  high: DeOutcome | null;
}

export interface DeTornado {
  base: DeOutcome;
  bars: DeTornadoBar[];
}

const NO_IRR: DeMetric = { value: null, status: "notDefined" };

function outcome(inp: DeInputs, lib: DeLibrary, funding: DeLockedFunding | undefined, patch: Patch | null): DeOutcome {
  const next = patch ? { ...inp, ...patch(inp) } : inp;
  const r = runDe(next, lib, { funding });
  if (r.status.primary !== "ok" || !r.kpis) return { npv: null, irr: NO_IRR, status: r.status.primary };
  return { npv: r.kpis.investorNpvEur!.value, irr: r.kpis.investorIrr! };
}

/** Every driver that applies to the case at its settings, with the given funding; bars sorted by the swing of the NPV. */
export function deTornado(inp: DeInputs, lib: DeLibrary, funding: DeLockedFunding | null): DeTornado {
  const locked = funding && funding.debtEur > 0 ? funding : undefined;
  const base = outcome(inp, lib, locked, null);
  const bars: DeTornadoBar[] = DE_DRIVERS.filter((d) => d.applies?.(inp) ?? true).map((d) => ({
    id: d.id,
    low: d.low ? outcome(inp, lib, locked, d.low) : null,
    high: d.high ? outcome(inp, lib, locked, d.high) : null,
  }));
  const swing = (b: DeTornadoBar) => {
    const v = [b.low?.npv, b.high?.npv].filter((x): x is number => typeof x === "number");
    return v.length && base.npv !== null ? Math.max(...v.map((x) => Math.abs(x - base.npv!))) : 0;
  };
  return { base, bars: bars.sort((a, b) => swing(b) - swing(a)) };
}

export type DeVariantId = "fourHours" | "oneHour" | "low" | "high" | "ltm" | "noDebt" | "merchant" | "grandfathered" | "loan15";

/** Variants before investment (registry SENS): one change at a time, the loan sized again — on the contractual timing
 *  if the case is delayed (spec §18). */
export const DE_VARIANT_LIST: { id: DeVariantId; patch: (i: DeInputs) => DeInputs }[] = [
  { id: "fourHours", patch: (i) => withDeDuration(i, 4) },
  { id: "oneHour", patch: (i) => ({ ...i, durationHours: 1 }) },
  { id: "low", patch: (i) => ({ ...i, spreadPath: "low" }) },
  { id: "high", patch: (i) => ({ ...i, spreadPath: "high" }) },
  { id: "ltm", patch: (i) => ({ ...i, snapshot: "DE-LTM-2026-09" }) },
  { id: "noDebt", patch: (i) => ({ ...i, ...DE_VARIANTS.tollNoDebt }) },
  { id: "merchant", patch: (i) => ({ ...i, ...DE_VARIANTS.merchant }) },
  { id: "grandfathered", patch: (i) => ({ ...i, grandfathered: true }) },
  // G07: 30 semi-annual payments 01.08.2028 … 01.02.2043
  { id: "loan15", patch: (i) => ({ ...i, repaymentCount: 30 }) },
];

export interface DeVariant {
  id: DeVariantId;
  investorIrr: DeMetric;
  investorNpv: number | null;
  /** The hurdle the NPV is taken at: the merchant variant has its own (registry FIN). */
  hurdle: number;
  debtEur: number | null;
  /** A variant without a result: its status (1 h is outside the supported durations, G15). */
  status?: DeStatus["primary"];
}

const same = (a: DeInputs, b: DeInputs) => (Object.keys(a) as (keyof DeInputs)[]).every((k) => a[k] === b[k]);

/** The variants that differ from the inputs (a case equal to them is left out); a loan variant needs a loan. */
export function deVariants(inp: DeInputs, lib: DeLibrary): DeVariant[] {
  const out: DeVariant[] = [];
  for (const v of DE_VARIANT_LIST) {
    const next = v.patch(inp);
    if (same(next, inp) || (v.id === "loan15" && !inp.debt)) continue;
    const r = runDe(next, lib, { funding: contractualFunding(next, lib) });
    if (r.status.primary !== "ok" || !r.kpis) {
      out.push({ id: v.id, investorIrr: NO_IRR, investorNpv: null, hurdle: next.equityHurdle, debtEur: null, status: r.status.primary });
      continue;
    }
    out.push({
      id: v.id,
      investorIrr: r.kpis.investorIrr!,
      investorNpv: r.kpis.investorNpvEur!.value,
      hurdle: next.equityHurdle,
      debtEur: r.kpis.debtEur!.value,
    });
  }
  return out;
}
