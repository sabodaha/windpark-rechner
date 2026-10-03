// What the battery calculator shows for one set of inputs. The same functions run at build time (the static page
// shows the base case) and in the browser's worker, so both always agree.
import {
  breakEvenSpread, contractBreakEven, contractCmax, pStarTemplate, runBess, type BessInputs, type BessResult, type BreakEven, type ContractBreakEven,
  type Library, type LockedFunding, type Metric,
} from "./engine";
import { buildCalendar } from "./engine/calendar";
import { bessTornado, bessVariants, type BessTornado, type BessVariant } from "./engine/sensitivity";
import { toIso } from "@/engine/dates";

/** The run itself and, with a loan, the same project without one (C06): what the asset earns before leverage. */
export interface BessCore {
  inputs: BessInputs;
  result: BessResult;
  noDebt: { investorIrr: Metric; investorNpv: Metric } | null;
}

/** Answers to "what would it take": the break-even spread multiplier and alternative cases. Slower; they follow. */
export interface BessExtras {
  breakEven: BreakEven;
  variants: BessVariant[];
}

export function computeCore(inputs: BessInputs, lib: Library): BessCore {
  const result = runBess(inputs, lib);
  const plain = inputs.debt ? runBess({ ...inputs, debt: false }, lib) : null;
  return {
    inputs,
    result,
    noDebt: plain ? { investorIrr: plain.kpis.investorIrr!, investorNpv: plain.kpis.investorNpv! } : null,
  };
}

export function computeExtras(inputs: BessInputs, lib: Library, funding: LockedFunding): BessExtras {
  return { breakEven: breakEvenSpread(inputs, lib, funding), variants: bessVariants(inputs, lib) };
}

export function computeTornado(inputs: BessInputs, lib: Library, funding: LockedFunding): BessTornado {
  return bessTornado(inputs, lib, funding);
}

/** The reserve contract's answers (spec v1.1 R3.1 §3, §12): the break-even contract price on the disclosed template —
 *  the case's own contract without renewal, or the default contract with the duration's preset — and the largest
 *  award the battery holds. A slow job; it runs after the main run and the break-even spread. */
export interface BessPStar {
  breakEven: ContractBreakEven;
  cMax: number;
  /** The contract the scan used, for the text: the case's own (without a second award) or the default one. */
  template: { own: boolean; acceptedMW: number; tenorMonths: number; start: string };
}

export function computePStar(inputs: BessInputs, lib: Library): BessPStar {
  const c = pStarTemplate(inputs);
  // C_max of the contract as entered (renewal included); without one, of the p* template
  const own = inputs.contract?.enabled ? inputs : { ...inputs, contract: { ...c, enabled: true } };
  const cal = buildCalendar(inputs.codDelayMonths);
  const start = toIso(cal.months[Math.min(cal.plannedCodIndex + c.startOffsetFromCod, cal.months.length - 1)]!.start);
  return {
    breakEven: contractBreakEven(inputs, lib),
    cMax: contractCmax(own, lib),
    template: { own: inputs.contract?.enabled === true, acceptedMW: c.acceptedMW, tenorMonths: c.tenorMonths, start },
  };
}

export type { BessTornado, BessVariant };
