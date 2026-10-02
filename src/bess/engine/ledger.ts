// The SPV ledger (model-spec §11–§14, S1.3): construction funding on the contractual schedule (equity first, IDC,
// fees, VAT bridge, reserves), the operating waterfall with semi-annual debt service, arrears, DSRA and lock-up,
// Ukrainian corporate tax by period, dividends limited by book profit and by settled tax years, the NBU remittance
// cap (also on liquidation, with a tail after the last month), and a monthly balance sheet as an integrity check.
// The SPV books in UAH; the loan and the DSRA are EUR monetary items revalued every month.
import { addMonths, parts } from "@/engine/dates";
import type { Calendar } from "./calendar";
import type { CapexBuild } from "./capex";
import { fxMonth } from "./macro";
import type { OpsResult } from "./operations";
import { CAPEX, ENGINE, FINANCE, MACRO, TAX } from "./registry";
import type { BessInputs, LockedFunding } from "./types";

export interface PeriodRow {
  day: number;
  lastMonth: number;
  cfadsEur: number;
  debtServiceEur: number;
  interestEur: number;
  principalEur: number;
  openingEur: number;
  dscr: number | null;
  dsraDrawEur: number;
  shortfallEur: number;
  lockedUp: boolean;
}

export interface DatedFlowRow {
  day: number;
  amount: number;
}

export interface TailPayment {
  day: number;
  year: number;
  grossDividendUah: number;
  netEur: number;
  /** Still to be transferred after this payment, UAH. */
  leftUah: number;
  fx: number;
}

export interface DividendAllocation {
  day: number;
  grossUah: number;
  /** Gross UAH charged to each tax year. */
  byYear: Record<number, number>;
}

export interface LedgerResult {
  periods: PeriodRow[];
  usesExVatEur: number;
  totalUsesEur: number;
  drawsMinusDebtEur: number;
  equityEur: number;
  investorFlows: { day: number; amount: number }[];
  projectPreTax: DatedFlowRow[];
  projectPostTax: DatedFlowRow[];
  /** Liquidation transfers after the settlement month (M13). */
  tail: TailPayment[];
  /** Cash held for the investor at the end of the settlement month, paid out in the tail (UAH). */
  heldAtEndUah: number;
  /** Each declaration charged to the taxable profit of settled years, oldest first (M05). */
  dividendAllocations: DividendAllocation[];
  /** Equity paid in by month (month-end dates), EUR. */
  equityByMonth: DatedFlowRow[];
  /** Monthly P&L lines behind the tax (UAH), for audits. */
  pnlMonthlyUah: { operating: number[]; depreciation: number[]; interest: number[]; fxDiff: number[]; taxPaid: number[] };
  /** Monthly CFADS in EUR from COD (for LLCR). */
  cfadsMonthly: { day: number; amount: number }[];
  minCashUah: number;
  maxBalanceErrorUah: number;
  arrearsAtEndEur: number;
  debtAfterMaturityEur: number;
  dsraShortAfterTopUp: boolean;
  repatriationCapBound: boolean;
  remittanceTailMonths: number;
  blockedAtEndEur: number;
  thinCapMax: number;
  dividendsDeclaredUah: number;
  vintageCapacityUah: number;
  receivablesWrittenOffUah: number;
  monthly: {
    opCashUah: number[];
    taxPaidUah: number[];
    dsUah: number[];
    divGrossUah: number[];
    investorNetEur: number[];
    cashUah: number[];
    dsraEur: number[];
    retainedUah: number[];
    fx: number[];
  };
}

/** Corporate tax on monthly profits (spec §12): annual filer if the prior year's revenue ≤ UAH 40 m, otherwise
 *  cumulative quarterly. Q1–Q3 are paid 50 days after the quarter (2nd month after), the year (and Q4) with the annual
 *  return in March; an overpayment is credited against later payments. The tax expense accrues monthly on the cumulative
 *  profit of the year. */
