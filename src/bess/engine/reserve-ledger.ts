// v1.1a reserve in the ledger (spec v1.1 R3 §7, §9–§11): the reserve's accruals, the dated cash of the AS, BSP and DA
// accounts with the within-month BSP offset, the source-tagged operating-VAT subledger, write-offs, the escrow and the
// contract liquidity reserve, the sponsor's equity calls, the balances for the balance sheet, and the contract (C)
// bucket before income tax. Money in UAH. Without a contract the ledger never calls this module.
//
// The company totals (cash, pnl) are computed line by line without origins; the same lines are posted a second time by
// origin into the C and M buckets. bucketsReconcile compares the two (spec §11).
import type { Calendar } from "./calendar";
import type { OpsResult } from "./operations";
import type { ContractPlan } from "./reserves";
import { CAPEX, RESERVE } from "./registry";
import type { BessInputs } from "./types";

type Bucket = "C" | "M";

export const FLOW_KEYS = ["escrowPost", "escrowTopUp", "escrowRetained", "escrowRefund", "liquidityPost", "liquidityRelease", "asInvoiceGross", "asCollected", "asWrittenOff", "asPenaltyAccrued", "asPenaltyPaid", "bspUpClaimGross", "bspDownLiabilityGross", "bspFeeAccrued", "bspFeePaid", "bspOffset", "bspPayablePaid", "bspResidualCollected", "bspResidualWrittenOff", "daCash", "feesCash"] as const;
export type FlowKey = (typeof FLOW_KEYS)[number];

export interface ReserveLedger {
  /** Accrual operating P&L of the reserve lines, including write-offs and escrow retention (enters pnlOperating). */
  pnl: number[];
  /** Items added back to the taxable profit when penalties, retention and write-offs are not deductible. */
  taxAdd: number[];
  /** Reserve revenue (capacity, up energy, exports and the exit sale) for the annual-filer threshold. */
  revenue: number[];
  /** Operating cash of the reserve lines with VAT (enters CFADS). */
  cash: number[];
  /** Sponsor equity: escrow posting and top-up, the contract liquidity reserve and the pre-service fill (gross). */
  equityCall: number[];
  /** Cash moved into, and released from, the restricted accounts (escrow, contract liquidity reserve). */
  restrictedOut: number[];
  restrictedIn: number[];
  /** Closing balances (gross of VAT where invoiced). */
  escrow: number[];
  liquidity: number[];
  arAs: number[];
  arBsp: number[];
  apAs: number[];
  apBsp: number[];
  /** Operating-VAT position: the month's unsettled net less the carried credits; payable (+) or asset (−). */
  vat: number[];
  inventory: number[];
  /** The contract bucket before income tax (UAH, cash) and its accrual EBITDA (for the tax weights): its reserve lines
   *  plus its allocations of the site's shared costs and network-bill increments. */
  contractCash: number[];
  contractEbitda: number[];
  /** The reserve lines posted by origin, before the allocations: their sums must equal `cash` and `pnl`. */
  lineCash: Record<Bucket, number[]>;
  lineEbitda: Record<Bucket, number[]>;
  /** Allocations to C of shared costs and network increments (cash and accrual), already inside contractCash/Ebitda. */
  allocationCashC: number[];
  allocationEbitdaC: number[];
  /** Time weight of the initial award's resource share σ·Z (the tax-weight fallback). */
  sigmaZ: number[];
  retention: number[];
  badDebt: number[];
  /** The operating-VAT subledger (spec §10): monthly nets by bucket, budget payments, bucket entries, credits written
   *  off at the end. */
  vatNet: Record<Bucket, number[]>;
  vatPayment: number[];
  vatEntry: Record<Bucket, number[]>;
  vatCreditWrittenOff: Record<Bucket, number>;
  /** Escrow and liquidity-reserve movements by month (posting +, top-up +, retention −, refund/release −). */
  escrowFlow: number[];
  liquidityFlow: number[];
  /** Monthly account flows (UAH, month-end, all non-negative; the output schema gives each one's account and sign). */
  flows: Record<FlowKey, number[]>;
  /** Positive reserve balances still open after the last month (should be zero). */
  openAtEnd: number;
}

const VAT = CAPEX.vatRate;

interface Vintage {
  month: number;
  owner: Bucket;
  amount: number;
}

export interface VatSubledger {
  /** Budget payment at the end of each month (never negative: no refund). */
  payment: number[];
  /** Each bucket's entry at the end of each month: minus its own positive net, plus its credits that were used. */
  entry: Record<Bucket, number[]>;
  /** Credits carried after the settlement at the end of each month (0 after the final write-off). */
  pool: number[];
  /** Credits never used, written off at the end, by owner. */
  writtenOff: Record<Bucket, number>;
}

