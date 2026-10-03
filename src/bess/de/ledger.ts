// The German GmbH ledger (spec v1.2 R2 §5–§8). It follows the S1.3 waterfall (model-spec §11):
// - construction funding on the contractual schedule: equity first, IDC and fees, the VAT bridge, reserves at the
//   contractual COD;
// - semi-annual debt service at the start of the payment month, cash first, then the DSRA; unpaid interest is
//   capitalised; principal due = debt above the scheduled balance;
// - DSRA top-ups.
// German parts: KSt, Soli and GewSt by calendar year with separate loss pools (the wind farm's `computeTaxes`), quarterly
// prepayments, AfA by class with the allocated pool and the residual write-off, the two debt buckets with the tax weight
// w_C, the liquidity-reserve top-up after the toll, payouts within §30 GmbHG, and the liquidation payout one year after
// the end. A monthly balance sheet is the integrity check. Money in EUR.
import type { DeCalendar } from "./calendar";
import type { DeCapexBuild } from "./capex";
import type { DeOpsResult } from "./operations";
import { deTaxes, type DeTaxYearOut } from "./tax";
import { DE_CAPEX, DE_CASE, DE_TAX } from "./registry";
import { toDay } from "@/engine/dates";
import type { DeInputs, DeLockedFunding } from "./types";

export interface DeLedgerMonth {
  tollReceiptsEur: number;
  arTollCloseEur: number;
  capexDcEur: number;
  capexPcsEur: number;
  capexBopEur: number;
  capexSubstationEur: number;
  capexBkzEur: number;
  capexDevelopmentEur: number;
  capexContingencyEur: number;
  capexTotalEur: number;
  vatPaidEur: number;
  vatRefundEur: number;
  vatReceivableCloseEur: number;
  revenueEur: number;
  ebitdaEur: number;
  afaEur: number;
  interestExpenseEur: number;
  ebtEur: number;
  taxExpenseEur: number;
  netIncomeEur: number;
  kstPaidEur: number;
  soliPaidEur: number;
  gewPaidEur: number;
  kstPayableCloseEur: number;
  soliPayableCloseEur: number;
  gewPayableCloseEur: number;
  equityEur: number;
  drawdownEur: number;
  idcEur: number;
  upfrontFeeEur: number;
  commitmentFeeEur: number;
  interestDueEur: number;
  principalDueEur: number;
  interestPaidEur: number;
  principalPaidEur: number;
  capitalisedInterestEur: number;
  /** Start of a payment month: the DSRA's part of the payment, its excess released to cash, the cash top-up (M02). */
  dsraDrawStartEur: number;
  dsraToCashStartEur: number;
  cashToDsraStartEur: number;
  /** Last settlement month only: the final repayment from the released reserves and cash (M01). */
  finalInterestDueEur: number;
  finalPrincipalDueEur: number;
  finalInterestPaidEur: number;
  finalPrincipalPaidEur: number;
  finalCapitalisedInterestEur: number;
  debtCloseEur: number;
  scheduledDebtCloseEur: number;
  interestPayableCloseEur: number;
  dsraPostEur: number;
  dsraReleaseEur: number;
  dsraCloseEur: number;
  liquidityPostEur: number;
  liquidityReleaseEur: number;
  liquidityCloseEur: number;
  cfadsEur: number;
  bucketCEur: number;
  bucketMEur: number;
  distributionEur: number;
  cashCloseEur: number;
  fixedAssetsNetCloseEur: number;
  capitalReserveCloseEur: number;
  retainedEarningsCloseEur: number;
  bookNetAssetsCloseEur: number;
}

export interface DeLedgerYear {
  year: number;
  revenueEur: number;
  ebitdaEur: number;
  afaEur: number;
  afaBatteryEur: number;
  afaPcsEur: number;
  afaSubstationEur: number;
  afaBkzEur: number;
  interestExpenseEur: number;
  leaseEur: number;
  decommissioningEur: number;
  ebtEur: number;
  addBackEur: number;
  gewIncomeEur: number;
  gewPoolOpenEur: number;
  gewLossUsedEur: number;
  gewPoolCloseEur: number;
  gewBaseEur: number;
  gewStEur: number;
  kstPoolOpenEur: number;
  kstLossUsedEur: number;
  kstPoolCloseEur: number;
  kstTaxableEur: number;
  kstRate: number;
  kstEur: number;
  soliEur: number;
  taxTotalEur: number;
  ebitdaCEur: number;
  ebitdaMEur: number;
  wC: number;
  tollMonths: number;
  netInterestEur: number;
  interestBarrierPass: boolean;
  netIncomeEur: number;
  projectEbtEur: number;
  projectTaxEur: number;
}

export type DeAfaClass = "battery" | "pcs" | "substation" | "bkz";

export interface DeAssetRecord {
  id: "initialBattery" | "initialPcs" | "initialSubstation" | "initialBkz" | "augmentation" | "pcsOverhaul";
  class: DeAfaClass;
  directEur: number;
  allocatedEur: number;
  baseEur: number;
  startIndex: number;
  lifeYears: number;
  monthlyEur: number;
  afaByYear: Record<number, number>;
  residualWriteOffEur: number;
  residualIndex: number;
}

export interface DePeriodRow {
  day: number;
  paymentIndex: number;
  openingEur: number;
  interestDueEur: number;
  scheduledPrincipalEur: number;
  /** Contractual interest of the period on the locked scheduled balance (spec R2.1 N01). */
  scheduledInterestEur: number;
  paidInterestEur: number;
  paidPrincipalEur: number;
  shortfallEur: number;
  closingEur: number;
  cfadsEur: number;
  cfadsCEur: number;
  cfadsMEur: number;
  debtServiceEur: number;
  dscr: number | null;
  dsraTargetEur: number;
}

