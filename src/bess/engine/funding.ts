// Debt sizing on the lender case (model-spec §11, R24–R25): sculpted service DS_k = CFADS_k / DSCR, the largest
// balance that a non-increasing amortisation can repay, capped by the gearing limit, solved with damped iteration
// because IDC, fees, the DSRA and the tax shield depend on the debt. The result is locked for every later run.
import type { Calendar } from "./calendar";
import type { CapexBuild } from "./capex";
import { runLedger, type LedgerResult } from "./ledger";
import type { OpsResult } from "./operations";
import { lookup, type Library } from "./library";
import { FX_ANCHOR_2025, fxMonth, hicpIndex, uaCpiIndex } from "./macro";
import { CAPEX, FINANCE, OPEX, PRICE_LEVEL_EUR, SPREAD_PATHS } from "./registry";
import type { ContractPlan } from "./reserves";
import type { BessInputs, LockedFunding } from "./types";

/** Period interest rates (simple, 30/360 by months) for the debt calendar. */
export function periodRates(cal: Calendar, r: number): number[] {
  return cal.periods.map((p, k) => {
    const prevLast = k === 0 ? cal.plannedCodIndex - 1 : cal.periods[k - 1]!.lastMonth;
    return (r * (p.lastMonth - prevLast)) / 12;
  });
}

/**
 * Largest opening balance repayable from the service budgets with a non-increasing balance: going backwards,
 * the closing balance of period k is capped at budget_k / rate_k (otherwise the period could not even pay interest),
 * and the opening balance is (closing + budget) / (1 + rate).
 */
export function sculpt(budgets: number[], rates: number[]): { opening: number; closing: number[] } {
  const N = budgets.length;
  const closing = new Array(N).fill(0) as number[];
  let maxClose = 0;
  for (let k = N - 1; k >= 0; k--) {
    const rho = rates[k]!;
    const b = Math.max(0, budgets[k]!);
    const c = rho > 0 ? Math.min(maxClose, b / rho) : maxClose;
    closing[k] = c;
    maxClose = (c + b) / (1 + rho);
  }
  // forward: a capped earlier balance caps the later ones too, so the balance never grows
  let prev = maxClose;
  for (let k = 0; k < N; k++) {
    closing[k] = Math.min(closing[k]!, prev);
    prev = closing[k]!;
  }
  return { opening: maxClose, closing };
}

/**
 * Liquidity reserve (spec §11): three peak days of day-ahead pre-payment with VAT plus the balance-responsible-party
 * guarantee, fixed in UAH at the contractual COD and not replenished. The peak day is bounded after the price
 * transformation by a safe affine envelope: m·(historical peak purchases) + max(0, L − m·L̄)·(largest daily import).
 */
/** `daShare` — v1.1a: the DA share σ_a of the contractual-COD month; the purchase envelope scales with it (spec v1.1 R3.1 §3,
 *  gate-3 amendment G3-10), the balance guarantee does not. 1 without a contract: the v1 value exactly. */
export function liquidityReserveUah(inp: BessInputs, lib: Library, cal: Calendar, daShare = 1): number {
  const y = cal.months[cal.plannedCodIndex]!.year;
  const m = SPREAD_PATHS[inp.scenario][Math.min(Math.max(y, 2028), 2031) as 2028]! as number;
  const level = PRICE_LEVEL_EUR[Math.min(Math.max(y, 2028), 2031) as 2028]! as number;
  const meta = lib.manifest.snapshots[inp.snapshot];
  const node = lookup(lib, { snapshot: inp.snapshot, duration: inp.durationH, cycleCap: inp.cycleCap, rte: inp.rte }, inp.durationH, 0);
  const peakUah = node.peakDayPurchasesUAH * inp.powerMW;
  const maxDayImport = (inp.cycleCap * inp.durationH * inp.powerMW) / inp.rte;
  const pcMonth = cal.months[cal.plannedCodIndex]!;
  const fx = fxMonth(pcMonth.year, pcMonth.month, inp.fxStress);
  // the library's peak is in UAH: converted at the 2025 average rate in EUR mode (U01). Three such first-year days plus
  // the balance guarantee are a liquidity assumption, not a proven bound for every later day (M02)
  const purchasesUah =
    inp.pathCurrency === "EUR"
      ? (m * (peakUah / FX_ANCHOR_2025) + Math.max(0, level - m * meta.avgPriceEUR) * maxDayImport) * hicpIndex(y) * fx
      : (m * peakUah + Math.max(0, level * FX_ANCHOR_2025 - m * meta.avgPriceUAH) * maxDayImport) * uaCpiIndex(y);
  return FINANCE.liquidityReserveDays * purchasesUah * daShare * (1 + CAPEX.vatRate) + OPEX.brpGuaranteeUah;
}

