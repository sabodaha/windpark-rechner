// Sensitivity with the funding fixed at close (model-spec §16): each driver moved alone, the loan as signed. The
// investor NPV at the hurdle is the measure (it exists in every case); the IRR comes along where it is defined.
import { runBess, type RunOptions } from "./index";
import type { Library } from "./library";
import type { BessInputs, LockedFunding, Metric } from "./types";

export type BessDriverId = "spread" | "capture" | "capex" | "war" | "rate" | "fx" | "rte" | "degradation" | "aux" | "grossTariff";

/** One setting of a driver: what changes in the inputs, and what changes in the run itself. */
interface Setting {
  inputs?: (i: BessInputs) => Partial<BessInputs>;
  run?: RunOptions;
}

/** The low and high settings of each driver; a stress that only goes one way has no low side. */
export const BESS_DRIVERS: { id: BessDriverId; low: Setting | null; high: Setting }[] = [
  { id: "spread", low: { run: { spreadScale: 0.8 } }, high: { run: { spreadScale: 1.2 } } },
  { id: "capture", low: { inputs: () => ({ captureFactor: 0.65 }) }, high: { inputs: () => ({ captureFactor: 0.85 }) } },
  { id: "capex", low: { inputs: (i) => ({ capexFactor: i.capexFactor * 0.9 }) }, high: { inputs: (i) => ({ capexFactor: i.capexFactor * 1.11 }) } },
  { id: "war", low: { inputs: () => ({ lossRatio: 0.2 }) }, high: { inputs: () => ({ lossRatio: 0.5 }) } },
  { id: "rate", low: { inputs: (i) => ({ interestRate: Math.max(0, i.interestRate - 0.015) }) }, high: { inputs: (i) => ({ interestRate: i.interestRate + 0.015 }) } },
  { id: "fx", low: null, high: { inputs: () => ({ fxStress: true }) } },
  { id: "rte", low: { inputs: () => ({ rte: 0.88 }) }, high: { inputs: () => ({ rte: 0.9 }) } },
  { id: "degradation", low: null, high: { inputs: () => ({ degradationStress: true }) } },
  { id: "aux", low: null, high: { inputs: () => ({ auxStress: true }) } },
  { id: "grossTariff", low: null, high: { run: { grossTariffFromCod: true } } },
];

export interface DriverOutcome {
  npv: number | null;
  irr: Metric;
}

export interface BessTornadoBar {
  id: BessDriverId;
  low: DriverOutcome | null;
  high: DriverOutcome;
}

export interface BessTornado {
  base: DriverOutcome;
  bars: BessTornadoBar[];
}

function outcome(inp: BessInputs, lib: Library, funding: LockedFunding, setting: Setting | null): DriverOutcome {
  const patched = setting?.inputs ? { ...inp, ...setting.inputs(inp) } : inp;
  const r = runBess(patched, lib, { ...setting?.run, funding });
  return { npv: r.kpis.investorNpv!.value, irr: r.kpis.investorIrr! };
}

export type BessVariantId =
  | "fourHours" | "oneHour" | "high" | "low" | "ltm" | "capture85" | "war16" | "noWar" | "capexMinus10" | "noDebt" | "blocked" | "favourable";

/** Alternative cases before investment: one change at a time (the last one combined), the loan sized again. */
export const BESS_VARIANTS: { id: BessVariantId; patch: (i: BessInputs) => Partial<BessInputs> }[] = [
  { id: "fourHours", patch: () => ({ durationH: 4 }) },
  { id: "oneHour", patch: () => ({ durationH: 1 }) },
  { id: "high", patch: () => ({ scenario: "high" }) },
  { id: "low", patch: () => ({ scenario: "low" }) },
  { id: "ltm", patch: () => ({ snapshot: "UA-LTM-2026-09" }) },
  { id: "capture85", patch: () => ({ captureFactor: 0.85 }) },
  { id: "war16", patch: () => ({ lossRatio: 0.2 }) },
  { id: "noWar", patch: () => ({ lossRatio: 0 }) },
  { id: "capexMinus10", patch: (i) => ({ capexFactor: i.capexFactor * 0.9 }) },
  { id: "noDebt", patch: () => ({ debt: false }) },
  { id: "blocked", patch: () => ({ terminalRemittance: "blocked" }) },
  { id: "favourable", patch: () => ({ durationH: 4, scenario: "high", captureFactor: 0.85, lossRatio: 0.2 }) },
];

export interface BessVariant {
  id: BessVariantId;
  investorIrr: Metric;
  investorNpv: number | null;
  debtEur: number | null;
}

const changes = (inp: BessInputs, patch: Partial<BessInputs>) =>
  (Object.keys(patch) as (keyof BessInputs)[]).some((k) => patch[k] !== inp[k]);

/** The alternative cases that differ from the inputs (a case equal to them is left out). */
export function bessVariants(inp: BessInputs, lib: Library): BessVariant[] {
  const out: BessVariant[] = [];
  for (const v of BESS_VARIANTS) {
    const patch = v.patch(inp);
    if (!changes(inp, patch)) continue;
    const r = runBess({ ...inp, ...patch }, lib);
    out.push({ id: v.id, investorIrr: r.kpis.investorIrr!, investorNpv: r.kpis.investorNpv!.value, debtEur: r.kpis.debtEur!.value });
  }
  return out;
}

/** Every driver at its low and high setting with the given funding; bars sorted by the swing of the NPV. */
export function bessTornado(inp: BessInputs, lib: Library, funding: LockedFunding): BessTornado {
  const base = outcome(inp, lib, funding, null);
  const swing = (b: BessTornadoBar) => {
    const v = [b.low?.npv, b.high.npv].filter((x): x is number => x !== null && x !== undefined);
    return v.length && base.npv !== null ? Math.max(...v.map((x) => Math.abs(x - base.npv!))) : 0;
  };
  const bars = BESS_DRIVERS.map((d) => ({
    id: d.id,
    low: d.low ? outcome(inp, lib, funding, d.low) : null,
    high: outcome(inp, lib, funding, d.high),
  }));
  return { base, bars: bars.sort((a, b) => swing(b) - swing(a)) };
}