export type DeCappedBy = "notYet" | "shortfall" | "lockup" | "dsra" | "reserveTopUp" | "section30" | "liquidityForecast" | "cash";

export interface DeDistributionRow {
  day: number;
  index: number;
  freeCashEur: number;
  bookNetAssetsEur: number;
  section30CapacityEur: number;
  paidEur: number;
  cappedBy: DeCappedBy;
  /** The state at the event, from which the binding limit follows (semantics D2). */
  debtEur: number;
  scheduledDebtEur: number;
  completedPeriods: number;
  lastTwoDscr: number[];
  dsraEur: number;
  dsraTargetEur: number;
  liquidityEur: number;
  liquidityTargetEur: number;
  /** Cash the liquidity forecast keeps in the company: the deepest cumulative planned outflow from the date to the end (spec R2.2 §8). */
  forecastHoldbackEur: number;
}

export interface DeInvestorFlow {
  day: number;
  amount: number;
  kind: "contribution" | "distribution" | "liquidation";
}

export interface DeLedgerResult {
  months: DeLedgerMonth[];
  years: DeLedgerYear[];
  assets: DeAssetRecord[];
  periods: DePeriodRow[];
  distributions: DeDistributionRow[];
  investorFlows: DeInvestorFlow[];
  usesExVatEur: number;
  totalUsesEur: number;
  drawsEur: number;
  equityEur: number;
  projectPreTax: { day: number; amount: number }[];
  projectPostTax: { day: number; amount: number }[];
  cfadsMonthly: { day: number; amount: number }[];
  minCashEur: number;
  maxBalanceErrorEur: number;
  maxSourcesUsesErrorEur: number;
  maxTaxRollErrorEur: number;
  debtAfterMaturityEur: number;
  dsraShort: boolean;
  liquidationPayoutEur: number;
  liquidityTargets: { codEur: number; postTollEur: number | null };
  passes: number;
}

interface Construction {
  capexByLine: Record<string, number[]>;
  capex: number[];
  vatPaid: number[];
  vatRefund: number[];
  idc: number[];
  commit: number[];
  equity: number[];
  draws: number[];
  usesExVatEur: number;
  totalUsesEur: number;
}

/** Construction funding on the contractual schedule (S1.3 §11): equity first, then debt; IDC and commitment fees on the
 *  opening drawn balance until the contractual COD, where the DSRA and the liquidity reserve are funded. CAPEX VAT
 *  refunded up to and including the contractual COD month reduces the need; later refunds go to the waterfall. */
function construction(inp: DeInputs, cal: DeCalendar, capex: DeCapexBuild, f: DeLockedFunding, workingCapitalEur: number): Construction {
  const n = cal.months.length;
  const pc = cal.plannedCodIndex;
  const last = n - 1;
  const r = inp.interestRate;
  const capexByLine: Record<string, number[]> = {};
  const capexM = new Array(n).fill(0) as number[];
  const vatPaid = new Array(n).fill(0) as number[];
  const vatRefund = new Array(n).fill(0) as number[];
  for (const line of capex.lines) {
    const arr = new Array(n).fill(0) as number[];
    line.profile.forEach((w, i) => {
      if (w === 0) return;
      arr[i] = line.amount * w;
      capexM[i]! += line.amount * w;
    });
    capexByLine[line.id] = arr;
  }
  for (let i = 0; i < n; i++) {
    if (capexM[i] === 0) continue;
    vatPaid[i] = DE_CAPEX.vatRate * capexM[i]!;
    vatRefund[Math.min(i + DE_CAPEX.vatRefundLagMonths, last)]! += vatPaid[i]!;
  }
  const D = f.debtEur;
  const fixedUse = (i: number) => {
    let u = capexM[i]! + vatPaid[i]! - vatRefund[i]!;
    if (i === 0) u += inp.upfrontFee * D;
    if (i === pc) u += f.dsraInitialEur + f.liquidityReserveEur + workingCapitalEur;
    return u;
  };
  let idc = new Array(n).fill(0) as number[];
  let commit = new Array(n).fill(0) as number[];
  let equity = new Array(n).fill(0) as number[];
  let draws = new Array(n).fill(0) as number[];
  for (let it = 0; it < 100; it++) {
    const needs = new Array(n).fill(0) as number[];
    let carry = 0;
    for (let i = 0; i <= pc; i++) {
      let need = fixedUse(i) + idc[i]! + commit[i]! - carry;
      carry = 0;
      if (need < 0) {
        carry = -need;
        need = 0;
      }
      needs[i] = need;
    }
    let eqLeft = Math.max(0, needs.reduce((s, v) => s + v, 0) - D);
    let bal = 0;
    const idc2 = new Array(n).fill(0) as number[];
    const com2 = new Array(n).fill(0) as number[];
    const eq2 = new Array(n).fill(0) as number[];
    const dr2 = new Array(n).fill(0) as number[];
    for (let i = 0; i <= pc; i++) {
      if (i < pc) {
        idc2[i] = (bal * r) / 12;
        com2[i] = (Math.max(0, D - bal) * inp.commitmentFee) / 12;
      }
      const need = needs[i]! - idc[i]! - commit[i]! + idc2[i]! + com2[i]!;
      const e = Math.min(Math.max(need, 0), eqLeft);
      eq2[i] = e;
      eqLeft -= e;
      dr2[i] = need - e;
      bal += dr2[i]!;
    }
    const delta = Math.max(...idc2.map((v, i) => Math.abs(v - idc[i]!)), ...com2.map((v, i) => Math.abs(v - commit[i]!)));
    idc = idc2;
    commit = com2;
    equity = eq2;
    draws = dr2;
    if (delta < 1e-9) break;
  }
  let usesExVatEur = 0;
  let totalUsesEur = 0;
  for (let i = 0; i <= pc; i++) {
    usesExVatEur += fixedUse(i) - vatPaid[i]! + vatRefund[i]! + idc[i]! + commit[i]!;
    totalUsesEur += fixedUse(i) + idc[i]! + commit[i]!;
  }
  return { capexByLine, capex: capexM, vatPaid, vatRefund, idc, commit, equity, draws, usesExVatEur, totalUsesEur };
}

