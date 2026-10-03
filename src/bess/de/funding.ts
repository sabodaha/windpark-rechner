// German debt sizing (spec v1.2 R2 §7.3, K09): the lender case's period budgets from the two buckets — contracted (toll)
// at 1.15, merchant at 2.0, a negative bucket subtracted in full — sculpted with the shared S1.3 recursion (non-increasing
// balance, budget/rate cap), capped at the gearing limit, solved by damped iteration and locked.
import { periodRates, sculpt } from "../engine/funding";
import type { DeCalendar } from "./calendar";
import type { DeCapexBuild } from "./capex";
import { runDeLedger, type DeLedgerOptions, type DeLedgerResult } from "./ledger";
import type { DeOpsResult } from "./operations";
import { DE_FINANCE } from "./registry";
import type { DeInputs, DeLockedFunding } from "./types";

export function bucketBudget(c: number, m: number, dscrC: number, dscrM: number): number {
  return Math.max(0, Math.max(c, 0) / dscrC + Math.max(m, 0) / dscrM - Math.max(-c, 0) - Math.max(-m, 0));
}

export interface DeSizingResult {
  funding: DeLockedFunding;
  ledger: DeLedgerResult;
}

export function sizeDeDebt(inp: DeInputs, opsLender: DeOpsResult, capex: DeCapexBuild, cal: DeCalendar, liquidityEur: number, opt: DeLedgerOptions): DeSizingResult {
  const rates = periodRates(cal, inp.interestRate);
  let funding: DeLockedFunding = {
    debtEur: 0, principalEur: new Array(cal.periods.length).fill(0), dsraInitialEur: 0, liquidityReserveEur: liquidityEur,
    sizingStatus: "failed", iterations: 0,
  };
  let ledger = runDeLedger(inp, opsLender, capex, cal, funding, opt);
  for (let it = 1; it <= DE_FINANCE.sizingMaxIterations; it++) {
    const budgets = ledger.periods.map((p) => bucketBudget(p.cfadsCEur, p.cfadsMEur, inp.targetDscrContracted, inp.targetDscrMerchant));
    const { opening, closing } = sculpt(budgets, rates);
    const cap = inp.maxGearing * ledger.usesExVatEur;
    const target = Math.max(0, Math.min(opening, cap));
    const s = opening > 0 ? target / opening : 0;
    const close = closing.map((v) => v * s);
    const principalT = close.map((cl, k) => (k === 0 ? target : close[k - 1]!) - cl);
    const ds1T = target > 0 ? principalT[0]! + target * rates[0]! : 0;
    const gap = Math.abs(target - funding.debtEur) + Math.abs(ds1T - funding.dsraInitialEur);
    const next = funding.debtEur + DE_FINANCE.sizingDamping * (target - funding.debtEur);
    const k = target > 0 ? next / target : 0;
    funding = {
      debtEur: next, principalEur: principalT.map((p) => p * k), dsraInitialEur: ds1T * k, liquidityReserveEur: liquidityEur,
      sizingStatus: "failed", iterations: it,
    };
    if (gap < DE_FINANCE.sizingTolerance) {
      // converged: lock the undamped solution itself, so the lender case meets its cover exactly
      funding = { debtEur: target, principalEur: principalT, dsraInitialEur: ds1T, liquidityReserveEur: liquidityEur, sizingStatus: "converged", iterations: it };
      ledger = runDeLedger(inp, opsLender, capex, cal, funding, opt);
      break;
    }
    ledger = runDeLedger(inp, opsLender, capex, cal, funding, opt);
  }
  return { funding, ledger };
}
