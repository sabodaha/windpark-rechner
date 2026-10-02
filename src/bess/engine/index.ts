// BESS engine v1 (Ukraine, day-ahead only): run(inputs, library) → result. Pure and deterministic; the library is
// loaded by the caller. It implements the published model methodology (spec revision S1.3).
import { xnpv, type DatedFlow } from "@/engine/finance";
import { irrMetric } from "./irr";
import { buildCalendar } from "./calendar";
import { buildCapex } from "./capex";
import { liquidityReserveUah, sizeDebt } from "./funding";
import { runLedger, type LedgerResult } from "./ledger";
import type { Library } from "./library";
import { runOperations } from "./operations";
import { CASE, ENGINE, FINANCE, MACRO, REVENUE, TECH, WAR } from "./registry";
import type { AnnualRow, BessInputs, BessResult, CheckResult, LockedFunding, Metric } from "./types";

export * from "./types";
export { parseLibrary, type Library, type LibraryManifest } from "./library";
export { REGISTRY_VERSION } from "./registry";

export const BESS_BASE: BessInputs = {
  powerMW: CASE.powerMW,
  durationH: CASE.durationHoursBoL,
  rte: TECH.rteBase,
  cycleCap: TECH.warrantyCycleCap,
  augmentation: true,
  connection: "dso110kV",
  codDelayMonths: CASE.codDelayMonths,
  scenario: "reference",
  snapshot: "UA-2025",
  pathCurrency: "EUR",
  captureFactor: REVENUE.captureFactor,
  optimiserFeeRate: REVENUE.optimiserFeeRate,
  capexFactor: 1,
  lossRatio: WAR.lossRatio,
  insurance: false,
  coverAvailable: false,
  stateBudgetAvailable: true,
  debt: true,
  interestRate: FINANCE.interestRate,
  targetDscr: FINANCE.targetDscrMerchant,
  maxGearing: FINANCE.maxGearing,
  fxStress: false,
  auxStress: false,
  degradationStress: false,
  equityHurdle: MACRO.equityHurdle,
  projectDiscountRate: MACRO.projectDiscountRate,
  terminalRemittance: "capped",
};

export interface RunOptions {
  /** Use this funding instead of sizing (post-close stresses, F19). */
  funding?: LockedFunding;
  /** Multiplier on the spread path m(y) only (break-even search); 1 in normal runs. */
  spreadScale?: number;
  /** Tariff on gross withdrawal from COD (sensitivity): the legacy cohort is treated as lost. */
  grossTariffFromCod?: boolean;
  /** Add the dated audit series (project flows, dividend vintages, remittance tail) to the result. */
  detail?: boolean;
  /** Read the library at the lower usable-energy node, as the lender's case does (with `scenario: "low"`; S13-02). */
  lowerNode?: boolean;
}

const metric = (value: number | null): Metric => ({ value, status: value === null || !Number.isFinite(value) ? "notDefined" : "valid" });
const NOT_APPLICABLE: Metric = { value: null, status: "notApplicable" };