/** AfA by class (spec §6.3): the pool (BoP, contingency, development and — levered only — IDC and bank fees) is spread
 *  over battery, PCS and substation by their direct cost; straight line by month from the actual COD (augmentation and
 *  overhaul from their month), the residual written off in the last operating month. */
function depreciation(inp: DeInputs, cal: DeCalendar, capex: DeCapexBuild, ops: DeOpsResult, financingPool: number) {
  const amt = (id: string) => capex.lines.find((l) => l.id === id)!.amount;
  const direct = { battery: amt("dc"), pcs: amt("pcs"), substation: amt("substation") };
  const pool = amt("bop") + amt("contingency") + amt("development") + financingPool;
  const dsum = direct.battery + direct.pcs + direct.substation;
  const lastOp = cal.eolIndex - 1;
  const records: DeAssetRecord[] = [];
  const add = (id: DeAssetRecord["id"], cls: DeAfaClass, d: number, alloc: number, start: number, life: number) => {
    const base = d + alloc;
    const months = life * 12;
    const per = base / months;
    const byYear: Record<number, number> = {};
    let used = 0;
    for (let i = start; i <= lastOp && used < months; i++, used++) {
      const y = cal.months[i]!.year;
      byYear[y] = (byYear[y] ?? 0) + per;
    }
    records.push({ id, class: cls, directEur: d, allocatedEur: alloc, baseEur: base, startIndex: start, lifeYears: life, monthlyEur: per,
      afaByYear: byYear, residualWriteOffEur: base - per * used, residualIndex: lastOp });
  };
  const share = (v: number) => (dsum > 0 ? (pool * v) / dsum : 0);
  add("initialBattery", "battery", direct.battery, share(direct.battery), cal.codIndex, inp.afaBatteryYears);
  add("initialPcs", "pcs", direct.pcs, share(direct.pcs), cal.codIndex, inp.afaPcsYears);
  add("initialSubstation", "substation", direct.substation, share(direct.substation), cal.codIndex, inp.afaSubstationYears);
  add("initialBkz", "bkz", amt("bkz"), 0, cal.codIndex, inp.afaBkzYears);
  const aug = ops.months.find((m) => m.augmentationEur > 0);
  if (aug) add("augmentation", "battery", aug.augmentationEur, 0, aug.index, inp.afaBatteryYears);
  const ov = ops.months.find((m) => m.pcsOverhaulEur > 0);
  if (ov) add("pcsOverhaul", "pcs", ov.pcsOverhaulEur, 0, ov.index, inp.afaPcsYears);
  const n = cal.months.length;
  const monthly = new Array(n).fill(0) as number[];
  const byClass: Record<DeAfaClass, number[]> = { battery: new Array(n).fill(0), pcs: new Array(n).fill(0), substation: new Array(n).fill(0), bkz: new Array(n).fill(0) };
  for (const r of records) {
    const months = r.lifeYears * 12;
    for (let i = r.startIndex, used = 0; i <= lastOp && used < months; i++, used++) {
      monthly[i]! += r.monthlyEur;
      byClass[r.class][i]! += r.monthlyEur;
    }
    monthly[lastOp]! += r.residualWriteOffEur;
    byClass[r.class][lastOp]! += r.residualWriteOffEur;
  }
  return { records, monthly, byClass };
}

interface TaxPlan {
  years: number[];
  kst: number[];
  soli: number[];
  gew: number[];
  detail: DeTaxYearOut[];
  /** Cash by month and tax; expense by month (the year's total in December, the final year in the last month). */
  payKst: number[];
  paySoli: number[];
  payGew: number[];
  expense: number[];
  expenseByTax: { kst: number[]; soli: number[]; gew: number[] };
}

/** Annual German taxes (spec §6.2) on the year's EBT, interest and land lease; prepayments ¼ in the statutory months,
 *  the final year paid in full in the last settlement month (§6.4). */