export function taxSchedule(cal: Calendar, pbt: number[], revenue: number[]) {
  const n = cal.months.length;
  const last = n - 1;
  const pay = new Array(n).fill(0) as number[];
  const expense = new Array(n).fill(0) as number[];
  const taxable = new Map<number, number>();
  /** Month index by which a year's tax is settled (annual payment). */
  const settledBy = new Map<number, number>();
  let lcf = 0;
  let credit = 0;
  const monthIdx = new Map(cal.months.map((m) => [`${m.year}-${m.month}`, m.index]));
  const at = (y: number, mo: number) => {
    const yy = mo > 12 ? y + 1 : y;
    const mm = mo > 12 ? mo - 12 : mo;
    return Math.min(monthIdx.get(`${yy}-${mm}`) ?? last, last);
  };
  const settle = (i: number, due: number) => {
    const use = Math.min(credit, due);
    credit -= use;
    pay[i]! += due - use;
  };
  const years = [...new Set(cal.months.map((m) => m.year))];
  for (const y of years) {
    const inYear = cal.months.filter((m) => m.year === y);
    const prevRevenue = cal.months.filter((m) => m.year === y - 1).reduce((s, m) => s + revenue[m.index]!, 0);
    const quarterly = prevRevenue > TAX.annualFilerRevenueThresholdUah;
    const lcfOpen = lcf;
    let ytd = 0;
    let liabilityPrev = 0;
    let accruedPrev = 0;
    for (let q = 1; q <= 4; q++) {
      const qMonths = inYear.filter((m) => Math.ceil(m.month / 3) === q);
      if (qMonths.length === 0) continue;
      // the expense follows the cumulative profit month by month (a loss month books a credit)
      for (const m of qMonths) {
        ytd += pbt[m.index]!;
        const accrued = TAX.citRate * Math.max(0, ytd - lcfOpen);
        expense[m.index]! += accrued - accruedPrev;
        accruedPrev = accrued;
      }
      const liability = TAX.citRate * Math.max(0, ytd - lcfOpen);
      const due = liability - liabilityPrev;
      liabilityPrev = liability;
      if (quarterly) {
        if (due < 0) credit += -due;
        else settle(q === 4 ? at(y + 1, 3) : at(y, q * 3 + 2), due);
      }
    }
    if (!quarterly && liabilityPrev > 0) settle(at(y + 1, 3), liabilityPrev);
    settledBy.set(y, at(y + 1, 3));
    taxable.set(y, Math.max(0, ytd - lcfOpen));
    lcf = ytd < 0 ? lcfOpen - ytd : Math.max(0, lcfOpen - ytd);
  }
  return { pay, expense, taxable, settledBy };
}

interface Construction {
  capexEur: number[];
  vatPaidUah: number[];
  vatRefundUah: number[];
  idcEur: number[];
  commitEur: number[];
  equityEur: number[];
  drawsEur: number[];
  usesExVatEur: number;
  totalUsesEur: number;
}

/** Construction funding on the contractual schedule: equity first, then debt; IDC and commitment fees on the opening
 *  drawn balance until the contractual COD, where the DSRA and the liquidity reserve are funded. */