export interface SizingResult {
  funding: LockedFunding;
  ledger: LedgerResult;
}

/** Debt-service budget of a period (R24, spec v1.1 §11): the contract bucket at its DSCR, the merchant bucket at the
 *  merchant DSCR, a negative bucket subtracted in full. Without a contract C = 0 and this is v1's max(0, CFADS)/DSCR. */
export function periodBudget(cfadsEur: number, contractEur: number, merchantDscr: number): number {
  const C = contractEur;
  const M = cfadsEur - C;
  return Math.max(0, Math.max(C, 0) / FINANCE.targetDscrContracted + Math.max(M, 0) / merchantDscr - Math.max(-C, 0) - Math.max(-M, 0));
}

export function sizeDebt(inp: BessInputs, opsLender: OpsResult, capex: CapexBuild, cal: Calendar, liqUah: number, plan: ContractPlan | null = null): SizingResult {
  const rates = periodRates(cal, inp.interestRate);
  let funding: LockedFunding = {
    debtEur: 0, principalEur: new Array(cal.periods.length).fill(0), dsraInitialEur: 0, liquidityReserveUah: liqUah,
    sizingStatus: "failed", iterations: 0,
  };
  let ledger = runLedger(inp, opsLender, capex, cal, funding, undefined, plan);
  for (let it = 1; it <= FINANCE.sizingMaxIterations; it++) {
    const budgets = plan
      ? ledger.periods.map((p) => periodBudget(p.cfadsEur, p.cfadsContractEur, inp.targetDscr))
      : ledger.periods.map((p) => Math.max(0, p.cfadsEur) / inp.targetDscr);
    const { opening, closing } = sculpt(budgets, rates);
    const cap = inp.maxGearing * ledger.usesExVatEur;
    const target = Math.max(0, Math.min(opening, cap));
    const s = opening > 0 ? target / opening : 0;
    const close = closing.map((v) => v * s);
    const principalT = close.map((cl, k) => (k === 0 ? target : close[k - 1]!) - cl);
    const ds1T = target > 0 ? principalT[0]! + target * rates[0]! : 0;
    const gap = Math.abs(target - funding.debtEur) + Math.abs(ds1T - funding.dsraInitialEur);
    const next = funding.debtEur + FINANCE.sizingDamping * (target - funding.debtEur);
    const k = target > 0 ? next / target : 0;
    funding = {
      debtEur: next, principalEur: principalT.map((p) => p * k), dsraInitialEur: ds1T * k, liquidityReserveUah: liqUah,
      sizingStatus: "failed", iterations: it,
    };
    if (gap < FINANCE.sizingTolerance) {
      // converged: lock the undamped solution itself, so the lender case meets its DSCR exactly
      funding = {
        debtEur: target, principalEur: principalT, dsraInitialEur: ds1T, liquidityReserveUah: liqUah,
        sizingStatus: "converged", iterations: it,
      };
      ledger = runLedger(inp, opsLender, capex, cal, funding, undefined, plan);
      break;
    }
    ledger = runLedger(inp, opsLender, capex, cal, funding, undefined, plan);
  }
  return { funding, ledger };
}