function taxPlan(inp: DeInputs, cal: DeCalendar, ebt: number[], interest: number[], lease: number[]): TaxPlan {
  const n = cal.months.length;
  const last = n - 1;
  const finalYear = cal.months[last]!.year;
  const years = [...new Set(cal.months.map((m) => m.year))];
  const rows = years.map((y) => {
    let e = 0, i = 0, l = 0;
    for (const m of cal.months) if (m.year === y) {
      e += ebt[m.index]!;
      i += interest[m.index]!;
      l += lease[m.index]!;
    }
    return { year: y, ebt: e, interest: i, lease: l };
  });
  const t = deTaxes(rows, inp.hebesatz);
  const kstY = t.map((x) => x.kst), soliY = t.map((x) => x.soli), gewY = t.map((x) => x.gewSt);
  const payKst = new Array(n).fill(0) as number[];
  const paySoli = new Array(n).fill(0) as number[];
  const payGew = new Array(n).fill(0) as number[];
  const expense = new Array(n).fill(0) as number[];
  const exp = { kst: new Array(n).fill(0) as number[], soli: new Array(n).fill(0) as number[], gew: new Array(n).fill(0) as number[] };
  const idx = new Map(cal.months.map((m) => [`${m.year}-${m.month}`, m.index]));
  years.forEach((y, k) => {
    const kst = kstY[k]!, soli = soliY[k]!, gew = gewY[k]!;
    const expMonth = y === finalYear ? last : idx.get(`${y}-12`) ?? last;
    expense[expMonth]! += kst + soli + gew;
    exp.kst[expMonth]! += kst;
    exp.soli[expMonth]! += soli;
    exp.gew[expMonth]! += gew;
    if (y === finalYear) {
      payKst[last]! += kst;
      paySoli[last]! += soli;
      payGew[last]! += gew;
      return;
    }
    for (const mo of DE_TAX.kstPrepaymentMonths) {
      const i = idx.get(`${y}-${mo}`);
      if (i !== undefined) {
        payKst[i]! += kst / 4;
        paySoli[i]! += soli / 4;
      }
    }
    for (const mo of DE_TAX.gewPrepaymentMonths) {
      const i = idx.get(`${y}-${mo}`);
      if (i !== undefined) payGew[i]! += gew / 4;
    }
  });
  return { years, kst: kstY, soli: soliY, gew: gewY, detail: t, payKst, paySoli, payGew, expense, expenseByTax: exp };
}

/** The liquidity reserve of spec §7.1 for a year and toll share: 3 × [M·peak + max(0, a)·I_max] × idxDE × (1 − s). */
export function liquidityReserve(inp: DeInputs, peakDayPurchasesEur: number, M: number, a: number, idx: number, s: number): number {
  const iMax = (inp.cycleCap * inp.durationHours * inp.powerMW) / inp.rte;
  return inp.liquidityReserveDays * (M * peakDayPurchasesEur + Math.max(0, a) * iMax) * idx * (1 - s);
}

export interface DeLedgerOptions {
  /** Working capital at the contractual COD: the toll receivable of the first month, s·P·tollPrice/12 (0 without a
   *  toll). Funded with the construction uses and kept as free cash (spec R2.1 §7.1). */
  workingCapitalEur: number;
  /** Post-toll liquidity target (first month after the toll), computed by the caller with that month's M, a and idxDE. */
  postTollLiquidityEur: number | null;
  /** The case's own reserve for the unlevered project view (S1.3, U10). */
  projectReserveEur: number;
}