/** The operating-VAT subledger (spec R3 §10, R2-04) over monthly nets (output − input) by bucket. Month s settles at the
 *  end of s + 1, the last month in itself. A negative net becomes a credit of its month and bucket; positive nets are
 *  covered by credits oldest first (within a month C before M; the month's own credits after older ones); the rest is
 *  paid. Credits left at the end are written off. */
export function settleOperatingVat(net: Record<Bucket, number[]>): VatSubledger {
  const n = net.C.length;
  const z = () => new Array(n).fill(0) as number[];
  const payment = z();
  const entry: Record<Bucket, number[]> = { C: z(), M: z() };
  const pool = z();
  const vintages: Vintage[] = [];
  const settle = (s: number, t: number) => {
    for (const b of ["C", "M"] as const) if (net[b][s]! < 0) vintages.push({ month: s, owner: b, amount: -net[b][s]! });
    let remaining = Math.max(net.C[s]!, 0) + Math.max(net.M[s]!, 0);
    const drawn: Record<Bucket, number> = { C: 0, M: 0 };
    for (const v of vintages) {
      if (remaining <= 0) break;
      const x = Math.min(v.amount, remaining);
      v.amount -= x;
      drawn[v.owner] += x;
      remaining -= x;
    }
    for (let k = vintages.length - 1; k >= 0; k--) if (vintages[k]!.amount <= 1e-9) vintages.splice(k, 1);
    payment[t]! += remaining;
    for (const b of ["C", "M"] as const) entry[b][t]! += -Math.max(net[b][s]!, 0) + drawn[b];
  };
  for (let t = 1; t < n; t++) {
    settle(t - 1, t);
    pool[t] = vintages.reduce((a, v) => a + v.amount, 0);
  }
  if (n > 0) settle(n - 1, n - 1);
  const writtenOff: Record<Bucket, number> = { C: 0, M: 0 };
  for (const v of vintages) writtenOff[v.owner] += v.amount;
  if (n > 0) pool[n - 1] = 0;
  return { payment, entry, pool, writtenOff };
}

