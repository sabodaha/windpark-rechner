// BESS engine v1 (Ukraine, day-ahead only): run(inputs, library) → result. Pure and deterministic; the library is
// loaded by the caller. It implements the published model methodology (spec revision S1.3).
import { toIso } from "@/engine/dates";
import { xnpv, type DatedFlow } from "@/engine/finance";
import { irrMetric } from "./irr";
import { buildCalendar } from "./calendar";
import { buildCapex } from "./capex";
import { liquidityReserveUah, periodBudget, sizeDebt } from "./funding";
import { runLedger, type LedgerResult } from "./ledger";
import type { Library } from "./library";
import { fxMonth } from "./macro";
import { runOperations, type ReserveChecks } from "./operations";
import { CASE, CONTRACT_DEFAULTS, CONTRACT_PRESET_MW, ENGINE, FINANCE, MACRO, RESERVE, REVENUE, TECH, WAR } from "./registry";
import { contractActive, contractIssues, contractPlan, contractUnsupported, recoveryHours, type ContractPlan } from "./reserves";
import type { AnnualRow, BessInputs, BessResult, CaseStatus, CheckResult, ContractInputs, ContractResult, LockedFunding, Metric } from "./types";

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
  /** v1.1a p* scan: admit zero and above-cap contract prices; every other rule still applies (spec v1.1 §12). */
  diagnosticPrice?: boolean;
  /** Attach the internal calendar, plan, operations and ledgers (the acceptance export, spec v1.1 R3 §16). */
  trace?: boolean;
}

const metric = (value: number | null): Metric => ({ value, status: value === null || !Number.isFinite(value) ? "notDefined" : "valid" });
const NOT_APPLICABLE: Metric = { value: null, status: "notApplicable" };