export function runBess(inp: BessInputs, lib: Library, opts: RunOptions = {}): BessResult {
  const cal = buildCalendar(inp.codDelayMonths);
  const capex = buildCapex(inp.powerMW, inp.durationH, inp.connection, inp.capexFactor);
  const scale = opts.spreadScale ?? 1;
  const gross = opts.grossTariffFromCod ?? false;
  const ops = runOperations(inp, lib, cal, capex, { scenario: inp.scenario, lowerNode: opts.lowerNode ?? false, spreadScale: scale, grossTariffFromCod: gross });
  let funding: LockedFunding;
  let lender: LedgerResult | null = null;
  let lenderUnsupported: string | null = null;
  // this case's own liquidity reserve: funded at close, and always the reserve of the unlevered project view (U10)
  const liq = liquidityReserveUah(inp, lib, cal);
  if (opts.funding) funding = opts.funding;
  else {
    if (!inp.debt) {
      funding = { debtEur: 0, principalEur: [], dsraInitialEur: 0, liquidityReserveUah: liq, sizingStatus: "noDebt", iterations: 0 };
    } else {
      const opsLender = runOperations(inp, lib, cal, capex, { scenario: "low", lowerNode: true, spreadScale: scale, grossTariffFromCod: gross });
      lenderUnsupported = opsLender.unsupported;
      const sized = sizeDebt(inp, opsLender, capex, cal, liq);
      funding = sized.funding;
      lender = sized.ledger;
    }
  }
  const led = runLedger(inp, ops, capex, cal, funding, liq);
  const fc = cal.fcDay;
  const codDay = cal.months[cal.codIndex]!.start;
  const deficit = led.minCashUah < -1;

  // returns
  const investorIrr = irrMetric(led.investorFlows, !deficit);
  const investorNpv = xnpv(inp.equityHurdle, led.investorFlows, fc);
  const projectPre = irrMetric(led.projectPreTax);
  const projectPost = irrMetric(led.projectPostTax);
  const projectNpv = xnpv(inp.projectDiscountRate, led.projectPostTax, fc);

  // coverage
  // coverage exists only where there is debt service; without a loan it is not applicable, not infinite (M11)
  const serviced = (p: { debtServiceEur: number }) => funding.debtEur > 0 && p.debtServiceEur > ENGINE.absToleranceMoney;
  const withDs = led.periods.filter(serviced);
  const minDscr = withDs.length ? Math.min(...withDs.map((p) => p.cfadsEur / p.debtServiceEur)) : null;
  const avgDscr = withDs.length ? withDs.reduce((s, p) => s + p.cfadsEur, 0) / withDs.reduce((s, p) => s + p.debtServiceEur, 0) : null;
  const lenderDs = (lender?.periods ?? []).filter(serviced);
  const lenderMin = lenderDs.length ? Math.min(...lenderDs.map((p) => p.cfadsEur / p.debtServiceEur)) : null;
  // LLCR at COD: monthly CFADS up to the final scheduled payment, Act/365 at the loan rate, discounted to the contractual
  // COD — the date the loan balance refers to, also when operation starts late (S1.3)
  const contractualCod = cal.months[cal.plannedCodIndex]!.start;
  const maturityDay = cal.periods.length ? cal.periods[cal.periods.length - 1]!.day : codDay;
  const llcrFlows = led.cfadsMonthly.filter((f) => f.day <= maturityDay);
  const llcr = funding.debtEur > 0 ? xnpv(inp.interestRate, llcrFlows, contractualCod) / funding.debtEur : null;

  // LCOS (before financing and income tax): capex with construction and lifecycle cost, operating costs including the
  // optimiser fee, charging purchases and decommissioning, over delivered AC MWh — both at the project rate from FC
  const costFlows: DatedFlow[] = [];
  const mwhFlows: DatedFlow[] = [];
  let pf2029 = 0;
  let cap2029 = 0;
  let net2029 = 0;
  for (const o of ops.months) {
    const m = cal.months[o.index]!;
    const day = m.last;
    // insurance claims and state refunds count when received; receivables written off at the end never do (M12)
    const cost = o.purchasesUah + o.optimiserFeeUah + o.opexUah + o.tariffUah + o.warExpectedUah + o.insurancePremiumUah -
      o.insurancePayoutUah - o.stateCompensationUah + o.lifecycleCapexUah + o.decommissioningUah;
    if (cost !== 0) costFlows.push({ day, amount: cost / o.fx });
    if (o.exportMWh > 0) mwhFlows.push({ day, amount: o.exportMWh });
    if (m.year === 2029) {
      pf2029 += o.pfMarginUah / o.fx;
      cap2029 += o.capturedUah / o.fx;
      net2029 += (o.capturedUah - o.optimiserFeeUah) / o.fx;
    }
  }
  for (const line of capex.lines) {
    line.profile.forEach((w, i) => {
      if (w === 0) return;
      const x = led.monthly.fx[i]!;
      costFlows.push({ day: cal.months[i]!.last, amount: line.currency === "EUR" ? line.amount * w : (line.amount * w) / x });
    });
  }
  const pvMwh = xnpv(inp.projectDiscountRate, mwhFlows, fc);
  const lcos = pvMwh > 0 ? xnpv(inp.projectDiscountRate, costFlows, fc) / pvMwh : null;

  // payback: first date the cumulative investor flow turns non-negative
  const sorted = [...led.investorFlows].sort((a, b) => a.day - b.day);
  let cum = 0;
  let payback: number | null = null;
  let dipsAfter = false;
  for (const f of sorted) {
    cum += f.amount;
    if (payback === null && cum >= 0 && f.amount > 0) payback = (f.day - fc) / 365;
    else if (payback !== null && cum < -ENGINE.absToleranceMoney) dipsAfter = true;
  }

  // annual table, including the years of the liquidation transfers after the settlement month (M13)
  const annual: AnnualRow[] = [];
  const lastIdx = cal.months.length - 1;
  const lastModelYear = cal.months[lastIdx]!.year;
  const years = [...new Set([...cal.months.map((m) => m.year), ...led.tail.map((t) => t.year)])];
  /** Cash in the company at the end of a year from the settlement year on, EUR: what is left after liquidation (negative
   *  in a deficit, S13-01) plus what is still held for the investor (the transfer tail, or all of it when blocked). */
  const residualEur = led.monthly.cashUah[lastIdx]! / led.monthly.fx[lastIdx]!;
  const heldAt = (y: number): number => {
    if (inp.terminalRemittance === "blocked") return residualEur + led.blockedAtEndEur;
    const paid = led.tail.filter((t) => t.year <= y);
    if (paid.length > 0) return residualEur + paid[paid.length - 1]!.leftUah / paid[paid.length - 1]!.fx;
    return residualEur + led.heldAtEndUah / led.monthly.fx[lastIdx]!;
  };
  for (const y of years) {
    const idx = cal.months.filter((m) => m.year === y).map((m) => m.index);
    const tailIn = led.tail.filter((t) => t.year === y);
    const sum = (fn: (i: number) => number) => idx.reduce((s, i) => s + fn(i), 0);
    const om = ops.months;
    const eur = (i: number, v: number) => v / om[i]!.fx;
    const lastOp = idx.filter((i) => cal.months[i]!.phase === "operation").pop();
    annual.push({
      year: y,
      deliveredMWh: sum((i) => om[i]!.exportMWh),
      sohInitial: lastOp !== undefined ? om[lastOp]!.sohInitial : 0,
      usableHoursEnd: lastOp !== undefined ? om[lastOp]!.usableHours : 0,
      pfMarginEur: sum((i) => eur(i, om[i]!.pfMarginUah)),
      capturedMarginEur: sum((i) => eur(i, om[i]!.capturedUah)),
      optimiserFeeEur: sum((i) => eur(i, om[i]!.optimiserFeeUah)),
      netRevenueEur: sum((i) => eur(i, om[i]!.capturedUah - om[i]!.optimiserFeeUah)),
      opexEur: sum((i) => eur(i, om[i]!.opexUah)),
      tariffsEur: sum((i) => eur(i, om[i]!.tariffUah)),
      warExpectedEur: sum((i) => eur(i, om[i]!.warExpectedUah + om[i]!.insurancePremiumUah - om[i]!.insuranceClaimAccrualUah - om[i]!.stateCompensationAccrualUah)),
      ebitdaEur: sum((i) => eur(i, led.monthly.opCashUah[i]! + om[i]!.lifecycleCapexUah + om[i]!.lifecycleVatUah)),
      taxPaidEur: sum((i) => eur(i, led.monthly.taxPaidUah[i]!)),
      lifecycleCapexEur: sum((i) => eur(i, om[i]!.lifecycleCapexUah + om[i]!.decommissioningUah)),
      cfadsEur: sum((i) => eur(i, led.monthly.opCashUah[i]! - led.monthly.taxPaidUah[i]!)),
      debtServiceEur: sum((i) => eur(i, led.monthly.dsUah[i]!)),
      dividendsGrossEur: sum((i) => eur(i, led.monthly.divGrossUah[i]!)) + tailIn.reduce((a, t) => a + t.grossDividendUah / t.fx, 0),
      investorNetEur: sum((i) => led.monthly.investorNetEur[i]!) + tailIn.reduce((a, t) => a + t.netEur, 0),
      cashInSpvEur: y < lastModelYear ? eur(idx[idx.length - 1]!, led.monthly.cashUah[idx[idx.length - 1]!]!) : heldAt(y),
    });
  }
  const opYears = annual.filter((a) => a.year >= cal.months[cal.codIndex]!.year && a.year < cal.months[cal.months.length - 1]!.year);
  const trapped = opYears.length ? Math.max(0, ...opYears.map((a) => a.cashInSpvEur)) : 0;

  // checks: an integrity failure, a bad business and missing data are different statuses (spec §17)
  const checks: CheckResult[] = [];
  const add = (c: CheckResult) => checks.push(c);
  // physics: RTE × energy bought = energy delivered in every closed month, within the storage tolerance (M03), and the
  // delivered energy within the daily cycle limit
  let energyGap = 0;
  let cycleExcess = 0;
  for (const o of ops.months) {
    if (!o.operating) continue;
    energyGap = Math.max(energyGap, Math.abs(inp.rte * o.importMWh - o.exportMWh));
    const limit = inp.cycleCap * inp.durationH * inp.powerMW * cal.months[o.index]!.days;
    cycleExcess = Math.max(cycleExcess, o.exportMWh - limit);
  }
  const storageTolerance = (ENGINE.storageToleranceEnergyPer50MW * inp.powerMW) / 50;
  add({ id: "energyBalance", group: "physical", status: energyGap <= storageTolerance ? "pass" : "fail", value: energyGap });
  add({ id: "cycleLimit", group: "physical", status: cycleExcess <= storageTolerance ? "pass" : "fail", value: cycleExcess });
  const unsupported = ops.unsupported ?? lenderUnsupported;
  add({ id: "library", group: "data", status: unsupported ? "fail" : "pass", note: unsupported ?? undefined });
  add({ id: "sizingConverged", group: "funding", status: funding.sizingStatus === "failed" ? "fail" : "pass", value: funding.iterations });
  add({ id: "drawsEqualDebt", group: "integrity", status: Math.abs(led.drawsMinusDebtEur) < 1 ? "pass" : "fail", value: led.drawsMinusDebtEur });
  add({ id: "balanceSheet", group: "integrity", status: led.maxBalanceErrorUah < 1 ? "pass" : "fail", value: led.maxBalanceErrorUah });
  add({ id: "cashNonNegative", group: "funding", status: deficit ? "fail" : "pass", value: led.minCashUah });
  add({ id: "debtRepaid", group: "funding", status: led.debtAfterMaturityEur < 1 && led.arrearsAtEndEur < 1 ? "pass" : "fail", value: led.arrearsAtEndEur });
  add({ id: "gearing", group: "funding", status: funding.debtEur <= inp.maxGearing * led.usesExVatEur + 1 ? "pass" : "fail", value: funding.debtEur / Math.max(led.usesExVatEur, 1) });
  add({ id: "dsraFunded", group: "funding", status: led.dsraShortAfterTopUp ? "warning" : "pass" });
  // a covenant lock-up: a period whose cover falls below the lock-up level (the wait for two full periods is structural)
  const lockups = led.periods.filter((p) => p.dscr !== null && p.dscr < FINANCE.lockupDscr).length;
  add({ id: "lockup", group: "covenant", status: lockups > 0 ? "warning" : "pass", value: lockups });
  add({ id: "default", group: "covenant", status: minDscr !== null && minDscr < FINANCE.defaultDscr ? "fail" : "pass", value: minDscr ?? undefined });
  add({ id: "repatriationCap", group: "scope", status: led.repatriationCapBound ? "warning" : "pass", value: led.remittanceTailMonths });
  add({ id: "terminalRemittance", group: "scope", status: inp.terminalRemittance === "blocked" ? "warning" : "pass", value: led.blockedAtEndEur });
  add({ id: "thinCap", group: "scope", status: led.thinCapMax > 3.5 ? "warning" : "pass", value: led.thinCapMax });
  // a model rule, not a disclosure: declarations above settled taxable profit would put the case outside v1 (S13-03)
  add({ id: "dividendsWithinTaxableProfit", group: "integrity", status: led.dividendsDeclaredUah <= led.vintageCapacityUah + 1 ? "pass" : "fail" });
  add({ id: "receivablesWrittenOff", group: "scope", status: led.receivablesWrittenOffUah > 1 ? "warning" : "pass", value: led.receivablesWrittenOffUah });
  add({ id: "cohortLost", group: "scope", status: ops.cohortLost ? "warning" : "pass" });
  add({ id: "retiredBelowGrid", group: "scope", status: ops.retiredBelowGrid ? "warning" : "pass" });
  add({ id: "feeFloor", group: "scope", status: ops.feeFloorMonths > 0 ? "warning" : "pass", value: ops.feeFloorMonths });
  add({ id: "tariffAfter2037", group: "scope", status: "warning", note: "gross-withdrawal tariff assumed until NEURC publishes the methodology" });
  add({ id: "psoSurcharges", group: "scope", status: "outOfScope", note: "PSO surcharges from 2030 (law 4937-IX) not quantified" });
  add({ id: "warCover", group: "scope", status: inp.insurance && !inp.coverAvailable ? "warning" : "pass" });
  add({ id: "taxRulesVerification", group: "scope", status: "warning", note: "tax deadlines and asset classes to be verified against the Tax Code" });
  // returns are shown only for a funded case whose calculation, physics and data hold (spec §17, S13-03)
  const returnsMeaningful = !unsupported && !deficit && !checks.some((c) => c.status === "fail" && (c.group === "integrity" || c.group === "physical"));

  return {
    inputs: inp,
    funding,
    kpis: {
      investorIrr, investorNpv: metric(investorNpv), projectIrrPreTax: projectPre, projectIrrPostTax: projectPost,
      projectNpv: metric(projectNpv),
      // without a loan there is no debt service to cover: not applicable rather than undefined (M11)
      minDscr: funding.debtEur > 0 ? metric(minDscr) : NOT_APPLICABLE,
      avgDscr: funding.debtEur > 0 ? metric(avgDscr) : NOT_APPLICABLE,
      lenderMinDscr: funding.debtEur > 0 ? metric(lenderMin) : NOT_APPLICABLE,
      llcr: funding.debtEur > 0 ? metric(llcr) : NOT_APPLICABLE, gearing: metric(funding.debtEur / Math.max(led.usesExVatEur, 1)), debtEur: metric(funding.debtEur),
      equityEur: metric(led.equityEur), lcos: metric(lcos),
      pfMargin2029PerMW: metric(pf2029 / inp.powerMW), capturedMargin2029PerMW: metric(cap2029 / inp.powerMW),
      netRevenue2029PerMW: metric(net2029 / inp.powerMW), paybackYears: metric(payback), paybackDipsAfter: metric(dipsAfter ? 1 : 0),
      trappedCashMaxEur: metric(trapped), usesExVatEur: metric(led.usesExVatEur), liquidityReserveUah: metric(funding.liquidityReserveUah),
    },
    periods: led.periods.map((p) => ({ day: p.day, cfadsEur: p.cfadsEur, debtServiceEur: p.debtServiceEur, dscr: p.dscr, balanceEur: p.openingEur - p.principalEur })),
    lenderPeriods: (lender?.periods ?? []).map((p) => ({ cfadsEur: p.cfadsEur, debtServiceEur: p.debtServiceEur, dscr: p.dscr })),
    annual,
    checks,
    returnsMeaningful,
    capexAllInEur: capex.allInEur,
    investorFlows: led.investorFlows,
    ...(opts.detail && {
      detail: {
        projectPreTax: led.projectPreTax,
        projectPostTax: led.projectPostTax,
        cfadsMonthly: led.cfadsMonthly,
        dividendAllocations: led.dividendAllocations,
        remittanceTail: led.tail,
        equityByMonth: led.equityByMonth,
        pnlMonthlyUah: led.pnlMonthlyUah,
      },
    }),
  };
}

