// What the battery calculator shows for one set of inputs. The same functions run at build time (the static page
// shows the base case) and in the browser's worker, so both always agree.
import { breakEvenSpread, runBess, type BessInputs, type BessResult, type BreakEven, type Library, type LockedFunding, type Metric } from "./engine";
import { bessTornado, bessVariants, type BessTornado, type BessVariant } from "./engine/sensitivity";

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

export type { BessTornado, BessVariant };
