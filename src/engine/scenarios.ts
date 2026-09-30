// Scenarios, tornado sensitivity and the bid calculator (Gebotsrechner).
import { P90_Z, runModel } from "./model";
import type { Inputs, Kpis, ModelResult, ScenarioAdjustments } from "./types";

/**
 * base: sizes the loan. p90: the lender's stress — one-year P90 output in every year. resource: ten-year P90
 * output, the investor's view of a weaker wind resource. downside: ten-year P90 output plus price, cost and capex
 * stresses. The multi-year stresses apply the § 36h (2) site-quality review.
 */
export type ScenarioName = "base" | "p90" | "resource" | "downside";
export const SCENARIOS: ScenarioName[] = ["base", "p90", "resource", "downside"];

/** Downside after financial close: power prices −20 %, fixed opex and grid fee +10 %, capex overrun +5 %. */
export const DOWNSIDE = { priceScale: 0.8, opexScale: 1.1, capexScale: 1.05 } as const;

export function p90Factor(sigma: number): number {
  return 1 - P90_Z * sigma;
}

export function scenarioAdjustments(inputs: Inputs, name: ScenarioName): Partial<ScenarioAdjustments> {
  switch (name) {
    case "base":
      return {};
    case "p90":
      return { energyScale: p90Factor(inputs.energy.sigma1y) };
    case "resource":
      return { energyScale: p90Factor(inputs.energy.sigma10y), siteQualityReview: true };
    case "downside":
      return { energyScale: p90Factor(inputs.energy.sigma10y), ...DOWNSIDE, siteQualityReview: true };
  }
}

/**
 * Base sizes the loan. The stress scenarios keep that loan (amount and every instalment) — the lender's view
 * after financial close — so their DSCRs show how much headroom the base case has.
 */
export function runScenarios(inputs: Inputs, options: { trace?: boolean } = {}): Record<ScenarioName, ModelResult> {
  const trace = options.trace ?? false;
  const base = runModel(inputs, { trace });
  const locked = (name: ScenarioName) =>
    runModel(inputs, { scenario: scenarioAdjustments(inputs, name), lockedDebt: base.lockedDebt, trace });
  return { base, p90: locked("p90"), resource: locked("resource"), downside: locked("downside") };
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
    // More output in negative-price periods also lowers the market value of wind: output that would have earned
    // the average price now earns about nothing, so the capture factor moves with (1 − share).
    id: "negativePrices",
    lowLabel: "3%",
    highLabel: "9%",
    apply: (i, s) =>
      edit(i, (c) => {
        const share = s === "low" ? 0.03 : 0.09;
        const k = (1 - share) / (1 - c.energy.negativePriceOutputShare);
        c.revenue.captureFactor = Math.min(2, Math.max(0.1, c.revenue.captureFactor * k));
        c.energy.negativePriceOutputShare = share;
      }),
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

/** A run that cannot be calculated (e.g. a driver pushes an input out of range) gives no value. */
function tryRun(inputs: Inputs): ModelResult | null {
  try {
    return runModel(inputs);
  } catch {
    return null;
  }
}

/** Each bar is a full re-run with the loan re-sized — the view before financial close. */
export function tornado(inputs: Inputs, metric: TornadoMetric, drivers = TORNADO_DRIVERS): TornadoBar[] {
  const at = (i: Inputs) => {
    const r = tryRun(i);
    return r ? metricOf(r.kpis, metric) : null;
  };
  const base = at(inputs);
  return drivers
    .map((d) => {
      const low = at(d.apply(inputs, "low"));
      const high = at(d.apply(inputs, "high"));
      const range = Math.abs((high ?? base ?? 0) - (low ?? base ?? 0));
      return { id: d.id, lowLabel: d.lowLabel, highLabel: d.highLabel, low, high, base, range };
    })
    .sort((a, b) => b.range - a.range);
}

// ---------------------------------------------------------------------------------------------
// Bid calculator
// ---------------------------------------------------------------------------------------------

export interface BidPoint {
  awardPriceCt: number;
  awCt: number;
  equityIrr: number | null;
}

export interface BidResult {
  /** Lowest award price at which the equity IRR reaches the target, whether or not the case is financeable. */
  target: BidPoint | null;
  /** Lowest award price that reaches the target with a financeable case: fully funded and the covenant met. */
  feasible: BidPoint | null;
  /** The feasible price is at or below the tender ceiling of the inputs. */
  admissible: boolean | null;
  ceilingCt: number;
  searchedUpToCt: number;
  stepCt: number;
  toleranceCt: number;
}

/**
 * Lowest Zuschlagswert at which the equity IRR reaches the target, with the loan re-sized at every step. The IRR
 * is not monotonic in the award price (a higher floor raises the loan, and with an expensive loan more debt can
 * lower the equity return), so the search scans a grid for the first price that qualifies and then bisects
 * inside that step. Two answers: the price for the return alone, and the price that also keeps the case funded
 * and within its covenant.
 */
export function solveAwardPrice(inputs: Inputs, targetEquityIrr: number, maxCt = 15, stepCt = 0.25): BidResult {
  const toleranceCt = 0.0005;
  const cache = new Map<number, { point: BidPoint; reaches: boolean; financeable: boolean }>();
  const at = (ct: number) => {
    const hit = cache.get(ct);
    if (hit) return hit;
    const r = tryRun(edit(inputs, (c) => void (c.revenue.awardPriceCt = ct)));
    const irr = r?.kpis.equityIrr ?? null;
    const v = r?.validity;
    const entry = {
      point: { awardPriceCt: ct, awCt: r?.kpis.awCt ?? NaN, equityIrr: irr },
      reaches: irr !== null && irr >= targetEquityIrr,
      financeable:
        !!v && v.integrity !== "error" && v.funding !== "error" && v.covenant !== "error" && v.returnsMeaningful,
    };
    cache.set(ct, entry);
    return entry;
  };
  const search = (ok: (e: ReturnType<typeof at>) => boolean): BidPoint | null => {
    let prev = 0.5;
    for (let ct = 0.5; ct <= maxCt + 1e-9; ct += stepCt) {
      const c = Math.round(ct * 1e6) / 1e6;
      if (!ok(at(c))) {
        prev = c;
        continue;
      }
      if (c === 0.5) return at(c).point;
      let lo = prev;
      let hi = c;
      while (hi - lo >= toleranceCt) {
        const mid = (lo + hi) / 2;
        if (ok(at(mid))) hi = mid;
        else lo = mid;
      }
      return at(hi).point;
    }
    return null;
  };
  const target = search((e) => e.reaches);
  const feasible = search((e) => e.reaches && e.financeable);
  const ceilingCt = inputs.revenue.ceilingPriceCt;
  return {
    target,
    feasible,
    admissible: feasible ? feasible.awardPriceCt <= ceilingCt + 1e-9 : null,
    ceilingCt,
    searchedUpToCt: maxCt,
    stepCt,
    toleranceCt,
  };
}