function construction(cal: Calendar, capex: CapexBuild, fx: number[], f: LockedFunding, r: number): Construction {
  const n = cal.months.length;
  const pc = cal.plannedCodIndex;
  const last = n - 1;
  const capexEur = new Array(n).fill(0) as number[];
  const vatPaidUah = new Array(n).fill(0) as number[];
  const vatRefundUah = new Array(n).fill(0) as number[];
  for (const line of capex.lines) {
    line.profile.forEach((w, i) => {
      if (w === 0) return;
      const eur = line.currency === "EUR" ? line.amount * w : (line.amount * w) / fx[i]!;
      capexEur[i]! += eur;
      if (line.vatable) {
        const vat = CAPEX.vatRate * eur * fx[i]!;
        vatPaidUah[i]! += vat;
        vatRefundUah[Math.min(i + CAPEX.vatRefundLagMonths, last)]! += vat;
      }
    });
  }
  const D = f.debtEur;
  // VAT refunds received up to and including the contractual COD month reduce the funding need there; later refunds
  // go to the operating waterfall (spec §11, A41, M09)
  const fixedUse = (i: number) => {
    let u = capexEur[i]! + vatPaidUah[i]! / fx[i]!;
    u -= vatRefundUah[i]! / fx[i]!;
    if (i === 0) u += FINANCE.upfrontFeeRate * D;
    if (i === pc) u += f.dsraInitialEur + f.liquidityReserveUah / fx[i]!;
    return u;
  };
  let idc = new Array(n).fill(0) as number[];
  let commit = new Array(n).fill(0) as number[];
  let equity = new Array(n).fill(0) as number[];
  let draws = new Array(n).fill(0) as number[];
  for (let it = 0; it < 100; it++) {
    // needs of each month with the current IDC and fees; a month whose VAT refunds exceed its uses keeps the surplus
    // (UAH) for the next month
    const needs = new Array(n).fill(0) as number[];
    let carry = 0;
    for (let i = 0; i <= pc; i++) {
      let need = fixedUse(i) + idc[i]! + commit[i]! - carry / fx[i]!;
      carry = 0;
      if (need < 0) {
        carry = -need * fx[i]!;
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
        com2[i] = (Math.max(0, D - bal) * FINANCE.commitmentFeeRate) / 12;
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
    usesExVatEur += fixedUse(i) - vatPaidUah[i]! / fx[i]! + vatRefundUah[i]! / fx[i]! + idc[i]! + commit[i]!;
    totalUsesEur += fixedUse(i) + idc[i]! + commit[i]!;
  }
  return { capexEur, vatPaidUah, vatRefundUah, idcEur: idc, commitEur: commit, equityEur: equity, drawsEur: draws, usesExVatEur, totalUsesEur };
}

const TAX_MIN_LIFE_MONTHS = 60; // Tax Code 138.3.3: group 4 (machines and equipment) — at least five years

/** `projectReserveUah` — the liquidity reserve of the unlevered project view, sized for this case's own inputs even when
 *  the funding is locked (S1.3, U10). */
export function runLedger(inp: BessInputs, ops: OpsResult, capex: CapexBuild, cal: Calendar, f: LockedFunding, projectReserveUah = f.liquidityReserveUah): LedgerResult {
  const months = cal.months;
  const n = months.length;
  const last = n - 1;
  const pc = cal.plannedCodIndex;
  const cod = cal.codIndex;
  const eol = cal.eolIndex;
  const r = inp.interestRate;
  const fx = months.map((m) => fxMonth(m.year, m.month, inp.fxStress));
  const om = ops.months;
  const c = construction(cal, capex, fx, f, r);
  const D = f.debtEur;
  // debt service falls on 1 February and 1 August: at the start of the month that begins on that date, at its exchange
  // rate, before its operations (A03). `payAt` maps that month to its period.
  const payAt = new Map(cal.periods.map((p, k) => [p.lastMonth + 1, k]));
  const payMonth = cal.periods.map((p) => p.lastMonth + 1);
  const maturityPay = payMonth.length ? payMonth[payMonth.length - 1]! : -1;
  // scheduled balance during each month from the contractual COD, after a payment at its start (EUR)
  const sched = new Array(n).fill(0) as number[];
  {
    let b = D;
    for (let i = pc; i < n; i++) {
      const k = payAt.get(i);
      if (k !== undefined) b = Math.max(0, b - (f.principalEur[k] ?? 0));
      sched[i] = b;
    }
  }
  /** Contractual debt service of each period: interest on the scheduled balance since the last date, plus principal. */
  const schedDs = cal.periods.map((_p, k) => {
    const from = k === 0 ? pc : payMonth[k - 1]!;
    let interest = 0;
    for (let j = from; j < payMonth[k]!; j++) interest += (sched[j]! * r) / 12;
    return interest + (f.principalEur[k] ?? 0);
  });
  /** The DSRA target after month i's start: the next contractual debt service. */
  const nextDs = (i: number) => {
    const k = payMonth.findIndex((pm) => pm > i);
    return k < 0 ? 0 : schedDs[k]!;
  };

  // depreciation (book = tax): initial asset over the life from the actual COD; later vintages over the remaining
  // life but not faster than five years, the rest written off on disposal in the last operating month
  let initialUah = 0;
  let initialUnlevUah = 0;
  for (let i = 0; i <= pc; i++) {
    const fees = c.idcEur[i]! + c.commitEur[i]! + (i === 0 ? FINANCE.upfrontFeeRate * D : 0);
    initialUah += (c.capexEur[i]! + fees) * fx[i]!;
    initialUnlevUah += c.capexEur[i]! * fx[i]!;
  }
  const dep = new Array(n).fill(0) as number[];
  const depUnlev = new Array(n).fill(0) as number[];
  for (let i = cod; i < eol; i++) {
    dep[i]! += initialUah / (eol - cod);
    depUnlev[i]! += initialUnlevUah / (eol - cod);
    const lc = om[i]!.lifecycleCapexUah;
    if (lc > 0) {
      const rem = eol - i;
      const life = Math.max(rem, TAX_MIN_LIFE_MONTHS);
      for (let j = i; j < eol; j++) {
        dep[j]! += lc / life;
        depUnlev[j]! += lc / life;
      }
      const writeOff = lc - (lc / life) * rem;
      dep[eol - 1]! += writeOff;
      depUnlev[eol - 1]! += writeOff;
    }
  }

  // operating P&L (accruals) and cash; receivables still open at the end are written off
  const lifecycleVatRefund = new Array(n).fill(0) as number[];
  om.forEach((o, i) => {
    if (o.lifecycleVatUah > 0) lifecycleVatRefund[Math.min(i + CAPEX.vatRefundLagMonths, last)]! += o.lifecycleVatUah;
  });
  let claimRec = 0;
  let compRec = 0;
  const pnlOperating = new Array(n).fill(0) as number[];
  const opCash = new Array(n).fill(0) as number[];
  let writtenOff = 0;
  om.forEach((o, i) => {
    const common = o.salesUah - o.purchasesUah - o.captureLossUah - o.optimiserFeeUah - o.opexUah - o.tariffUah -
      o.warExpectedUah - o.insurancePremiumUah - o.decommissioningUah;
    pnlOperating[i] = common + o.insuranceClaimAccrualUah + o.stateCompensationAccrualUah;
    opCash[i] = common + o.insurancePayoutUah + o.stateCompensationUah - o.lifecycleCapexUah - o.lifecycleVatUah +
      lifecycleVatRefund[i]!;
    claimRec += o.insuranceClaimAccrualUah - o.insurancePayoutUah;
    compRec += o.stateCompensationAccrualUah - o.stateCompensationUah;
    if (i === last) {
      writtenOff = claimRec + compRec;
      pnlOperating[i]! -= writtenOff;
    }
  });
  const revenue = om.map((o) => o.salesUah);
  const unlev = taxSchedule(cal, pnlOperating.map((v, i) => v - depUnlev[i]!), revenue);

  // FX differences and interest on arrears depend on the waterfall: iterate the tax pass on the previous pass
  let fxDiff = new Array(n).fill(0) as number[];
  let interestEur = months.map((_m, i) => (i >= pc ? (sched[i]! * r) / 12 : 0));
  let out: LedgerResult | null = null;
  for (let pass = 0; pass < 6; pass++) {
    const pbt = months.map((_m, i) => pnlOperating[i]! - dep[i]! - interestEur[i]! * fx[i]! + fxDiff[i]!);
    const tax = taxSchedule(cal, pbt, revenue);
    const fxD = new Array(n).fill(0) as number[];
    const intD = new Array(n).fill(0) as number[];

    let cash = 0;
    let dsra = 0;
    let liq = 0;
    let debt = 0;
    let accrued = 0;
    let payable = 0;
    let shareCap = 0;
    let re = 0;
    let ppe = 0;
    let accDep = 0;
    let vatRec = 0;
    let taxLiab = 0;
    let cRec = 0;
    let sRec = 0;
    let minCash = Infinity;
    let maxErr = 0;
    let capBound = false;
    let dsraShort = false;
    let thinCapMax = 0;
    let declared = 0;
    let periodCfads = 0;
    let debtAfterMaturity = 0;
    let completedPeriods = 0;
    const dscrs: number[] = [];
    const periods: PeriodRow[] = [];
    const investor: { day: number; amount: number }[] = [];
    const cfadsM: { day: number; amount: number }[] = [];
    const mOp = new Array(n).fill(0) as number[];
    const mTax = new Array(n).fill(0) as number[];
    const mDs = new Array(n).fill(0) as number[];
    const mDiv = new Array(n).fill(0) as number[];
    const mInv = new Array(n).fill(0) as number[];
    const mCash = new Array(n).fill(0) as number[];
    const mDsra = new Array(n).fill(0) as number[];
    const mRe = new Array(n).fill(0) as number[];
    let tailMonths = 0;
    let blockedEur = 0;
    /** Transfers after the settlement month (the remittance tail), with what is still held after each. */
    const tail: TailPayment[] = [];
    /** Cash still held for the investor at the end of the settlement month (paid out in the tail), UAH. */
    let heldAtEndUah = 0;
    /** Gross dividends charged to each settled tax year's taxable profit, oldest first (export for audit, M05). */
    const allocations: DividendAllocation[] = [];
    const usedByYear = new Map<number, number>();
    const allocate = (day: number, i: number, gross: number) => {
      const byYear: Record<number, number> = {};
      let left = gross;
      for (const [y, by] of [...tax.settledBy].sort((a, b) => a[0] - b[0])) {
        if (left <= 0) break;
        if (!(by <= i || i === last)) continue;
        const room = (tax.taxable.get(y) ?? 0) - (usedByYear.get(y) ?? 0);
        if (room <= 0) continue;
        const take = Math.min(room, left);
        usedByYear.set(y, (usedByYear.get(y) ?? 0) + take);
        byYear[y] = take;
        left -= take;
      }
      allocations.push({ day, grossUah: gross, byYear });
    };
    const capacity = (i: number) => {
      let cap = 0;
      for (const [y, by] of tax.settledBy) if (by <= i || i === last) cap += tax.taxable.get(y) ?? 0;
      return cap - declared;
    };
    const remitCap = (x: number) => (MACRO.repatriationCapEurPerMonth * x) / (1 - TAX.dividendWht);

    for (let i = 0; i < n; i++) {
      const m = months[i]!;
      const x = fx[i]!;
      /** Net EUR transferred to the investor this month (the National Bank limit is per month). */
      let netOut = 0;
      // FX differences on the opening euro balances (DSRA, loan, accrued interest); they enter the month's profit, so a
      // first-day declaration sees only the opening retained earnings
      if (i > 0) fxD[i] = (x - fx[i - 1]!) * (dsra - debt - accrued);

      // 1. debt service at the start of a payment month; cash first, then the DSRA; unpaid interest is capitalised and
      //    unpaid principal stays owed (arrears), both paid on the next dates — after maturity on every 1 Feb / 1 Aug
      const k = payAt.get(i);
      const arrearsDate = k === undefined && i > maturityPay && debt > 1e-9 && (m.month === 2 || m.month === 8);
      // every payment date closes a period (its CFADS feeds the sizing), also while no loan is assumed yet
      if (k !== undefined || arrearsDate) {
        const opening = debt;
        const due = accrued + Math.max(0, debt - (k !== undefined ? sched[i]! : 0));
        const fromCash = Math.min(Math.max(cash, 0) / x, due);
        const draw = Math.min(dsra, due - fromCash);
        dsra -= draw;
        const paid = fromCash + draw;
        cash -= fromCash * x;
        mDs[i]! += paid * x;
        const interestPaid = Math.min(paid, accrued);
        const principalPaid = paid - interestPaid;
        debt = debt - principalPaid + (accrued - interestPaid);
        accrued = 0;
        if (k !== undefined) {
          completedPeriods += 1;
          const scheduledDs = schedDs[k]!;
          const dscr = scheduledDs > ENGINE.absToleranceMoney ? periodCfads / scheduledDs : null;
          const target = schedDs[k + 1] ?? 0;
          if (dsra > target) {
            cash += (dsra - target) * x;
            dsra = target;
          } else if (cash > 0 && debt <= sched[i]! + 0.01) {
            const top = Math.min(target - dsra, cash / x);
            dsra += top;
            cash -= top * x;
          }
          if (dsra < target - 0.01) dsraShort = true;
          if (dscr !== null) dscrs.push(dscr);
          periods.push({
            day: m.start, lastMonth: i - 1, cfadsEur: periodCfads, debtServiceEur: scheduledDs, interestEur: interestPaid,
            principalEur: principalPaid, openingEur: opening, dscr, dsraDrawEur: draw, shortfallEur: due - paid,
            lockedUp: false,
          });
          periodCfads = 0;
          if (i === maturityPay) debtAfterMaturity = debt;
        }
      }
      const noArrears = debt <= (i >= pc ? sched[i]! : 0) + 0.01;

      // 2. distributions on 1 February and 1 August from COD: only after two full periods of debt service with cover of
      //    at least the lock-up level, a full DSRA and no arrears; limited by opening cash, book retained earnings and
      //    the taxable profit of years whose tax is settled (no advance CIT can arise, spec §11–12)
      if (i >= cod && i < last && (m.month === 2 || m.month === 8)) {
        const debtDone = debt + accrued < 1e-7 && i >= maturityPay;
        const covered = completedPeriods >= 2 && dscrs.slice(-2).every((v) => v >= FINANCE.lockupDscr) && dsra >= nextDs(i) - 0.01;
        const allow = (D === 0 || debtDone || covered) && noArrears;
        if (k !== undefined) periods[periods.length - 1]!.lockedUp = !allow;
        if (allow) {
          const d = Math.max(0, Math.min(cash - payable, re, capacity(i)));
          if (d > 1e-8) {
            payable += d;
            re -= d;
            declared += d;
            allocate(m.start, i, d);
          }
        }
      }
      // 3. transfers to the investor at the start of the month, net of withholding tax and within the monthly limit
      if (payable > 0 && i < last && noArrears) {
        const g = Math.max(0, Math.min(payable, remitCap(x), cash));
        if (payable > g + 0.01 && g > 0) capBound = true;
        payable -= g;
        cash -= g;
        mDiv[i]! += g;
        const net = ((1 - TAX.dividendWht) * g) / x;
        mInv[i]! += net;
        netOut += net;
        if (net > 0) investor.push({ day: m.start, amount: net });
      }

      // 4. construction on the contractual schedule; reserves funded at the contractual COD
      if (i <= pc) {
        const fees = c.idcEur[i]! + c.commitEur[i]! + (i === 0 ? FINANCE.upfrontFeeRate * D : 0);
        const sources = (c.equityEur[i]! + c.drawsEur[i]!) * x + c.vatRefundUah[i]!;
        let uses = (c.capexEur[i]! + fees) * x + c.vatPaidUah[i]!;
        if (i === pc) uses += f.dsraInitialEur * x + f.liquidityReserveUah;
        cash += sources - uses;
        shareCap += c.equityEur[i]! * x;
        debt += c.drawsEur[i]!;
        ppe += (c.capexEur[i]! + fees) * x;
        vatRec += c.vatPaidUah[i]! - c.vatRefundUah[i]!;
        if (c.equityEur[i]! > 0) investor.push({ day: m.last, amount: -c.equityEur[i]! });
        if (i === pc) {
          dsra += f.dsraInitialEur;
          liq += f.liquidityReserveUah;
        }
      }
      if (i > pc && c.vatRefundUah[i]! > 0) {
        cash += c.vatRefundUah[i]!;
        vatRec -= c.vatRefundUah[i]!;
      }

      // 5. operations, tax (paid at month end), accruals
      const o = om[i]!;
      const taxPaid = tax.pay[i]!;
      cash += opCash[i]! - taxPaid;
      mOp[i] = opCash[i]!;
      mTax[i] = taxPaid;
      ppe += o.lifecycleCapexUah;
      vatRec += o.lifecycleVatUah - lifecycleVatRefund[i]!;
      cRec += o.insuranceClaimAccrualUah - o.insurancePayoutUah;
      sRec += o.stateCompensationAccrualUah - o.stateCompensationUah;
      if (i === last) {
        cRec = 0;
        sRec = 0;
      }
      accDep += dep[i]!;
      const intM = i >= pc ? (debt * r) / 12 : 0;
      intD[i] = intM;
      accrued += intM;
      re += pnlOperating[i]! - dep[i]! - intM * x + fxD[i]! - tax.expense[i]!;
      taxLiab += tax.expense[i]! - taxPaid;
      if (i >= pc) periodCfads += (opCash[i]! - taxPaid) / x;
      if (i >= cod) cfadsM.push({ day: m.last, amount: (opCash[i]! - taxPaid) / x });

      // 6. the DSRA is kept at the next debt service: topped up from cash every month until the loan matures
      if (D > 0 && i >= pc && i < maturityPay && debt <= sched[i]! + 0.01) {
        const add = Math.min(Math.max(cash, 0) / x, Math.max(nextDs(i) - dsra, 0));
        dsra += add;
        cash -= add * x;
      }
      if (i >= cod && D > 0 && shareCap + re > 0) thinCapMax = Math.max(thinCapMax, (debt * x) / (shareCap + re));
      else if (i >= cod && D > 0 && debt > 0) thinCapMax = Infinity;

      // 7. liquidation at the end of the settlement month: reserves released, creditors paid, tax settled, then what
      //    belongs to the investor under the monthly limit — at this month's end, later on the first day of each month
      if (i === last) {
        cash += dsra * x + liq;
        dsra = 0;
        liq = 0;
        if (debt + accrued > 1e-7) {
          const pay = Math.min(Math.max(cash, 0) / x, debt + accrued);
          cash -= pay * x;
          mDs[i]! += pay * x;
          const ip = Math.min(pay, accrued);
          debt -= pay - ip;
          accrued -= ip;
        }
        const settle = Math.max(0, taxLiab);
        cash -= settle;
        taxLiab -= settle;
        mTax[i]! += settle;
        // the final year's tax is settled now, so its profit may be distributed
        const finalDiv = Math.max(0, Math.min(cash - payable - Math.max(0, shareCap), re, capacity(i)));
        if (finalDiv > 1e-8) {
          payable += finalDiv;
          re -= finalDiv;
          declared += finalDiv;
          allocate(m.last, i, finalDiv);
        }
        const capitalReturn = Math.max(0, Math.min(cash - payable, shareCap));
        if (inp.terminalRemittance === "blocked") {
          blockedEur = (payable + capitalReturn) / x;
        } else {
          // dividends (net of withholding tax) first, then the return of capital
          let divLeft = payable;
          let capLeft = capitalReturn;
          for (let t = 0; divLeft + capLeft > 0.01 && t < 600; t++) {
            const d = t === 0 ? m.last : addMonths(m.end, t - 1);
            const { year, month } = parts(d);
            const xt = t === 0 ? x : fxMonth(year, month, inp.fxStress);
            let room = (MACRO.repatriationCapEurPerMonth - (t === 0 ? netOut : 0)) * xt; // net UAH that may still leave
            const g = Math.min(divLeft, Math.max(0, room) / (1 - TAX.dividendWht));
            divLeft -= g;
            room -= (1 - TAX.dividendWht) * g;
            const cr = Math.min(capLeft, Math.max(0, room));
            capLeft -= cr;
            const net = ((1 - TAX.dividendWht) * g + cr) / xt;
            if (t === 0) {
              mDiv[i]! += g;
              mInv[i]! += net;
              heldAtEndUah = divLeft + capLeft;
            } else {
              tail.push({ day: d, year, grossDividendUah: g, netEur: net, leftUah: divLeft + capLeft, fx: xt });
            }
            if (net > 0) investor.push({ day: d, amount: net });
            if (t > 0) tailMonths = t;
            if (divLeft + capLeft > 0.01) capBound = capBound || t === 0;
          }
        }
        cash -= payable + capitalReturn;
        shareCap -= capitalReturn;
        payable = 0;
      }

      minCash = Math.min(minCash, cash);
      mCash[i] = cash;
      mDsra[i] = dsra;
      mRe[i] = re;
      if (i < last) {
        const assets = ppe - accDep + cash + dsra * x + liq + vatRec + cRec + sRec + Math.max(0, -taxLiab);
        const liabilities = (debt + accrued) * x + Math.max(0, taxLiab) + payable;
        maxErr = Math.max(maxErr, Math.abs(assets - liabilities - (shareCap + re)));
      }
    }
    const converged = fxD.every((v, i) => Math.abs(v - fxDiff[i]!) < 1e-6) && intD.every((v, i) => Math.abs(v - interestEur[i]!) < 1e-9);
    fxDiff = fxD;
    interestEur = intD;
    let vintageCap = 0;
    for (const v of tax.taxable.values()) vintageCap += v;
    // unlevered project (spec §15): investment with VAT and refunds, operating cash including lifecycle spend and
    // decommissioning, tax recomputed without debt; its own liquidity reserve placed on the COD date and released at the end
    const pre: DatedFlowRow[] = [];
    const post: DatedFlowRow[] = [];
    for (let i = 0; i < n; i++) {
      const x = fx[i]!;
      const v = -c.capexEur[i]! - c.vatPaidUah[i]! / x + c.vatRefundUah[i]! / x + opCash[i]! / x;
      const vTax = v - unlev.pay[i]! / x;
      if (v !== 0) pre.push({ day: months[i]!.last, amount: v });
      if (vTax !== 0) post.push({ day: months[i]!.last, amount: vTax });
    }
    for (const list of [pre, post]) {
      list.push({ day: months[pc]!.start, amount: -projectReserveUah / fx[pc]! });
      list.push({ day: months[last]!.last, amount: projectReserveUah / fx[last]! });
    }
    out = {
      periods, usesExVatEur: c.usesExVatEur, totalUsesEur: c.totalUsesEur,
      drawsMinusDebtEur: c.drawsEur.reduce((s, v) => s + v, 0) - D,
      equityEur: c.equityEur.reduce((s, v) => s + v, 0),
      equityByMonth: c.equityEur.map((v, i) => ({ day: months[i]!.last, amount: v })).filter((e) => e.amount > 0),
      pnlMonthlyUah: { operating: pnlOperating, depreciation: dep, interest: interestEur.map((v, i) => v * fx[i]!), fxDiff, taxPaid: mTax },
      investorFlows: investor, projectPreTax: pre, projectPostTax: post, cfadsMonthly: cfadsM, minCashUah: minCash,
      maxBalanceErrorUah: maxErr, arrearsAtEndEur: debt, debtAfterMaturityEur: debtAfterMaturity,
      dsraShortAfterTopUp: dsraShort, repatriationCapBound: capBound, remittanceTailMonths: tailMonths,
      blockedAtEndEur: blockedEur, thinCapMax, dividendsDeclaredUah: declared, vintageCapacityUah: vintageCap,
      receivablesWrittenOffUah: writtenOff, tail, heldAtEndUah, dividendAllocations: allocations,
      monthly: { opCashUah: mOp, taxPaidUah: mTax, dsUah: mDs, divGrossUah: mDiv, investorNetEur: mInv, cashUah: mCash, dsraEur: mDsra, retainedUah: mRe, fx },
    };
    if (converged) break;
  }
  return out!;
}
