// Scenarios, tornado sensitivity and the bid calculator (Gebotsrechner).
import { P90_Z, runModel } from "./model";
import type { Inputs, Kpis, ModelResult } from "./types";

export type ScenarioName = "base" | "p90" | "downside";

/** Downside after financial close: P90 (10-year) yield, prices −20 %, opex +10 %, capex overrun +5 %. */
export const DOWNSIDE = { priceScale: 0.8, opexScale: 1.1, capexScale: 1.05 } as const;

export function p90Factor(sigma: number): number {
  return 1 - P90_Z * sigma;
}

/**
 * Base sizes the loan. P90 and Downside keep that loan (amount and repayment schedule) — the
 * lender's view after financial close — so their DSCRs show how much headroom the base case has.
 */
export function runScenarios(inputs: Inputs): Record<ScenarioName, ModelResult> {
  const base = runModel(inputs);
  const p90 = runModel(inputs, {
    scenario: { energyScale: p90Factor(inputs.energy.sigma1y) },
    lockedDebt: base.lockedDebt,
  });
  const downside = runModel(inputs, {
    scenario: { energyScale: p90Factor(inputs.energy.sigma10y), ...DOWNSIDE },
    lockedDebt: base.lockedDebt,
  });
  return { base, p90, downside };
}

// ---------------------------------------------------------------------------------------------
// Tornado
// ---------------------------------------------------------------------------------------------

export type TornadoMetric = "equityIrr" | "projectIrrPostTax" | "minDscr" | "lcoeRealCt";

export interface TornadoDriver {
  id: string;
  lowLabel: string;
  highLabel: string;
  apply: (inputs: Inputs, side: "low" | "high") => Inputs;
}

const scaleTuple = (t: [number, number, number], k: number): [number, number, number] => [t[0] * k, t[1] * k, t[2] * k];

function edit(inputs: Inputs, fn: (copy: Inputs) => void): Inputs {
  const copy = structuredClone(inputs);
  fn(copy);
  return copy;
}

/** Drivers and bounds as in docs/model-spec.md §6 (ranges from docs/assumptions.md). */
export const TORNADO_DRIVERS: TornadoDriver[] = [
  {
    id: "siteQuality",
    lowLabel: "60%",
    highLabel: "76%",
    apply: (i, s) => edit(i, (c) => void (c.energy.siteQuality = s === "low" ? 0.6 : 0.76)),
  },
  {
    id: "longTermPrice",
    lowLabel: "60 €/MWh",
    highLabel: "90 €/MWh",
    apply: (i, s) => edit(i, (c) => void (c.revenue.longTermBaseEurMwh2026 = s === "low" ? 60 : 90)),
  },
  {
    id: "captureFactor",
    lowLabel: "0.72",
    highLabel: "0.86",
    apply: (i, s) => edit(i, (c) => void (c.revenue.captureFactor = s === "low" ? 0.72 : 0.86)),
  },
  {
    id: "awardPrice",
    lowLabel: "4.49 ct",
    highLabel: "6.06 ct",
    apply: (i, s) => edit(i, (c) => void (c.revenue.awardPriceCt = s === "low" ? 4.49 : 6.06)),
  },
  {
    id: "capex",
    lowLabel: "−10%",
    highLabel: "+10%",
    apply: (i, s) =>
      edit(i, (c) => {
        const k = s === "low" ? 0.9 : 1.1;
        c.capex.items = c.capex.items.map((it) => ({ ...it, eurPerKw: it.eurPerKw * k }));
      }),
  },
  {
    id: "opex",
    lowLabel: "−10%",
    highLabel: "+10%",
    apply: (i, s) =>
      edit(i, (c) => {
        const k = s === "low" ? 0.9 : 1.1;
        c.opex.maintenancePerKw = scaleTuple(c.opex.maintenancePerKw, k);
        c.opex.managementPerKw = scaleTuple(c.opex.managementPerKw, k);
        c.opex.insurancePerKw = scaleTuple(c.opex.insurancePerKw, k);
        c.opex.otherPerKw = scaleTuple(c.opex.otherPerKw, k);
      }),
  },
  {
    id: "interestRate",
    lowLabel: "4.40%",
    highLabel: "6.05%",
    apply: (i, s) => edit(i, (c) => void (c.financing.interestRate = s === "low" ? 0.044 : 0.0605)),
  },
  {
    id: "inflation",
    lowLabel: "−0.5 pp",
    highLabel: "+0.5 pp",
    apply: (i, s) =>
      edit(i, (c) => {
        const d = s === "low" ? -0.005 : 0.005;
        c.macro.longRunInflation += d;
        c.macro.inflation = c.macro.inflation.map((v) => (v.year >= 2027 ? { ...v, value: v.value + d } : v));
      }),
  },
  {
    id: "negativePrices",
    lowLabel: "3%",
    highLabel: "9%",
    apply: (i, s) => edit(i, (c) => void (c.energy.negativePriceOutputShare = s === "low" ? 0.03 : 0.09)),
  },
  {
    id: "lease",
    lowLabel: "6%",
    highLabel: "14%",
    apply: (i, s) => edit(i, (c) => void (c.opex.leaseShareOfRevenue = s === "low" ? 0.06 : 0.14)),
  },
  {
    id: "hebesatz",
    lowLabel: "320%",
    highLabel: "450%",
    apply: (i, s) => edit(i, (c) => void (c.tax.hebesatz = s === "low" ? 3.2 : 4.5)),
  },
  {
    id: "lifetime",
    lowLabel: "25 yrs",
    highLabel: "30 yrs",
    apply: (i, s) => edit(i, (c) => void (c.project.lifetimeYears = s === "low" ? 25 : 30)),
  },
];