export function reserveLedger(inp: BessInputs, ops: OpsResult, cal: Calendar, plan: ContractPlan, fx: number[]): ReserveLedger {
  const c = plan.c;
  const n = cal.months.length;
  const last = n - 1;
  const z = () => new Array(n).fill(0) as number[];
  const pnl = z(), taxAdd = z(), revenue = z(), cash = z(), equityCall = z(), restrictedOut = z(), restrictedIn = z();
  const escrow = z(), liquidity = z(), arAs = z(), arBsp = z(), apAs = z(), apBsp = z(), vat = z(), inventory = z();
  const contractCash = z(), contractEbitda = z(), sigmaZ = z(), retention = z(), badDebt = z();
  const allocationCashC = z(), allocationEbitdaC = z();
  const vatPayment = z();
  const vatEntry: Record<Bucket, number[]> = { C: z(), M: z() };
  const vatNet: Record<Bucket, number[]> = { C: z(), M: z() };
  const lineCash: Record<Bucket, number[]> = { C: z(), M: z() };
  const lineEbitda: Record<Bucket, number[]> = { C: z(), M: z() };
  const badDebtBy: Record<Bucket, number[]> = { C: z(), M: z() };
  const flows = Object.fromEntries(FLOW_KEYS.map((k) => [k, z()])) as Record<FlowKey, number[]>;
  // dated events, applied month by month below
  const dAr = z(), dArB = z(), dApA = z(), dApB = z();
  const at = (i: number) => Math.min(i, last);
  const bucketOf = (tag: string): Bucket => (tag === "A1" ? "C" : "M");

  // --- escrow and contract liquidity reserve (spec §7): the initial award only
  const G = RESERVE.collateralEurPerMW * c.acceptedMW * fx[c.auctionMonthOffset]!;
  const escrowFlow = z();
  equityCall[c.auctionMonthOffset]! += G;
  restrictedOut[c.auctionMonthOffset]! += G;
  escrowFlow[c.auctionMonthOffset]! += G;
  flows.escrowPost[c.auctionMonthOffset]! += G;
  const D = plan.delay;
  if (plan.cancelled) {
    retention[at(plan.originalStart)]! += G;
    escrowFlow[at(plan.originalStart)]! -= G;
    flows.escrowRetained[at(plan.originalStart)]! += G;
  } else {
    if (D > 0) {
      const top = RESERVE.deferralTopUpShare * G;
      const keep = RESERVE.deferralRetentionPerMonth * D * (1 + RESERVE.deferralTopUpShare) * G;
      const i = plan.originalStart - 1;
      equityCall[i]! += top;
      restrictedOut[i]! += top;
      escrowFlow[i]! += top - keep;
      retention[i]! += keep;
      flows.escrowTopUp[i]! += top;
      flows.escrowRetained[i]! += keep;
    }
    const refund = D > 0 ? (1 + RESERVE.deferralTopUpShare - RESERVE.deferralRetentionPerMonth * D * (1 + RESERVE.deferralTopUpShare)) * G : G;
    escrowFlow[plan.effectiveStart]! -= refund;
    restrictedIn[plan.effectiveStart]! += refund;
    flows.escrowRefund[plan.effectiveStart]! += refund;
  }
  const liqFlow = z();
  if (!plan.cancelled) {
    const fill = ops.months[plan.fillIndex]!.reserve!;
    const first = ops.months[plan.effectiveStart]?.reserve;
    // L̂: the energy price of the first service month; Dn_day: the conservative gross down bound (R2-03)
    const Lhat = first?.energyPriceUah || fill.energyPriceUah;
    const Hd = RESERVE.longestDayHours;
    const C = c.acceptedMW;
    const bDay = c.peakDayFactor * Math.max(0, c.activationUp / inp.rte - c.activationDown) * C * Hd;
    const dnDay = c.peakDayFactor * c.activationDown * C * Hd;
    const LIQ = c.liquidityDays * (bDay * Lhat * (1 + VAT) + dnDay * Lhat * (1 - c.balancingPremiumDown) * (1 + VAT));
    // retained through a continuous renewal and released at the end of the last award's exclusive end month
    const release = at(plan.lastService + 1);
    equityCall[plan.fillIndex]! += LIQ + fill.fillPurchaseUah * (1 + VAT);
    restrictedOut[plan.fillIndex]! += LIQ;
    liqFlow[plan.fillIndex]! += LIQ;
    liqFlow[release]! -= LIQ;
    restrictedIn[release]! += LIQ;
    flows.liquidityPost[plan.fillIndex]! += LIQ;
    flows.liquidityRelease[release]! += LIQ;
  }

  // --- accruals and dated cash of the operating lines
  for (let s = 0; s < n; s++) {
    const o = ops.months[s]!;
    const r = o.reserve;
    if (r) {
      // origins (spec §10–§11): service lines follow the month's award (the fill belongs to A1), the exit sale the award of
      // its exit event; up energy is always merchant
      const svc: Bucket = s === plan.fillIndex ? "C" : bucketOf(plan.awardOf[s]!);
      const ex: Bucket = bucketOf(r.exitOrigin);
      const sz = plan.awardOf[s] === "A1" ? r.sigma * r.Z : 0;
      sigmaZ[s] = sz;
      const moExit = r.moFeeExitUah;
      const moSvc = r.moFeeUah - moExit;
      const levyExit = r.levyExitUah;
      const levySvc = r.levyUah - levyExit - r.levyUpUah;
      // --- company accrual P&L (ex VAT)
      pnl[s]! += r.capacityUah + r.upEnergyUah - r.downEnergyUah + r.restorationSaleUah - r.restorationPurchaseUah + r.exitSaleUah -
        r.basisReleaseUah - r.basisWriteOffUah - r.penaltyAsUah - r.penaltyBsUah - r.standingLoadUah - r.recertUah - r.moFeeUah - r.levyUah;
      revenue[s]! += r.capacityUah + r.upEnergyUah + r.restorationSaleUah + r.exitSaleUah;
      if (!c.deductible) taxAdd[s]! += r.penaltyAsUah + r.penaltyBsUah;
      // the same accruals by origin
      lineEbitda[svc][s]! += r.capacityUah - r.downEnergyUah + r.restorationSaleUah - r.restorationPurchaseUah - r.basisWriteOffUah -
        r.penaltyAsUah - r.penaltyBsUah - r.standingLoadUah - r.recertUah - moSvc - levySvc;
      lineEbitda.M[s]! += r.upEnergyUah - r.levyUpUah;
      lineEbitda[ex][s]! += r.exitSaleUah - r.basisReleaseUah - moExit - levyExit;
      // --- DA account: restoration, the fill, the exit sale and standing load settle in the month, with VAT
      cash[s]! += (r.restorationSaleUah + r.exitSaleUah - r.restorationPurchaseUah - r.fillPurchaseUah - r.standingLoadUah) * (1 + VAT) -
        r.moFeeUah - r.levyUah - r.recertUah;
      flows.daCash[s]! += (r.restorationSaleUah + r.exitSaleUah - r.restorationPurchaseUah - r.fillPurchaseUah - r.standingLoadUah) * (1 + VAT);
      flows.feesCash[s]! += r.moFeeUah + r.levyUah + r.recertUah;
      lineCash[svc][s]! += (r.restorationSaleUah - r.restorationPurchaseUah - r.fillPurchaseUah - r.standingLoadUah) * (1 + VAT) - moSvc - levySvc - r.recertUah;
      lineCash[ex][s]! += r.exitSaleUah * (1 + VAT) - moExit - levyExit;
      lineCash.M[s]! -= r.levyUpUah;
      // --- operating VAT of the month by bucket (tax point: the service or sale month)
      vatNet[svc][s]! += VAT * (r.capacityUah + r.restorationSaleUah - r.downEnergyUah - r.restorationPurchaseUah - r.fillPurchaseUah - r.standingLoadUah);
      vatNet[ex][s]! += VAT * r.exitSaleUah;
      vatNet.M[s]! += VAT * r.upEnergyUah;
      // --- AS account: the availability fee invoice (gross) is collected after the lag; the penalty is paid next month
      const capG = r.capacityUah * (1 + VAT);
      dAr[s]! += capG;
      flows.asInvoiceGross[s]! += capG;
      const col = s + c.asPaymentLagMonths;
      if (col <= last) {
        cash[col]! += capG;
        dAr[col]! -= capG;
        lineCash[svc][col]! += capG;
        flows.asCollected[col]! += capG;
      } else {
        badDebt[last]! += capG;
        badDebtBy[svc][last]! += capG;
        dAr[last]! -= capG;
        flows.asWrittenOff[last]! += capG;
      }
      if (r.penaltyAsUah > 0) {
        dApA[s]! += r.penaltyAsUah;
        cash[at(s + 1)]! -= r.penaltyAsUah;
        flows.asPenaltyAccrued[s]! += r.penaltyAsUah;
        flows.asPenaltyPaid[at(s + 1)]! += r.penaltyAsUah;
        dApA[at(s + 1)]! -= r.penaltyAsUah;
        lineCash[svc][at(s + 1)]! -= r.penaltyAsUah;
      }
      // --- BSP account of the service month: offset within the month, the residual by its sign (spec §9)
      const upG = r.upEnergyUah * (1 + VAT);
      const downG = r.downEnergyUah * (1 + VAT);
      dArB[s]! += upG;
      dApB[s]! += downG + r.penaltyBsUah;
      const t1 = at(s + 1);
      cash[t1]! -= r.penaltyBsUah;
      flows.bspUpClaimGross[s]! += upG;
      flows.bspDownLiabilityGross[s]! += downG;
      flows.bspFeeAccrued[s]! += r.penaltyBsUah;
      flows.bspFeePaid[t1]! += r.penaltyBsUah;
      dApB[t1]! -= r.penaltyBsUah;
      lineCash[svc][t1]! -= r.penaltyBsUah;
      let receivable = upG;
      if (c.settlementRegime === "offset") {
        const off = Math.min(upG, downG);
        dArB[t1]! -= off;
        dApB[t1]! -= off;
        receivable = upG - off;
        const payable = downG - off;
        if (payable > 0) { cash[t1]! -= payable; dApB[t1]! -= payable; }
        flows.bspOffset[t1]! += off;
        flows.bspPayablePaid[t1]! += payable;
        // the paired non-cash offset entry (spec §9): the down liability paid by it, the up claim collected by it
        lineCash[svc][t1]! -= off + payable;
        lineCash.M[t1]! += off;
      } else {
        cash[t1]! -= downG;
        dApB[t1]! -= downG;
        lineCash[svc][t1]! -= downG;
        flows.bspPayablePaid[t1]! += downG;
      }
      if (receivable > 0) {
        const due = s + c.balancingLagMonths;
        const get = due <= last ? c.balancingCollection * receivable : 0;
        const lost = receivable - get;
        const when = at(due);
        cash[when]! += get;
        dArB[when]! -= receivable;
        badDebt[when]! += lost;
        lineCash.M[when]! += get;
        badDebtBy.M[when]! += lost;
        flows.bspResidualCollected[when]! += get;
        flows.bspResidualWrittenOff[when]! += lost;
      }
      // --- allocations to the contract bucket (spec §11): network-bill increments by origin and the resource share of the
      // site's shared costs
      const netSvcIncr = r.networkServiceUah - r.networkDaUah;
      const netExitIncr = r.networkTotalUah - r.networkServiceUah;
      let allocCash = 0;
      let allocAcc = 0;
      if (svc === "C") { allocCash -= netSvcIncr; allocAcc -= netSvcIncr; }
      if (ex === "C") { allocCash -= netExitIncr; allocAcc -= netExitIncr; }
      if (sz > 0) {
        // lifecycle VAT is refunded two months later and stays with the merchant bucket on both sides
        allocCash -= sz * (o.fixedOpexUah + o.warExpectedUah + o.insurancePremiumUah - o.insurancePayoutUah - o.stateCompensationUah + o.lifecycleCapexUah);
        allocAcc -= sz * (o.fixedOpexUah + o.warExpectedUah + o.insurancePremiumUah - o.insuranceClaimAccrualUah - o.stateCompensationAccrualUah);
      }
      allocationCashC[s]! += allocCash;
      allocationEbitdaC[s]! += allocAcc;
    }
  }
  // the operating-VAT subledger (spec §10): payments are company cash, the entries are the buckets' VAT lines; the last
  // month's own net settles in that month; credits still unused are written off once, at the owner's cost, with no refund
  // and no liquidation proceeds
  const sub = settleOperatingVat(vatNet);
  for (let t = 0; t < n; t++) {
    cash[t]! -= sub.payment[t]!;
    vatPayment[t] = sub.payment[t]!;
    for (const b of ["C", "M"] as const) {
      vatEntry[b][t] = sub.entry[b][t]!;
      lineCash[b][t]! += sub.entry[b][t]!;
    }
  }
  const writtenOff = sub.writtenOff;
  const vatWriteOff = writtenOff.C + writtenOff.M;
  if (vatWriteOff > 0) {
    pnl[last]! -= vatWriteOff;
    if (!c.deductible) taxAdd[last]! += vatWriteOff;
    lineEbitda.C[last]! -= writtenOff.C;
    lineEbitda.M[last]! -= writtenOff.M;
  }
  // write-offs and escrow retention are P&L items of their months (spec §7, §10); retention belongs to A1
  for (let i = 0; i < n; i++) {
    pnl[i]! -= badDebt[i]! + retention[i]!;
    if (!c.deductible) taxAdd[i]! += badDebt[i]! + retention[i]!;
    lineEbitda.C[i]! -= badDebtBy.C[i]! + retention[i]!;
    lineEbitda.M[i]! -= badDebtBy.M[i]!;
    contractCash[i] = lineCash.C[i]! + allocationCashC[i]!;
    contractEbitda[i] = lineEbitda.C[i]! + allocationEbitdaC[i]!;
  }
  // closing balances
  let e = 0, l = 0, ar = 0, arb = 0, apa = 0, apb = 0;
  for (let i = 0; i < n; i++) {
    e += escrowFlow[i]!;
    l += liqFlow[i]!;
    ar += dAr[i]!;
    arb += dArB[i]!;
    apa += dApA[i]!;
    apb += dApB[i]!;
    escrow[i] = e;
    liquidity[i] = l;
    arAs[i] = ar;
    arBsp[i] = arb;
    apAs[i] = apa;
    apBsp[i] = apb;
    inventory[i] = ops.months[i]!.reserve?.basisCloseUah ?? (i > 0 ? inventory[i - 1]! : 0);
    // the month's own net is unsettled at its end (the last month's settles in itself); less the credits carried
    vat[i] = (i < last ? vatNet.C[i]! + vatNet.M[i]! : 0) - sub.pool[i]!;
  }
  const openAtEnd = Math.abs(escrow[last]!) + Math.abs(liquidity[last]!) + Math.abs(arAs[last]!) + Math.abs(arBsp[last]!) + Math.abs(apAs[last]!) +
    Math.abs(apBsp[last]!) + Math.abs(vat[last]!) + Math.abs(inventory[last]!);
  return {
    pnl, taxAdd, revenue, cash, equityCall, restrictedOut, restrictedIn, escrow, liquidity, arAs, arBsp, apAs, apBsp, vat,
    inventory, contractCash, contractEbitda, lineCash, lineEbitda, allocationCashC, allocationEbitdaC, sigmaZ, retention, badDebt,
    vatNet, vatPayment, vatEntry, vatCreditWrittenOff: writtenOff, escrowFlow, liquidityFlow: liqFlow, flows, openAtEnd,
  };
}
