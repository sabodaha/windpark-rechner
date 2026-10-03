// Sensitivity with the funding fixed at close (model-spec §16): each driver moved alone, the loan as signed. The
// investor NPV at the hurdle is the measure (it exists in every case); the IRR comes along where it is defined.
// With the reserve contract on, its own drivers join (spec v1.1 §15).
import { runBess, withDuration, type RunOptions } from "./index";
import type { Library } from "./library";
import type { BessInputs, CaseStatus, ContractInputs, LockedFunding, Metric } from "./types";

export type BessDriverId =
  | "spread" | "capture" | "capex" | "war" | "rate" | "fx" | "rte" | "degradation" | "aux" | "grossTariff"
  | "cPrice" | "cActivation" | "cNetting" | "cSustain" | "cRecovery" | "cPeakDay" | "cEvents" | "cPenaltyWindow" | "cOtherLoss"
  | "cBsFee" | "cAsLag" | "cCollection" | "cDeductible" | "cLoad";

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

const award = (patch: (c: ContractInputs) => Partial<ContractInputs>) => (i: BessInputs) => ({ contract: { ...i.contract!, ...patch(i.contract!) } });

/** The contract's drivers (spec v1.1 §15), applied only when the contract is on. */
export const BESS_CONTRACT_DRIVERS: typeof BESS_DRIVERS = [
  { id: "cPrice", low: { inputs: award((c) => ({ eurPerMWHour: c.eurPerMWHour * 0.8 })) }, high: { inputs: award((c) => ({ eurPerMWHour: c.eurPerMWHour * 1.2 })) } },
  { id: "cActivation", low: { inputs: award(() => ({ activationUp: 0, activationDown: 0 })) }, high: { inputs: award(() => ({ activationUp: 0.1, activationDown: 0.1 })) } },
  { id: "cNetting", low: { inputs: award(() => ({ nettingShare: 0 })) }, high: { inputs: award(() => ({ nettingShare: 1 })) } },
  { id: "cSustain", low: null, high: { inputs: award(() => ({ sustainHours: 1.5 })) } },
  { id: "cRecovery", low: null, high: { inputs: award(() => ({ recoveryPowerShare: 0.25 })) } },
  { id: "cPeakDay", low: null, high: { inputs: award(() => ({ peakDayFactor: 3 })) } },
  { id: "cEvents", low: { inputs: award(() => ({ failureEvents: 0 })) }, high: { inputs: award(() => ({ failureEvents: 12 })) } },
  { id: "cPenaltyWindow", low: null, high: { inputs: award(() => ({ penaltyHours: 720 })) } },
  { id: "cOtherLoss", low: null, high: { inputs: award(() => ({ otherLossRate: 0.05 })) } },
  { id: "cBsFee", low: null, high: { inputs: award(() => ({ bsFeeShare: 0.02 })) } },
  { id: "cAsLag", low: null, high: { inputs: award(() => ({ asPaymentLagMonths: 4 })) } },
  { id: "cCollection", low: null, high: { inputs: award(() => ({ balancingCollection: 0.9 })) } },
  { id: "cDeductible", low: null, high: { inputs: award(() => ({ deductible: false })) } },
  { id: "cLoad", low: null, high: { inputs: award(() => ({ standingLoadShare: 0.005 })) } },
];

export interface DriverOutcome {
  npv: number | null;
  irr: Metric;
  /** Contract cases: the primary status when the setting gives no result (shown as a status, not a number; spec v1.1 §15). */
  status?: CaseStatus["primary"];
}

/** A contract case without a result: input or physically unsupported, or a calculation error. */
const noResult = (inp: BessInputs, p: CaseStatus["primary"]) => inp.contract?.enabled === true && p !== "ok" && p !== "cancelled";

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
  if (noResult(patched, r.status.primary)) return { npv: null, irr: { value: null, status: "notDefined" }, status: r.status.primary };
  return { npv: r.kpis.investorNpv!.value, irr: r.kpis.investorIrr! };
}

export type BessVariantId =
  | "fourHours" | "oneHour" | "high" | "low" | "ltm" | "capture85" | "war16" | "noWar" | "capexMinus10" | "noDebt" | "blocked" | "favourable";

/** A duration change with the award following its preset (V03); only the keys that change. */
const durationPatch = (i: BessInputs, d: BessInputs["durationH"]): Partial<BessInputs> => {
  const next = withDuration(i, d);
  return next.contract === i.contract ? { durationH: d } : { durationH: d, contract: next.contract };
};

/** Alternative cases before investment: one change at a time (the last one combined), the loan sized again. */
export const BESS_VARIANTS: { id: BessVariantId; patch: (i: BessInputs) => Partial<BessInputs> }[] = [
  { id: "fourHours", patch: (i) => durationPatch(i, 4) },
  { id: "oneHour", patch: (i) => durationPatch(i, 1) },
  { id: "high", patch: () => ({ scenario: "high" }) },
  { id: "low", patch: () => ({ scenario: "low" }) },
  { id: "ltm", patch: () => ({ snapshot: "UA-LTM-2026-09" }) },
  { id: "capture85", patch: () => ({ captureFactor: 0.85 }) },
  { id: "war16", patch: () => ({ lossRatio: 0.2 }) },
  { id: "noWar", patch: () => ({ lossRatio: 0 }) },
  { id: "capexMinus10", patch: (i) => ({ capexFactor: i.capexFactor * 0.9 }) },
  { id: "noDebt", patch: () => ({ debt: false }) },
  { id: "blocked", patch: () => ({ terminalRemittance: "blocked" }) },
  { id: "favourable", patch: (i) => ({ ...durationPatch(i, 4), scenario: "high", captureFactor: 0.85, lossRatio: 0.2 }) },
];

export interface BessVariant {
  id: BessVariantId;
  investorIrr: Metric;
  investorNpv: number | null;
  debtEur: number | null;
  /** Contract cases: the primary status when the variant gives no result. */
  status?: CaseStatus["primary"];
}

const changes = (inp: BessInputs, patch: Partial<BessInputs>) =>
  (Object.keys(patch) as (keyof BessInputs)[]).some((k) => patch[k] !== inp[k]);

/** The alternative cases that differ from the inputs (a case equal to them is left out). */
export function bessVariants(inp: BessInputs, lib: Library): BessVariant[] {
  const out: BessVariant[] = [];
  for (const v of BESS_VARIANTS) {
    const patch = v.patch(inp);
    if (!changes(inp, patch)) continue;
    const next = { ...inp, ...patch };
    const r = runBess(next, lib);
    if (noResult(next, r.status.primary)) {
      out.push({ id: v.id, investorIrr: { value: null, status: "notDefined" }, investorNpv: null, debtEur: null, status: r.status.primary });
      continue;
    }
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
  const drivers = inp.contract?.enabled ? [...BESS_DRIVERS, ...BESS_CONTRACT_DRIVERS] : BESS_DRIVERS;
  const bars = drivers.map((d) => ({
    id: d.id,
    low: d.low ? outcome(inp, lib, funding, d.low) : null,
    high: outcome(inp, lib, funding, d.high),
  }));
  return { base, bars: bars.sort((a, b) => swing(b) - swing(a)) };
}