export interface TornadoBar {
  id: string;
  lowLabel: string;
  highLabel: string;
  low: number | null;
  high: number | null;
  base: number | null;
  range: number;
}

function metricOf(k: Kpis, metric: TornadoMetric): number | null {
  const v = k[metric];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Each bar is a full re-run with the loan re-sized — the view before financial close. */
export function tornado(inputs: Inputs, metric: TornadoMetric, drivers = TORNADO_DRIVERS): TornadoBar[] {
  const base = metricOf(runModel(inputs).kpis, metric);
  return drivers
    .map((d) => {
      const low = metricOf(runModel(d.apply(inputs, "low")).kpis, metric);
      const high = metricOf(runModel(d.apply(inputs, "high")).kpis, metric);
      const range = Math.abs((high ?? base ?? 0) - (low ?? base ?? 0));
      return { id: d.id, lowLabel: d.lowLabel, highLabel: d.highLabel, low, high, base, range };
    })
    .sort((a, b) => b.range - a.range);
}

// ---------------------------------------------------------------------------------------------
// Bid calculator
// ---------------------------------------------------------------------------------------------

export interface BidResult {
  /** Lowest award price (ct/kWh at the reference site) reaching the target, or null if none does. */
  awardPriceCt: number | null;
  awCt: number | null;
  equityIrr: number | null;
  searchedUpToCt: number;
}

/**
 * Lowest Zuschlagswert at which the equity IRR reaches the target, with the loan re-sized at every
 * step. The IRR is not monotonic in the award price (a higher floor raises the loan, and with an
 * expensive loan more debt can lower the equity return), so the search scans a grid for the first
 * crossing and then bisects inside that step.
 */
export function solveAwardPrice(inputs: Inputs, targetEquityIrr: number, maxCt = 15, stepCt = 0.25): BidResult {
  const irrAt = (ct: number) => {
    const r = runModel(edit(inputs, (c) => void (c.revenue.awardPriceCt = ct))).kpis;
    return { irr: r.equityIrr, awCt: r.awCt };
  };
  let prev = 0.5;
  for (let ct = 0.5; ct <= maxCt + 1e-9; ct += stepCt) {
    const at = irrAt(ct);
    if (at.irr !== null && at.irr >= targetEquityIrr) {
      if (ct === 0.5) return { awardPriceCt: ct, awCt: at.awCt, equityIrr: at.irr, searchedUpToCt: maxCt };
      let lo = prev;
      let hi = ct;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        const m = irrAt(mid);
        if (m.irr !== null && m.irr >= targetEquityIrr) hi = mid;
        else lo = mid;
        if (hi - lo < 0.0005) break;
      }
      const res = irrAt(hi);
      return { awardPriceCt: hi, awCt: res.awCt, equityIrr: res.irr, searchedUpToCt: maxCt };
    }
    prev = ct;
  }
  return { awardPriceCt: null, awCt: null, equityIrr: null, searchedUpToCt: maxCt };
}