export function runDeLedger(inp: DeInputs, ops: DeOpsResult, capex: DeCapexBuild, cal: DeCalendar, f: DeLockedFunding, opt: DeLedgerOptions): DeLedgerResult {
  const months = cal.months;
  const n = months.length;
  const last = n - 1;
  const pc = cal.plannedCodIndex;
  const cod = cal.codIndex;
  const r = inp.interestRate;
  const om = ops.months;
  const c = construction(inp, cal, capex, f, opt.workingCapitalEur);
  const D = f.debtEur;
  const payAt = new Map(cal.periods.map((p, k) => [p.lastMonth + 1, k]));
  const payMonth = cal.periods.map((p) => p.lastMonth + 1);
  const maturityPay = payMonth.length ? payMonth[payMonth.length - 1]! : -1;
  // scheduled balance during each month from the contractual COD, after a payment at its start
  const sched = new Array(n).fill(0) as number[];
  {
    let b = D;
    for (let i = pc; i < n; i++) {
      const k = payAt.get(i);
      if (k !== undefined) b = Math.max(0, b - (f.principalEur[k] ?? 0));
      sched[i] = b;
    }
  }
  const schedDs = cal.periods.map((_p, k) => {
    const from = k === 0 ? pc : payMonth[k - 1]!;
    let interest = 0;
    for (let j = from; j < payMonth[k]!; j++) interest += (sched[j]! * r) / 12;
    return interest + (f.principalEur[k] ?? 0);
  });
  const nextDs = (i: number) => {
    const k = payMonth.findIndex((pm) => pm > i);
    return k < 0 ? 0 : schedDs[k]!;
  };
  const financingPool = c.idc.reduce((s, v) => s + v, 0) + c.commit.reduce((s, v) => s + v, 0) + inp.upfrontFee * D;
  const afa = depreciation(inp, cal, capex, ops, financingPool);
  const afaUnlev = depreciation(inp, cal, capex, ops, 0);

  // operating accruals and cash (spec §2–§5)
  const accrual = om.map((o) => o.tollFeeAccruedEur);
  const receipts = om.map((_o, i) => (i > 0 ? accrual[i - 1]! : 0));
  const lifecycleVat = om.map((o) => DE_CAPEX.vatRate * (o.augmentationEur + o.pcsOverhaulEur));
  const lifecycleVatRefund = new Array(n).fill(0) as number[];
  lifecycleVat.forEach((v, i) => {
    if (v > 0) lifecycleVatRefund[Math.min(i + DE_CAPEX.vatRefundLagMonths, last)]! += v;
  });
  const revenue = om.map((o) => o.tollFeeAccruedEur + o.marketNetEur);
  const ebitda = om.map((o, i) => revenue[i]! - o.opexTotalEur);
  const lease = om.map((o) => o.leaseEur);
  const opCash = om.map((o, i) => receipts[i]! + o.marketNetEur - o.opexTotalEur - o.augmentationEur - o.pcsOverhaulEur - lifecycleVat[i]! + lifecycleVatRefund[i]! - o.decommissioningEur);
  const unlevEbt = om.map((o, i) => ebitda[i]! - afaUnlev.monthly[i]! - o.decommissioningEur);
  const unlev = taxPlan(inp, cal, unlevEbt, new Array(n).fill(0), lease);
  const yearOf = (i: number) => months[i]!.year;
  const yearsList = [...new Set(months.map((m) => m.year))];
  // w_C by year (spec §6.6) — from accruals, independent of the waterfall
  const wC = new Map<number, number>();
  const ebitdaC = new Map<number, number>();
  const tollMonthsOf = new Map<number, number>();
  for (const y of yearsList) {
    let eC = 0, eT = 0, tm = 0;
    for (const m of months) if (m.year === y) {
      const o = om[m.index]!;
      eC += o.tollFeeAccruedEur - o.s * o.opexTotalEur;
      eT += ebitda[m.index]!;
      if (o.s > 0) tm += 1;
    }
    const pcp = Math.max(eC, 0), pm = Math.max(eT - eC, 0);
    wC.set(y, pcp + pm > 0 ? pcp / (pcp + pm) : (tm / 12) * inp.tollShare);
    ebitdaC.set(y, eC);
    tollMonthsOf.set(y, tm);
  }

  let interest = months.map((_m, i) => (i >= pc ? (sched[i]! * r) / 12 : 0));
  let out: DeLedgerResult | null = null;
  for (let pass = 0; pass < 8; pass++) {
    const ebt = om.map((o, i) => ebitda[i]! - afa.monthly[i]! - interest[i]! - o.decommissioningEur);
    const tax = taxPlan(inp, cal, ebt, interest, lease);
    const rows: DeLedgerMonth[] = [];
    const periods: DePeriodRow[] = [];
    const distributions: DeDistributionRow[] = [];
    const investor: DeInvestorFlow[] = [];
    const cfadsM: { day: number; amount: number }[] = [];
    const intD = new Array(n).fill(0) as number[];
    let cash = 0, dsra = 0, liq = 0, debt = 0, accrued = 0, ar = 0, vatRec = 0, fa = 0;
    let pK = 0, pS = 0, pG = 0;
    let capRes = 0, retained = 0, equityTotal = 0;
    let periodCfads = 0, periodC = 0, completedPeriods = 0;
    const dscrs: number[] = [];
    let minCash = Infinity, maxErr = 0, maxSU = 0, maxTaxErr = 0, debtAfterMaturity = 0, dsraShort = false;
    let prevBna = 0;
    const topUpIndex = cal.tollLast !== null ? cal.tollLast + 1 : null;
    let liqTarget = 0;
    // the liquidity forecast of a payout date to the last settlement month (spec R2.2 §8): CFADS of each month (operations after tax, lifecycle costs
    // and their VAT included), less the planned top-up of the liquidity reserve after the toll, less at each later payment
    // date the DSRA target after it (cash pays the instalment and refills the DSRA to the next one); releases are not counted
    const plannedTopUp = topUpIndex !== null && opt.postTollLiquidityEur !== null ? Math.max(0, opt.postTollLiquidityEur - f.liquidityReserveEur) : 0;
    const forecastFlow = om.map((_o, j) => (j >= pc ? opCash[j]! - tax.payKst[j]! - tax.paySoli[j]! - tax.payGew[j]! : 0) - (j === topUpIndex ? plannedTopUp : 0));
    const forecastDebt = months.map((_m, j) => {
      const k = payAt.get(j);
      return D > 0 && k !== undefined ? (schedDs[k + 1] ?? 0) : 0;
    });
    const forecastHoldback = (i: number) => {
      let cum = 0, need = 0;
      for (let j = i; j <= last; j++) {
        cum += forecastFlow[j]! - (j > i ? forecastDebt[j]! : 0);
        need = Math.max(need, -cum);
      }
      return need;
    };
    for (let i = 0; i < n; i++) {
      const m = months[i]!;
      const o = om[i]!;
      const row = {} as DeLedgerMonth;
      row.interestDueEur = 0;
      row.principalDueEur = 0;
      row.interestPaidEur = 0;
      row.principalPaidEur = 0;
      row.capitalisedInterestEur = 0;
      row.dsraDrawStartEur = 0;
      row.dsraToCashStartEur = 0;
      row.cashToDsraStartEur = 0;
      row.finalInterestDueEur = 0;
      row.finalPrincipalDueEur = 0;
      row.finalInterestPaidEur = 0;
      row.finalPrincipalPaidEur = 0;
      row.finalCapitalisedInterestEur = 0;
      row.dsraPostEur = 0;
      row.dsraReleaseEur = 0;
      row.liquidityPostEur = 0;
      row.liquidityReleaseEur = 0;
      row.distributionEur = 0;
      // 1. debt service at the start of a payment month (S1.3 §11)
      const k = payAt.get(i);
      const arrearsDate = k === undefined && i > maturityPay && debt > 1e-9 && (m.month === 2 || m.month === 8);
      if (k !== undefined || arrearsDate) {
        const opening = debt;
        const pDue = Math.max(0, debt - (k !== undefined ? sched[i]! : 0));
        const due = accrued + pDue;
        const fromCash = Math.min(Math.max(cash, 0), due);
        const draw = Math.min(dsra, due - fromCash);
        dsra -= draw;
        row.dsraReleaseEur += draw;
        row.dsraDrawStartEur = draw;
        const paid = fromCash + draw;
        cash -= fromCash;
        const ip = Math.min(paid, accrued);
        const pp = paid - ip;
        row.interestDueEur = accrued;
        row.principalDueEur = pDue;
        row.interestPaidEur = ip;
        row.principalPaidEur = pp;
        row.capitalisedInterestEur = accrued - ip;
        debt = debt - pp + (accrued - ip);
        accrued = 0;
        if (k !== undefined) {
          completedPeriods += 1;
          const scheduledDs = schedDs[k]!;
          const dscr = scheduledDs > 0.01 ? periodCfads / scheduledDs : null;
          const target = schedDs[k + 1] ?? 0;
          if (dsra > target) {
            row.dsraReleaseEur += dsra - target;
            row.dsraToCashStartEur = dsra - target;
            cash += dsra - target;
            dsra = target;
          } else if (cash > 0 && debt <= sched[i]! + 0.01) {
            const top = Math.min(target - dsra, cash);
            dsra += top;
            row.dsraPostEur += top;
            row.cashToDsraStartEur = top;
            cash -= top;
          }
          if (dsra < target - 0.01) dsraShort = true;
          if (dscr !== null) dscrs.push(dscr);
          periods.push({
            day: m.start, paymentIndex: i, openingEur: opening, interestDueEur: row.interestDueEur,
            scheduledPrincipalEur: f.principalEur[k] ?? 0, scheduledInterestEur: scheduledDs - (f.principalEur[k] ?? 0),
            paidInterestEur: ip, paidPrincipalEur: pp, shortfallEur: Math.max(0, debt - sched[i]!),
            closingEur: debt, cfadsEur: periodCfads, cfadsCEur: periodC, cfadsMEur: periodCfads - periodC, debtServiceEur: scheduledDs,
            dscr, dsraTargetEur: target,
          });
          periodCfads = 0;
          periodC = 0;
          if (i === maturityPay) debtAfterMaturity = debt;
        }
      }
      const noShortfall = debt <= (i >= pc ? sched[i]! : 0) + 0.01;
      if (topUpIndex !== null && i === topUpIndex && opt.postTollLiquidityEur !== null) liqTarget = opt.postTollLiquidityEur;
      // 2. payouts on 1 February / 1 August (spec §7.4, §8): debt conditions, the reserve top-up, then §30 GmbHG
      if (cal.distributionMonths.includes(i)) {
        const freeCash = Math.max(cash, 0);
        const cap30 = Math.max(0, prevBna - inp.stammkapital);
        const debtDone = debt + accrued < 1e-7 && (maturityPay < 0 || i >= maturityPay);
        let cappedBy: DeCappedBy | null = null;
        if (i < cod || i >= last) cappedBy = "notYet";
        else if (D > 0 && !debtDone) {
          if (m.start < toDay(DE_CASE.firstDistributionWithDebt) || completedPeriods < 2) cappedBy = "notYet";
          else if (!noShortfall) cappedBy = "shortfall";
          else if (!dscrs.slice(-2).every((v) => v >= inp.lockupDscr)) cappedBy = "lockup";
          else if (dsra < nextDs(i) - 0.01) cappedBy = "dsra";
        }
        if (!cappedBy && liq < liqTarget - 0.01) cappedBy = "reserveTopUp";
        // the cash the forecast needs stays in the company (spec R2.2 §8)
        const holdback = forecastHoldback(i);
        const avail = Math.max(0, freeCash - holdback);
        let paid = 0;
        if (!cappedBy) {
          paid = Math.min(avail, cap30);
          cappedBy = cap30 < avail - 0.01 ? "section30" : holdback > 0.01 ? "liquidityForecast" : "cash";
          if (paid > 0.005) {
            cash -= paid;
            row.distributionEur = paid;
            const fromRes = Math.min(paid, Math.max(capRes, 0));
            capRes -= fromRes;
            retained -= paid - fromRes;
            investor.push({ day: m.start, amount: paid, kind: "distribution" });
          } else paid = 0;
        }
        distributions.push({ day: m.start, index: i, freeCashEur: freeCash, bookNetAssetsEur: prevBna, section30CapacityEur: cap30, paidEur: paid, cappedBy,
          debtEur: debt, scheduledDebtEur: i >= pc ? sched[i]! : 0, completedPeriods, lastTwoDscr: dscrs.slice(-2), dsraEur: dsra,
          dsraTargetEur: D > 0 ? nextDs(i) : 0, liquidityEur: liq, liquidityTargetEur: liqTarget, forecastHoldbackEur: holdback });
      }
      // 3. construction on the contractual schedule; reserves funded at the contractual COD
      row.capexDcEur = c.capexByLine.dc![i]!;
      row.capexPcsEur = c.capexByLine.pcs![i]!;
      row.capexBopEur = c.capexByLine.bop![i]!;
      row.capexSubstationEur = c.capexByLine.substation![i]!;
      row.capexBkzEur = c.capexByLine.bkz![i]!;
      row.capexDevelopmentEur = c.capexByLine.development![i]!;
      row.capexContingencyEur = c.capexByLine.contingency![i]!;
      row.capexTotalEur = c.capex[i]!;
      row.equityEur = c.equity[i]!;
      row.drawdownEur = c.draws[i]!;
      row.idcEur = c.idc[i]!;
      row.commitmentFeeEur = c.commit[i]!;
      row.upfrontFeeEur = i === 0 ? inp.upfrontFee * D : 0;
      if (i <= pc) {
        const fees = row.idcEur + row.commitmentFeeEur + row.upfrontFeeEur;
        const sources = row.equityEur + row.drawdownEur + c.vatRefund[i]!;
        let uses = row.capexTotalEur + fees + c.vatPaid[i]!;
        if (i === pc) uses += f.dsraInitialEur + f.liquidityReserveEur;
        cash += sources - uses;
        maxSU = Math.max(maxSU, -cash); // sources cover uses before the month's operations (S1.3 §11)
        debt += row.drawdownEur;
        fa += row.capexTotalEur + fees;
        equityTotal += row.equityEur;
        if (row.equityEur > 0) investor.push({ day: m.last, amount: -row.equityEur, kind: "contribution" });
        if (i === pc) {
          dsra += f.dsraInitialEur;
          row.dsraPostEur += f.dsraInitialEur;
          liq += f.liquidityReserveEur;
          row.liquidityPostEur += f.liquidityReserveEur;
          liqTarget = f.liquidityReserveEur;
        }
      } else if (c.vatRefund[i]! > 0) {
        cash += c.vatRefund[i]!;
      }
      row.vatPaidEur = c.vatPaid[i]! + lifecycleVat[i]!;
      row.vatRefundEur = c.vatRefund[i]! + lifecycleVatRefund[i]!;
      vatRec += row.vatPaidEur - row.vatRefundEur;
      // 4. operations, tax at the month end, accruals
      row.tollReceiptsEur = receipts[i]!;
      ar += accrual[i]! - receipts[i]!;
      cash += opCash[i]!;
      fa += o.augmentationEur + o.pcsOverhaulEur;
      row.kstPaidEur = tax.payKst[i]!;
      row.soliPaidEur = tax.paySoli[i]!;
      row.gewPaidEur = tax.payGew[i]!;
      const taxPaid = row.kstPaidEur + row.soliPaidEur + row.gewPaidEur;
      cash -= taxPaid;
      pK += tax.expenseByTax.kst[i]! - row.kstPaidEur;
      pS += tax.expenseByTax.soli[i]! - row.soliPaidEur;
      pG += tax.expenseByTax.gew[i]! - row.gewPaidEur;
      fa -= afa.monthly[i]!;
      const intM = i >= pc ? (debt * r) / 12 : 0;
      intD[i] = intM;
      accrued += intM;
      row.revenueEur = revenue[i]!;
      row.ebitdaEur = ebitda[i]!;
      row.afaEur = afa.monthly[i]!;
      row.interestExpenseEur = intM;
      row.ebtEur = ebitda[i]! - afa.monthly[i]! - intM - o.decommissioningEur;
      row.taxExpenseEur = tax.expense[i]!;
      row.netIncomeEur = row.ebtEur - row.taxExpenseEur;
      retained += row.netIncomeEur;
      const cfads = i >= pc ? opCash[i]! - taxPaid : 0;
      row.cfadsEur = cfads;
      const y = yearOf(i);
      row.bucketCEur = i >= pc ? receipts[i]! - o.s * o.opexTotalEur - (wC.get(y) ?? 0) * taxPaid : 0;
      row.bucketMEur = cfads - row.bucketCEur;
      if (i >= pc) {
        periodCfads += cfads;
        periodC += row.bucketCEur;
      }
      if (i >= cod) cfadsM.push({ day: m.last, amount: cfads });
      // 5. the DSRA is kept at the next debt service from free cash until the loan matures (S1.3 §11)
      if (D > 0 && i >= pc && i < maturityPay && debt <= sched[i]! + 0.01) {
        const add = Math.min(Math.max(cash, 0), Math.max(nextDs(i) - dsra, 0));
        dsra += add;
        row.dsraPostEur += add;
        cash -= add;
      }
      // 6. the liquidity reserve is topped up after the toll from free cash (spec §7.1)
      if (topUpIndex !== null && i >= topUpIndex && i < last && liq < liqTarget - 1e-9) {
        const add = Math.min(Math.max(cash, 0), liqTarget - liq);
        liq += add;
        row.liquidityPostEur += add;
        cash -= add;
      }
      // 7. the last settlement month: reserves released, remaining debt paid; the rest is the liquidation payout
      if (i === last) {
        row.dsraReleaseEur += dsra;
        row.liquidityReleaseEur += liq;
        cash += dsra + liq;
        dsra = 0;
        liq = 0;
        if (debt + accrued > 1e-7) {
          const pay = Math.min(Math.max(cash, 0), debt + accrued);
          const ip = Math.min(pay, accrued);
          row.finalInterestDueEur = accrued;
          row.finalPrincipalDueEur = debt;
          row.finalInterestPaidEur = ip;
          row.finalPrincipalPaidEur = pay - ip;
          // as on a payment date: unpaid interest is capitalised (S1.3 §11), so nothing stays as interest payable
          row.finalCapitalisedInterestEur = accrued - ip;
          cash -= pay;
          debt = debt - (pay - ip) + (accrued - ip);
          accrued = 0;
        }
      }
      // equity: Stammkapital first, the rest is the capital reserve (G16)
      if (row.equityEur > 0) {
        const before = equityTotal - row.equityEur;
        const toStamm = Math.max(0, Math.min(row.equityEur, inp.stammkapital - before));
        capRes += row.equityEur - toStamm;
      }
      row.arTollCloseEur = ar;
      row.vatReceivableCloseEur = vatRec;
      row.kstPayableCloseEur = pK;
      row.soliPayableCloseEur = pS;
      row.gewPayableCloseEur = pG;
      row.debtCloseEur = debt;
      row.scheduledDebtCloseEur = i >= pc ? sched[i]! : 0;
      row.interestPayableCloseEur = accrued;
      row.dsraCloseEur = dsra;
      row.liquidityCloseEur = liq;
      row.cashCloseEur = cash;
      row.fixedAssetsNetCloseEur = fa;
      row.capitalReserveCloseEur = capRes;
      row.retainedEarningsCloseEur = retained;
      row.bookNetAssetsCloseEur = inp.stammkapital + capRes + retained;
      prevBna = row.bookNetAssetsCloseEur;
      rows.push(row);
      minCash = Math.min(minCash, cash);
      const assets = cash + dsra + liq + vatRec + ar + fa;
      const liabilities = debt + accrued + pK + pS + pG;
      maxErr = Math.max(maxErr, Math.abs(assets - liabilities - row.bookNetAssetsCloseEur));
      if (i === 0 && row.equityEur < inp.stammkapital - 0.01) maxErr = Math.max(maxErr, inp.stammkapital - row.equityEur);
    }
    // the liquidation payout one year after the end (§8)
    const end = rows[last]!;
    const payout = end.debtCloseEur + end.interestPayableCloseEur > 0.01 ? 0 : Math.max(0, end.cashCloseEur);
    investor.push({ day: cal.liquidationDay, amount: payout, kind: "liquidation" });
    // tax roll and pools
    for (const v of [rows[last]!.kstPayableCloseEur, rows[last]!.soliPayableCloseEur, rows[last]!.gewPayableCloseEur]) maxTaxErr = Math.max(maxTaxErr, Math.abs(v));
    const converged = intD.every((v, i) => Math.abs(v - interest[i]!) < 1e-9);
    interest = intD;
    // years (spec §6, semantics Y1–Y6)
    const years: DeLedgerYear[] = yearsList.map((y, k) => {
      const ms = months.filter((m) => m.year === y).map((m) => m.index);
      const sum = (f2: (i: number) => number) => ms.reduce((s, i) => s + f2(i), 0);
      const d = tax.detail;
      const byClass = (cls: DeAfaClass) => sum((i) => afa.byClass[cls][i]!);
      const netInterest = sum((i) => rows[i]!.interestExpenseEur);
      return {
        year: y,
        revenueEur: sum((i) => rows[i]!.revenueEur), ebitdaEur: sum((i) => rows[i]!.ebitdaEur), afaEur: sum((i) => rows[i]!.afaEur),
        afaBatteryEur: byClass("battery"), afaPcsEur: byClass("pcs"), afaSubstationEur: byClass("substation"), afaBkzEur: byClass("bkz"),
        interestExpenseEur: netInterest, leaseEur: sum((i) => lease[i]!), decommissioningEur: sum((i) => om[i]!.decommissioningEur),
        ebtEur: sum((i) => rows[i]!.ebtEur),
        addBackEur: d[k]!.addBack, gewIncomeEur: d[k]!.gewIncome, gewPoolOpenEur: d[k]!.gewPoolOpen, gewLossUsedEur: d[k]!.gewLossUsed,
        gewPoolCloseEur: d[k]!.gewPoolClose, gewBaseEur: d[k]!.gewBase, gewStEur: tax.gew[k]!,
        kstPoolOpenEur: d[k]!.kstPoolOpen, kstLossUsedEur: d[k]!.kstLossUsed, kstPoolCloseEur: d[k]!.kstPoolClose,
        kstTaxableEur: d[k]!.kstTaxable, kstRate: d[k]!.kstRate, kstEur: tax.kst[k]!, soliEur: tax.soli[k]!,
        taxTotalEur: tax.kst[k]! + tax.soli[k]! + tax.gew[k]!,
        ebitdaCEur: ebitdaC.get(y) ?? 0, ebitdaMEur: sum((i) => rows[i]!.ebitdaEur) - (ebitdaC.get(y) ?? 0), wC: wC.get(y) ?? 0,
        tollMonths: tollMonthsOf.get(y) ?? 0, netInterestEur: netInterest, interestBarrierPass: netInterest < DE_TAX.interestBarrierThreshold,
        netIncomeEur: sum((i) => rows[i]!.netIncomeEur),
        projectEbtEur: sum((i) => unlevEbt[i]!), projectTaxEur: unlev.kst[k]! + unlev.soli[k]! + unlev.gew[k]!,
      };
    });
    // the unlevered project (S1.3 §15): investment with VAT and refunds, operating cash, its own liquidity reserve
    const pre: { day: number; amount: number }[] = [];
    const post: { day: number; amount: number }[] = [];
    for (let i = 0; i < n; i++) {
      const v = -c.capex[i]! - c.vatPaid[i]! + c.vatRefund[i]! + opCash[i]!;
      const vTax = v - (unlev.payKst[i]! + unlev.paySoli[i]! + unlev.payGew[i]!);
      if (v !== 0) pre.push({ day: months[i]!.last, amount: v });
      if (vTax !== 0) post.push({ day: months[i]!.last, amount: vTax });
    }
    // its own reserve: funded at the contractual COD, topped up after the toll like the company's (§7.1), all released
    // in the last month — on the case's own inputs, also under locked funding
    const projectTopUp =
      topUpIndex !== null && topUpIndex <= last && opt.postTollLiquidityEur !== null ? Math.max(0, opt.postTollLiquidityEur - opt.projectReserveEur) : 0;
    for (const list of [pre, post]) {
      list.push({ day: months[pc]!.start, amount: -opt.projectReserveEur });
      if (projectTopUp > 0) list.push({ day: months[topUpIndex!]!.last, amount: -projectTopUp });
      list.push({ day: months[last]!.last, amount: opt.projectReserveEur + projectTopUp });
    }
    out = {
      months: rows, years, assets: afa.records, periods, distributions, investorFlows: investor,
      usesExVatEur: c.usesExVatEur, totalUsesEur: c.totalUsesEur, drawsEur: c.draws.reduce((s, v) => s + v, 0),
      equityEur: c.equity.reduce((s, v) => s + v, 0), projectPreTax: pre, projectPostTax: post, cfadsMonthly: cfadsM,
      minCashEur: minCash, maxBalanceErrorEur: maxErr, maxSourcesUsesErrorEur: maxSU, maxTaxRollErrorEur: maxTaxErr,
      debtAfterMaturityEur: debtAfterMaturity, dsraShort, liquidationPayoutEur: payout,
      liquidityTargets: { codEur: f.liquidityReserveEur, postTollEur: opt.postTollLiquidityEur }, passes: pass + 1,
    };
    if (converged) break;
  }
  return out!;
}