export function runBess(inp: BessInputs, lib: Library, opts: RunOptions = {}): BessResult {
  const cal = buildCalendar(inp.codDelayMonths);
  const capex = buildCapex(inp.powerMW, inp.durationH, inp.connection, inp.capexFactor);
  const scale = opts.spreadScale ?? 1;
  const gross = opts.grossTariffFromCod ?? false;
  // v1.1a contract (spec v1.1 R2): an unsupported input is a status rather than zero income; the run then continues
  // without the contract so that the reason can be shown
  const issues = contractIssues(inp, cal, opts.diagnosticPrice ?? false);
  const contractIssue = issues[0] ?? null;
  const plan = contractActive(inp) && !contractIssue ? contractPlan(inp, cal) : null;
  // the lender case keeps only the initial award, with activation energy at day-ahead prices (spec §11)
  const lenderInp: BessInputs = plan ? { ...inp, contract: { ...inp.contract!, renewal: false, balancingPremiumUp: 0, balancingPremiumDown: 0 } } : inp;
  const lenderPlan = plan ? contractPlan(lenderInp as BessInputs & { contract: ContractInputs }, cal) : null;
  const ops = runOperations(inp, lib, cal, capex, { scenario: inp.scenario, lowerNode: opts.lowerNode ?? false, spreadScale: scale, grossTariffFromCod: gross, plan });
  let funding: LockedFunding;
  let lender: LedgerResult | null = null;
  let lenderUnsupported: string | null = null;
  let lenderReserveChecks: ReturnType<typeof runOperations>["reserveChecks"] | null = null;
  let lenderOps: ReturnType<typeof runOperations> | null = null;
  // this case's own liquidity reserve: funded at close, and always the reserve of the unlevered project view (U10)
  // v1.1a: the DA purchase envelope follows the DA share of the contractual-COD month (G3-10); 1 without a contract
  const liq = liquidityReserveUah(inp, lib, cal, ops.months[cal.plannedCodIndex]?.reserve?.sigmaA ?? 1);
  if (opts.funding) funding = opts.funding;
  else {
    if (!inp.debt) {
      funding = { debtEur: 0, principalEur: [], dsraInitialEur: 0, liquidityReserveUah: liq, sizingStatus: "noDebt", iterations: 0 };
    } else {
      const opsLender = runOperations(lenderInp, lib, cal, capex, { scenario: "low", lowerNode: true, spreadScale: scale, grossTariffFromCod: gross, plan: lenderPlan });
      lenderUnsupported = opsLender.unsupported;
      lenderOps = opsLender;
      lenderReserveChecks = lenderPlan ? opsLender.reserveChecks : null;
      const sized = sizeDebt(lenderInp, opsLender, capex, cal, liq, lenderPlan);
      funding = sized.funding;
      lender = sized.ledger;
    }
  }
  const led = runLedger(inp, ops, capex, cal, funding, liq, plan);
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
    // v1.1a (spec §13): the reserve's charging, fees, penalties and certification are costs once; its physical discharge
    // (commands up and exports) is delivered energy; capacity and up-energy income are not negative costs
    const r = o.reserve;
    if (r) {
      const rCost = r.restorationPurchaseUah + r.fillPurchaseUah + r.downEnergyUah + r.penaltyAsUah + r.penaltyBsUah + r.recertUah +
        r.standingLoadUah + r.moFeeUah + r.levyUah;
      if (rCost !== 0) costFlows.push({ day, amount: rCost / o.fx });
      if (r.U + r.X > 0) mwhFlows.push({ day, amount: r.U + r.X });
    }
    // the escrow retention counts once in its month, a construction month included (spec §13)
    const retained = led.reserve?.retention[o.index] ?? 0;
    if (retained !== 0) costFlows.push({ day, amount: retained / o.fx });
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
      ...(led.reserve && { contractNetEur: sum((i) => eur(i, led.reserve!.cash[i]!)) }),
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
  // v1.1a checks (spec v1.1 R3 §14): a failed physical screen makes the case physicallyUnsupported, a failed identity a
  // calculation error; the approximations are disclosed
  if (contractIssue) add({ id: "contractInputs", group: "inputs", status: "fail", note: issues.map((x) => `${x.code}: ${x.message}`).join("; ") });
  if (plan) {
    const rl = led.reserve!;
    const last = cal.months.length - 1;
    const fin = (v: number) => (Number.isFinite(v) ? v : undefined);
    // a screen fails when it fails on the case's own path or on the lender's (spec §3: every candidate path); the
    // lender: checks keep the lender path's own values as a diagnostic
    const both = (key: keyof ReserveChecks) => Math.max(ops.reserveChecks[key], lenderReserveChecks?.[key] ?? -Infinity);
    const own: ReserveChecks = { ...ops.reserveChecks, headroom: both("headroom"), quotaA: both("quotaA"), recoveryB: both("recoveryB"), transitionPower: both("transitionPower") };
    const physical = (prefix: string, rc: ReserveChecks, renewal: boolean) => {
      add({ id: `${prefix}reserveOverAllocated`, group: "physical", status: rc.headroom <= 1e-12 ? "pass" : "fail", value: fin(rc.headroom) });
      add({ id: `${prefix}warrantyQuotaExceeded`, group: "physical", status: rc.quotaA <= 1e-9 ? "pass" : "fail", value: fin(rc.quotaA) });
      add({ id: `${prefix}recoveryEnvelopeExceeded`, group: "physical", status: rc.recoveryB <= 1e-9 ? "pass" : "fail", value: fin(rc.recoveryB) });
      add({ id: `${prefix}transitionPowerExceeded`, group: "physical", status: rc.transitionPower <= 1e-9 ? "pass" : "fail", value: fin(rc.transitionPower) });
      if (renewal) add({ id: `${prefix}renewalUnsupported`, group: "physical", status: rc.renewal <= 1e-9 ? "pass" : "fail", value: fin(rc.renewal) });
      add({ id: `${prefix}activationEnergyBalance`, group: "integrity", status: rc.energyBalance <= 1e-6 ? "pass" : "fail", value: rc.energyBalance });
      add({ id: `${prefix}inventoryClosed`, group: "integrity", status: rc.inventory <= 0.01 ? "pass" : "fail", value: rc.inventory });
      add({ id: `${prefix}inventoryCostClosed`, group: "integrity", status: rc.inventoryCost <= 0.01 ? "pass" : "fail", value: rc.inventoryCost });
      add({ id: `${prefix}noDoubleSale`, group: "integrity", status: rc.lifecycle <= 1e-6 ? "pass" : "fail", value: rc.lifecycle });
    };
    physical("", own, plan.awards.length > 1);
    if (lenderReserveChecks) physical("lender:", lenderReserveChecks, false);
    let stateGap = 0;
    for (let i = 0; i < cal.months.length; i++) if (plan.window[i]) stateGap = Math.max(stateGap, Math.abs(plan.S[i]! + plan.R[i]! + plan.released[i]! - 1));
    add({ id: "stateIdentity", group: "integrity", status: stateGap <= 1e-12 ? "pass" : "fail", value: stateGap });
    const restrictedGap = Math.abs(rl.escrow[last]!) + Math.abs(rl.liquidity[last]!) + Math.max(0, -Math.min(...rl.escrow)) + Math.max(0, -Math.min(...rl.liquidity));
    add({ id: "escrowRollForward", group: "integrity", status: restrictedGap < 0.01 ? "pass" : "fail", value: restrictedGap });
    const openClaims = Math.abs(rl.arAs[last]!) + Math.abs(rl.arBsp[last]!) + Math.abs(rl.apAs[last]!) + Math.abs(rl.apBsp[last]!);
    add({ id: "receivablesReconcile", group: "integrity", status: openClaims < 0.01 ? "pass" : "fail", value: openClaims });
    let vatGap = Math.abs(rl.vat[last]!);
    let paid = 0;
    let nets = 0;
    for (let i = 0; i <= last; i++) {
      vatGap = Math.max(vatGap, Math.abs(rl.vatEntry.C[i]! + rl.vatEntry.M[i]! + rl.vatPayment[i]!));
      paid += rl.vatPayment[i]!;
      nets += rl.vatNet.C[i]! + rl.vatNet.M[i]!;
    }
    vatGap = Math.max(vatGap, Math.abs(paid - nets - rl.vatCreditWrittenOff.C - rl.vatCreditWrittenOff.M));
    add({ id: "vatReconcile", group: "integrity", status: vatGap < 0.01 ? "pass" : "fail", value: vatGap });
    let bucketGap = 0;
    for (let i = 0; i <= last; i++) {
      bucketGap = Math.max(bucketGap, Math.abs(rl.cash[i]! - rl.lineCash.C[i]! - rl.lineCash.M[i]!), Math.abs(rl.pnl[i]! - rl.lineEbitda.C[i]! - rl.lineEbitda.M[i]!));
    }
    add({ id: "bucketsReconcile", group: "integrity", status: bucketGap < 0.01 ? "pass" : "fail", value: bucketGap });
    const weights = Object.values(led.taxWeights);
    const weightGap = weights.length ? Math.max(0, ...weights.map((w) => Math.max(w - 1, -w))) : 0;
    add({ id: "taxAllocationSums", group: "integrity", status: weightGap <= 1e-12 ? "pass" : "fail", value: weightGap });
    add({ id: "contractCancelled", group: "scope", status: plan.cancelled ? "warning" : "pass", value: plan.delay });
    for (const [id, note] of [
      ["activationProxy", "activation, netting, balancing prices and the peak day are uncalibrated proxies"],
      ["repeatCalls", "repeated or longer commands beyond the static stock are not modelled"],
      ["meterProxy", "connection-point flows are summed by slice (a conservative tariff proxy)"],
      ["certificateRules", "the 30 % rule and 'three failures in six months' are not modelled: certificate assumed maintained"],
      ["balancingFee", "the balancing non-compliance fee is zero on full delivery (fee-only sensitivity only)"],
      ["wartimeRelief", "resolution 1294 relief assumed accepted; the penalty window is an expected-fee approximation"],
      ["futureAgreement", "the future-AS agreement and the wartime settlement rules (resolution 332) are not reviewed"],
      ["collectionAndVat", "BSP collection lag, write-off and the VAT timing are scenarios; VAT of operating fees is not timed"],
      ["capRegime", "the auction cap after 2027 is a scenario"],
      ["postExpiry", "after the last award the inherited outage derate stands in for open repairs"],
      ["transitionDays", "the fill and exit days withhold one day of the moving slice from the monthly DA library"],
    ] as const) add({ id, group: "scope", status: "warning", note });
  }
  // returns are shown only for a funded case whose calculation, physics and data hold (spec §17, S13-03)
  const returnsMeaningful = !unsupported && !contractIssue && !deficit && !checks.some((c) => c.status === "fail" && (c.group === "integrity" || c.group === "physical"));
  // the case's primary status (spec v1.1 R3 §14): exactly one, the first that applies; the failed checks are secondary
  const failedIds = checks.filter((c) => c.status === "fail").map((c) => c.id);
  // the reasons name each failed screen once, by its §14 name (the unprefixed check already covers the lender path)
  const screens = failedIds.filter((id) => RESERVE_SCREENS.has(id));
  const calcErrors = checks.filter((c) => c.status === "fail" && (c.group === "integrity" || c.group === "physical") && !RESERVE_SCREENS.has(c.id.replace(/^lender:/, ""))).map((c) => c.id);
  const status: CaseStatus = contractIssue || unsupported
    ? { primary: "inputUnsupported", reasons: contractIssue ? issues.map((x) => x.code) : ["library"] }
    : screens.length ? { primary: "physicallyUnsupported", reasons: screens }
    : calcErrors.length ? { primary: "calcError", reasons: calcErrors }
    : plan?.cancelled ? { primary: "cancelled", reasons: ["contractCancelled"] }
    : { primary: "ok", reasons: [] };

  // v1.1a contract summary: dates, awards, the first full year's bridge per MW and the debt buckets (spec §11–§13)
  let contract: ContractResult | undefined;
  if (plan) {
    const iso = (i: number) => toIso(cal.months[Math.min(i, cal.months.length - 1)]!.start);
    const b = { capacity: 0, daNet: 0, upEnergy: 0, downEnergy: 0, restoration: 0, penalties: 0, feesAndLoad: 0, networkIncrement: 0, net: 0 };
    for (const o of ops.months) {
      if (cal.months[o.index]!.year !== 2029) continue;
      const e = (v: number) => v / o.fx / inp.powerMW;
      b.daNet += e(o.capturedUah - o.optimiserFeeUah);
      const r = o.reserve;
      if (!r) continue;
      b.capacity += e(r.capacityUah);
      b.upEnergy += e(r.upEnergyUah);
      b.downEnergy -= e(r.downEnergyUah);
      b.restoration += e(r.restorationSaleUah + r.exitSaleUah - r.restorationPurchaseUah - r.basisReleaseUah - r.basisWriteOffUah);
      b.penalties -= e(r.penaltyAsUah + r.penaltyBsUah);
      b.feesAndLoad -= e(r.moFeeUah + r.levyUah + r.standingLoadUah + r.recertUah);
      b.networkIncrement -= e(r.networkTotalUah - r.networkDaUah);
    }
    b.net = b.capacity + b.daNet + b.upEnergy + b.downEnergy + b.restoration + b.penalties + b.feesAndLoad + b.networkIncrement;
    let cSum = 0;
    let tSum = 0;
    for (let i = 0; i < cal.months.length; i++) {
      if (plan.awardOf[i] !== "A1") continue;
      cSum += led.contractCfadsUah[i]! / led.monthly.fx[i]!;
      tSum += (led.monthly.opCashUah[i]! - led.monthly.taxPaidUah[i]!) / led.monthly.fx[i]!;
    }
    // for the interface: the award's money and physics at a glance (presentation only)
    const rl = led.reserve!;
    const fxM = led.monthly.fx;
    const peak = (arr: number[]) => Math.max(0, ...arr.map((v, i) => v / fxM[i]!));
    let fillEur = 0;
    let sigmaStarMax = 0;
    let quotaUseMax = 0;
    let da29 = 0;
    let n29 = 0;
    for (const o of ops.months) {
      const r = o.reserve;
      if (!r) continue;
      fillEur += r.fillPurchaseUah / o.fx;
      if (r.window > 0 || r.tau > 0) sigmaStarMax = Math.max(sigmaStarMax, r.sigmaStar);
      if (r.window > 0 && r.quota.a[1] > 0) quotaUseMax = Math.max(quotaUseMax, r.quota.a[0] / r.quota.a[1]);
      if (cal.months[o.index]!.year === 2029 && o.operating) {
        da29 += r.sigmaA;
        n29++;
      }
    }
    const rec = recoveryHours(inp.contract!, inp.rte);
    contract = {
      delay: plan.delay, cancelled: plan.cancelled,
      effectiveStart: plan.cancelled ? null : iso(plan.effectiveStart),
      lastService: plan.cancelled ? null : iso(plan.lastService),
      awards: plan.awards.map((a) => ({ tag: a.tag, start: iso(a.start), endExclusive: iso(a.endExclusive), eurPerMWHour: a.eurPerMWHour, capEur: a.capEur })),
      bridge2029PerMW: b,
      buckets: led.periods.map((p) => ({ day: p.day, contractEur: p.cfadsContractEur, merchantEur: p.cfadsEur - p.cfadsContractEur, budgetEur: periodBudget(p.cfadsEur, p.cfadsContractEur, inp.targetDscr) })),
      contractShare: tSum > 0 ? cSum / tSum : null,
      summary: {
        acceptedMW: inp.contract!.acceptedMW,
        escrowPeakEur: peak(rl.escrow),
        liquidityPeakEur: peak(rl.liquidity),
        fillEur,
        sponsorCallsEur: rl.equityCall.reduce((s, v, i) => s + v / fxM[i]!, 0),
        sigmaStarMax,
        daShare2029: n29 ? da29 / n29 : null,
        recoveryHoursUp: rec.up,
        recoveryHoursDown: rec.down,
        quotaUseMax,
      },
    };
  }

  return {
    inputs: inp,
    status,
    ...(opts.trace && { trace: { cal, plan, lenderPlan, ops, ledger: led, lenderOps, lenderLedger: lender, lenderInputs: lenderInp } }),
    ...(contract && { contract }),
    funding,
    kpis: {
      investorIrr, investorNpv: metric(investorNpv), projectIrrPreTax: projectPre, projectIrrPostTax: projectPost,
      projectNpv: metric(projectNpv),
      // without a loan there is no debt service to cover: not applicable rather than undefined (M11)
      minDscr: funding.debtEur > 0 ? metric(minDscr) : NOT_APPLICABLE,
      avgDscr: funding.debtEur > 0 ? metric(avgDscr) : NOT_APPLICABLE,
      lenderMinDscr: funding.debtEur > 0 ? metric(lenderMin) : NOT_APPLICABLE,
      llcr: funding.debtEur > 0 ? metric(llcr) : NOT_APPLICABLE, gearing: metric(funding.debtEur / Math.max(led.usesExVatEur, 1)), debtEur: metric(funding.debtEur),
      // all equity contributions: construction equity and the reserve's sponsor calls at their months' FX (gate-3 G3-07)
      equityEur: metric(led.equityEur + (led.reserve ? led.reserve.equityCall.reduce((sum, v, i) => sum + v / led.monthly.fx[i]!, 0) : 0)), lcos: metric(lcos),
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

// ---------------------------------------------------------------------------------------------------------------------
// v1.1a: the largest supported award and the break-even contract price (spec v1.1 R2 §3, §12)

/** The reserve's physical screens (spec R3 §14): a failure makes the case physicallyUnsupported, not a calculation error. */
const RESERVE_SCREENS = new Set(["reserveOverAllocated", "warrantyQuotaExceeded", "recoveryEnvelopeExceeded", "transitionPowerExceeded", "renewalUnsupported"]);

const physicalOk = (rc: ReserveChecks) =>
  rc.headroom <= 1e-12 && rc.quotaA <= 1e-9 && rc.recoveryB <= 1e-9 && rc.transitionPower <= 1e-9 && rc.renewal <= 1e-9;

/** Largest awarded MW the battery holds in every service month and transition day, on the case's own physical path and
 *  the lender's (R1-07, R2-02): integer candidates from the joint import ceiling downwards; the first that passes every
 *  physical screen. 0 if none. */
export function contractCmax(inp: BessInputs, lib: Library): number {
  if (!inp.contract) return 0;
  const c = inp.contract;
  const cal = buildCalendar(inp.codDelayMonths);
  const capex = buildCapex(inp.powerMW, inp.durationH, inp.connection, inp.capexFactor);
  const aAux = inp.auxStress ? TECH.auxStressShareOfPower : 0;
  const ceiling = Math.floor((inp.powerMW * (1 - aAux)) / (1 + c.recoveryPowerShare + c.standingLoadShare) + 1e-9);
  for (let C = ceiling; C >= 1; C--) {
    const trial = { ...inp, contract: { ...c, enabled: true, acceptedMW: C } };
    if (contractUnsupported(trial, cal, true)) continue;
    const plan = contractPlan(trial, cal);
    if (plan.cancelled) return C;
    const ops = runOperations(trial, lib, cal, capex, { scenario: inp.scenario, lowerNode: false, spreadScale: 1, plan });
    if (!physicalOk(ops.reserveChecks)) continue;
    const lenderTrial = { ...trial, contract: { ...trial.contract, renewal: false, balancingPremiumUp: 0, balancingPremiumDown: 0 } };
    const opsL = runOperations(lenderTrial, lib, cal, capex, { scenario: "low", lowerNode: true, spreadScale: 1, plan: contractPlan(lenderTrial, cal) });
    if (!physicalOk(opsL.reserveChecks)) continue;
    return C;
  }
  return 0;
}

/** One evaluated price of the p* scan (spec R3 §12). `supported` — the calculation completed and the investor NPV is
 *  defined; `funded` false marks a case short of cash (its NPV still stands, S1.3 §15). */
export interface PStarPoint {
  price: number;
  supported: boolean;
  npv: number | null;
  funded: boolean | null;
  debtEur: number | null;
  reason?: string;
}

export interface PStarBracket {
  /** The neighbouring grid prices and their NPVs. */
  lo: number;
  hi: number;
  npvLo: number;
  npvHi: number;
  /** The bracket's actual endpoints when the refinement stopped (for a converged root, width ≤ 0.001). */
  finalLo: number;
  finalHi: number;
  status: "converged" | "stagnated" | "iterationCap" | "unsupportedMidpoint" | "verificationFailed";
  iterations: number;
  /** The converged midpoint and its residual; null otherwise. */
  root: number | null;
  residual: number | null;
}

export interface PStarRoot {
  price: number;
  npv: number;
  funded: boolean;
  source: "grid" | "bisection";
  /** NPV of the fresh complete forward run at the root. */
  verifiedNpv: number;
}

export type PStarOutcome = "inputUnsupported" | "priceInsensitive" | "physicallyUnsupported" | "noSupportedCandidate" | "viableAtZero" | "found" |
  "refinementFailed" | "unresolvedPartialDomain" | "noCrossingInDomain";

export interface PStarSolution {
  outcome: PStarOutcome;
  /** The headline price: 0 for viableAtZero, the smallest verified root for found; null otherwise. */
  value: number | null;
  admissibility: "zeroPriceNotBid" | "admissible" | "aboveAuctionCap" | "notApplicable";
  fundedAtValue: boolean | null;
  coverage: "complete" | "partial" | null;
  /** For noCrossingInDomain: the common sign of every candidate. */
  sign: "allNegative" | "allPositive" | null;
  roots: PStarRoot[];
  brackets: PStarBracket[];
  candidates: PStarPoint[];
  capEur: number;
}

/** The p* solver (spec R3 §12, R2-05), independent of the model: a full grid, supported segments, grid roots counted
 *  once, bisection to |NPV| < €1 and a bracket ≤ 0.001 with a finite limit and a stagnation guard, never across an
 *  unsupported point, a fresh check of every root, and one economic outcome with a separate bid admissibility. */
export function solvePStar(evaluate: (p: number) => PStarPoint, capEur: number): PStarSolution {
  const [lo0, hi0] = RESERVE.pStarDomain;
  const tol = RESERVE.pStarResidualEur;
  const sign = (v: number) => (v >= 0 ? 1 : -1);
  const candidates: PStarPoint[] = [];
  for (let k = 0; lo0 + k * RESERVE.pStarStep <= hi0 + 1e-9; k++) candidates.push(evaluate(lo0 + k * RESERVE.pStarStep));
  // the whole grid was scanned: coverage is partial even when no point is supported (spec §12, R31-01)
  const none: PStarSolution = { outcome: "noSupportedCandidate", value: null, admissibility: "notApplicable", fundedAtValue: null, coverage: "partial", sign: null, roots: [], brackets: [], candidates, capEur };
  const ok = (p: PStarPoint) => p.supported && p.npv !== null;
  if (!candidates.some(ok)) return none;
  const coverage = candidates.every(ok) ? "complete" : "partial";
  const found: Omit<PStarRoot, "verifiedNpv">[] = [];
  const isRoot = candidates.map((p) => ok(p) && Math.abs(p.npv!) < tol);
  candidates.forEach((p, j) => { if (isRoot[j]) found.push({ price: p.price, npv: p.npv!, funded: p.funded ?? false, source: "grid" }); });
  const brackets: PStarBracket[] = [];
  for (let j = 1; j < candidates.length; j++) {
    const A = candidates[j - 1]!;
    const B = candidates[j]!;
    if (!ok(A) || !ok(B) || isRoot[j - 1] || isRoot[j] || A.npv! * B.npv! >= 0) continue;
    let a = A.price;
    let fa = A.npv!;
    let b = B.price;
    const br: PStarBracket = { lo: A.price, hi: B.price, npvLo: A.npv!, npvHi: B.npv!, finalLo: a, finalHi: b, status: "iterationCap", iterations: 0, root: null, residual: null };
    for (let it = 1; it <= RESERVE.pStarMaxBisections; it++) {
      br.iterations = it;
      const mid = (a + b) / 2;
      if (mid === a || mid === b) { br.status = "stagnated"; break; }
      const e = evaluate(mid);
      if (!ok(e)) { br.status = "unsupportedMidpoint"; break; }
      if (sign(e.npv!) === sign(fa)) { a = mid; fa = e.npv!; } else b = mid;
      br.finalLo = a;
      br.finalHi = b;
      if (Math.abs(e.npv!) < tol && b - a <= RESERVE.pStarBracket) {
        br.status = "converged";
        br.root = mid;
        br.residual = e.npv!;
        found.push({ price: mid, npv: e.npv!, funded: e.funded ?? false, source: "bisection" });
        break;
      }
    }
    brackets.push(br);
  }
  // a fresh complete forward run at every root; a root that does not hold is rejected
  const roots: PStarRoot[] = [];
  for (const r of found) {
    const v = evaluate(r.price);
    if (ok(v) && Math.abs(v.npv!) < tol) roots.push({ ...r, funded: v.funded ?? false, verifiedNpv: v.npv! });
    else {
      const br = brackets.find((x) => x.root === r.price);
      if (br) br.status = "verificationFailed";
    }
  }
  roots.sort((x, y) => x.price - y.price);
  const base = { coverage, roots, brackets, candidates, capEur, sign: null } as const;
  const zero = candidates[0]!;
  if (zero.price === 0 && ok(zero) && zero.funded && zero.npv! >= 0) {
    return { ...base, outcome: "viableAtZero", value: 0, admissibility: "zeroPriceNotBid", fundedAtValue: true };
  }
  if (roots.length) {
    const v = roots[0]!;
    const admissibility = v.price === 0 ? "zeroPriceNotBid" : v.price <= capEur + 1e-9 ? "admissible" : "aboveAuctionCap";
    return { ...base, outcome: "found", value: v.price, admissibility, fundedAtValue: v.funded };
  }
  const tail = { ...base, value: null, admissibility: "notApplicable", fundedAtValue: null } as const;
  if (brackets.some((x) => x.status !== "converged")) return { ...tail, outcome: "refinementFailed" };
  if (coverage === "partial") return { ...tail, outcome: "unresolvedPartialDomain" };
  return { ...tail, outcome: "noCrossingInDomain", sign: candidates.every((p) => p.npv! < 0) ? "allNegative" : "allPositive" };
}

/** A new battery duration with the award following it: an award still at the old duration's preset moves to the new
 *  one's (spec §3, V03); an award set by hand stays. */
export function withDuration(inp: BessInputs, durationH: BessInputs["durationH"]): BessInputs {
  if (inp.durationH === durationH) return inp;
  const c = inp.contract;
  const follow = c !== undefined && c.acceptedMW === CONTRACT_PRESET_MW[inp.durationH];
  return { ...inp, durationH, ...(follow && { contract: { ...c, acceptedMW: CONTRACT_PRESET_MW[durationH] } }) };
}

/** The contract template of p* (spec §12): the case's own contract without renewal, or the defaults with the
 *  duration's preset MW. Resolved once, before the scan. */
export function pStarTemplate(inp: BessInputs): ContractInputs {
  if (inp.contract?.enabled) return { ...inp.contract, renewal: false };
  return { ...CONTRACT_DEFAULTS, acceptedMW: CONTRACT_PRESET_MW[inp.durationH], renewal: false };
}

export interface ContractBreakEven extends PStarSolution {
  acceptedMW: number;
  /** Why the template stops the scan, for inputUnsupported / physicallyUnsupported. */
  templateReasons: string[];
}

/** Price of the contract at which the investor NPV at the hurdle is zero, with debt re-sized for every candidate (V07,
 *  spec R3 §12). The template's input domain, cancellation and physical screens do not depend on the price: they are
 *  settled once before the scan. */
export function contractBreakEven(inp: BessInputs, lib: Library): ContractBreakEven {
  const template = pStarTemplate(inp);
  const cal = buildCalendar(inp.codDelayMonths);
  const capEur = RESERVE.auctionCapUah / fxAuction(inp, cal, template);
  const head = { acceptedMW: template.acceptedMW, capEur };
  const stop = (outcome: PStarOutcome, templateReasons: string[]): ContractBreakEven => ({
    ...head, outcome, value: null, admissibility: "notApplicable", fundedAtValue: null, coverage: null, sign: null, roots: [], brackets: [], candidates: [], templateReasons,
  });
  const trial = { ...inp, contract: { ...template, enabled: true } };
  const issue = contractUnsupported(trial, cal, true);
  if (issue) return stop("inputUnsupported", [issue.code]);
  if (contractPlan(trial, cal).cancelled) return stop("priceInsensitive", ["contractCancelled"]);
  const probe = runBess(trial, lib, { diagnosticPrice: true });
  if (probe.status.primary === "physicallyUnsupported") return stop("physicallyUnsupported", probe.status.reasons);
  const evaluate = (p: number): PStarPoint => {
    const r = runBess({ ...inp, contract: { ...template, enabled: true, eurPerMWHour: p } }, lib, { diagnosticPrice: true });
    const sizing = r.checks.some((c) => c.id === "sizingConverged" && c.status === "fail");
    const npv = r.kpis.investorNpv?.value ?? null;
    const supported = r.status.primary === "ok" && !sizing && npv !== null;
    if (!supported) return { price: p, supported, npv: null, funded: null, debtEur: null, reason: sizing ? "sizingFailed" : npv === null ? "npvUndefined" : r.status.primary };
    return { price: p, supported, npv, funded: !r.checks.some((c) => c.id === "cashNonNegative" && c.status === "fail"), debtEur: r.funding.debtEur };
  };
  return { ...head, ...solvePStar(evaluate, capEur), templateReasons: [] };
}

function fxAuction(inp: BessInputs, cal: ReturnType<typeof buildCalendar>, c: ContractInputs): number {
  const m = cal.months[c.auctionMonthOffset]!;
  return fxMonth(m.year, m.month, inp.fxStress);
}