export interface BreakEven {
  value: number | null;
  /** `found` — the first supported sign change (a zero endpoint counts); `notReached` — no change of sign on the
   *  supported points; `unsupportedBelow` — the NPV is already positive at the lowest supported multiplier, which lies
   *  above the start of the domain; `unsupported` — no point of the domain is inside the library (U12). */
  status: "found" | "notReached" | "unsupportedBelow" | "unsupported";
  /** Smallest multiplier the library supports in the search domain. */
  supportedFrom: number | null;
}

/** Multiplier k on m(y) at which the investor NPV at the hurdle is zero, funding locked (spec §15, S1.2): scan the
 *  domain, skip points the library cannot support, bisect inside the first supported bracket with a sign change. */
export function breakEvenSpread(inp: BessInputs, lib: Library, funding: LockedFunding, opts: Pick<RunOptions, "lowerNode"> = {}): BreakEven {
  const [lo0, hi0] = ENGINE.breakEvenDomain;
  const evalK = (k: number): number | null => {
    const r = runBess(inp, lib, { ...opts, funding, spreadScale: k });
    return r.checks.find((c) => c.id === "library")!.status === "fail" ? null : r.kpis.investorNpv!.value;
  };
  const pts: [number, number][] = [];
  let supportedFrom: number | null = null;
  for (let k = lo0; k <= hi0 + 1e-9; k += 0.1) {
    const v = evalK(k);
    if (v === null) continue;
    supportedFrom ??= k;
    pts.push([k, v]);
  }
  for (let j = 1; j < pts.length; j++) {
    let [a, fa] = pts[j - 1]!;
    let [b] = pts[j]!;
    if (fa * pts[j]![1] > 0) continue;
    for (let it = 0; it < 40 && b - a > 1e-5; it++) {
      const mid = (a + b) / 2;
      const fm = evalK(mid);
      if (fm === null) break;
      if (fa * fm <= 0) b = mid;
      else {
        a = mid;
        fa = fm;
      }
    }
    return { value: (a + b) / 2, status: "found", supportedFrom };
  }
  if (supportedFrom === null) return { value: null, status: "unsupported", supportedFrom };
  const belowLibrary = supportedFrom > lo0 + 1e-9 && pts[0]![1] > 0;
  return { value: null, status: belowLibrary ? "unsupportedBelow" : "notReached", supportedFrom };
}
