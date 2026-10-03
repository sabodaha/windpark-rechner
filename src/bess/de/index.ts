// The German pack (spec v1.2 R2): one case run — input domain, operations, the lender case and debt sizing, the ledger,
// KPIs and checks — plus the break-even toll price T* (shared solver of v1.1a, §9.2) and the merchant spread multiplier k
// (S1.3 §15). Ukrainian modules are untouched; the shared helpers are imported read-only.
import { xnpv, type DatedFlow } from "@/engine/finance";
import { deIrrMetric } from "./irr";
import { buildDeCalendar, type DeCalendar } from "./calendar";
import { buildDeCapex, type DeCapexBuild } from "./capex";
import { sizeDeDebt } from "./funding";
import { liquidityReserve, runDeLedger, type DeLedgerResult } from "./ledger";
import type { DeLibrary } from "./library";
import { effectiveFee, peakDayPurchases, runDeOperations, spreadM, type DeOpsResult } from "./operations";
import { DE_DURATION_PRESETS, DE_ENGINE, DE_REVENUE, idxDE } from "./registry";
import type { DeCheck, DeInputs, DeLockedFunding, DeMetric, DeStatus } from "./types";

export interface DeRunOptions {
  /** Locked funding of another case (stresses, tornado); otherwise sized on the lender case. */
  funding?: DeLockedFunding;
  /** Lower usable-hours node for the whole case (the lender-case convention as a full case, D14). */
  lowerNode?: boolean;
}

/** What the acceptance checks need to derive fees and reserve targets (schema `market`, R2.2 M02). */
export interface DeMarketBasis {
  lbarEur: number;
  nSnap: number;
  peakDayPurchasesEur: number;
  iMaxMWh: number;
  liquidityTargetCodEur: number;
  liquidityTargetPostTollEur: number | null;
}

export interface DeResult {
  market?: DeMarketBasis;
  inputs: DeInputs;
  status: DeStatus;
  checks: DeCheck[];
  cal: DeCalendar | null;
  capex: DeCapexBuild | null;
  ops: DeOpsResult | null;
  ledger: DeLedgerResult | null;
  lender: { ops: DeOpsResult; ledger: DeLedgerResult } | null;
  funding: DeLockedFunding | null;
  kpis: Record<string, DeMetric> | null;
}

const INPUT = new Set(["notSupportedDuration", "merchantDebtUnsupported", "inputOutOfDomain", "libraryFeeAxis"]);
const INTEGRITY = new Set(["sourcesUses", "drawsEqualDebt", "balanceSheet", "bucketsReconcile", "taxReconcile", "sharesSumToOne", "tollFeeWithinContract", "fundingConverged", "gearingCap"]);

function statusOf(checks: DeCheck[]): DeStatus {
  const failed = checks.filter((c) => c.status === "fail");
  const inputFail = failed.filter((c) => INPUT.has(c.id));
  const integFail = failed.filter((c) => INTEGRITY.has(c.id));
  const deciding = inputFail.length ? inputFail : integFail;
  return {
    primary: inputFail.length ? "inputUnsupported" : integFail.length ? "calcError" : "ok",
    reasons: [...new Set(deciding.map((c) => (c.id === "libraryFeeAxis" ? "unsupportedLibraryInput" : c.id)))].sort(),
  };
}

const check = (id: string, ok: boolean | null, value?: number | string | null, warnOnly = false): DeCheck => ({
  id,
  group: INPUT.has(id) ? "input" : INTEGRITY.has(id) ? "integrity" : "scope",
  status: ok === null ? "notApplicable" : ok ? "pass" : warnOnly ? "warn" : "fail",
  value: value ?? null,
});

const ALL_CHECKS = [
  "notSupportedDuration", "merchantDebtUnsupported", "inputOutOfDomain", "libraryFeeAxis",
  "sourcesUses", "drawsEqualDebt", "balanceSheet", "bucketsReconcile", "taxReconcile", "sharesSumToOne", "tollFeeWithinContract", "fundingConverged", "gearingCap",
  "cashNonNegative", "debtRepaid", "dsraFunded", "interestBarrier", "grandfatheringLost", "distributionCapped", "lockup", "default",
];

/** One entry per check id (semantics S1): the checks not evaluated in an early exit are `notApplicable`. */
function complete(checks: DeCheck[]): DeCheck[] {
  const have = new Set(checks.map((c) => c.id));
  return [...checks, ...ALL_CHECKS.filter((id) => !have.has(id)).map((id) => check(id, null))];
}

/** The input domain of fixtures/de-cases.json (resolver.domain). */
export function deInputChecks(inp: DeInputs): DeCheck[] {
  const dom =
    [0.85, 0.88, 0.9].some((v) => Math.abs(v - inp.rte) < 1e-12) && [1, 1.5].includes(inp.cycleCap) &&
    (inp.snapshot === "DE-2025" || inp.snapshot === "DE-LTM-2026-09") && ["reference", "low", "high"].includes(inp.spreadPath) &&
    Number.isInteger(inp.codDelayMonths) && inp.codDelayMonths >= 0 && inp.codDelayMonths <= 24 && (inp.repaymentCount === 20 || inp.repaymentCount === 30) &&
    inp.tollShare >= 0 && inp.tollShare <= 1 && Number.isInteger(inp.tollMonths) && inp.tollMonths >= 1 && inp.tollMonths <= 180 &&
    (inp.durationHours === 1 || inp.durationHours === 2 || inp.durationHours === 4);
  return [
    check("notSupportedDuration", inp.durationHours !== 1),
    check("merchantDebtUnsupported", !(inp.debt && (!inp.tollEnabled || inp.tollShare <= 0))),
    check("inputOutOfDomain", dom),
  ];
}

/** M, a and the effective fee of a year on a path (spec §2.2–§2.3). */
function feeOf(inp: DeInputs, lib: DeLibrary, path: DeInputs["spreadPath"], year: number) {
  const M = spreadM(inp, path, year);
  return { M, ...effectiveFee(inp, lib.manifest.snapshots[inp.snapshot].avgPriceEUR, M, year) };
}

export function runDe(inp: DeInputs, lib: DeLibrary, opts: DeRunOptions = {}): DeResult {
  const checks: DeCheck[] = deInputChecks(inp);
  const empty = { cal: null, capex: null, ops: null, ledger: null, lender: null, funding: null, kpis: null };
  if (checks.some((c) => c.status === "fail")) return { inputs: inp, status: statusOf(checks), checks: complete(checks), ...empty };
  const toll = inp.tollEnabled && inp.tollShare > 0;
  const cal = buildDeCalendar(inp.codDelayMonths, inp.repaymentCount, toll ? inp.tollMonths : null, inp.grandfathered);
  const capex = buildDeCapex(inp);
  const ops = runDeOperations(inp, lib, cal, capex, { lowerNode: opts.lowerNode });
  const sized = inp.debt && !opts.funding;
  const opsLender = sized ? runDeOperations(inp, lib, cal, capex, { spreadPath: "low", lowerNode: true }) : null;
  const libFail = ops.unsupported ?? opsLender?.unsupported ?? null;
  checks.push(check("libraryFeeAxis", libFail === null, libFail));
  if (libFail) return { inputs: inp, status: statusOf(checks), checks: complete(checks), cal, capex, ops, ledger: null, lender: null, funding: null, kpis: null };

  // liquidity reserve (spec §7.1): at the contractual COD with 2028 values and s = tollShare; after the toll with that
  // month's year and s = 0
  const peak = peakDayPurchases(inp, lib);
  const yCod = cal.months[cal.plannedCodIndex]!.year;
  const f0 = feeOf(inp, lib, inp.spreadPath, yCod);
  const liq = liquidityReserve(inp, peak, f0.M, f0.a, idxDE(yCod), toll ? inp.tollShare : 0);
  let postToll: number | null = null;
  if (cal.tollLast !== null && cal.tollLast + 1 < cal.months.length) {
    const y = cal.months[cal.tollLast + 1]!.year;
    const f1 = feeOf(inp, lib, inp.spreadPath, y);
    postToll = liquidityReserve(inp, peak, f1.M, f1.a, idxDE(y), 0);
  }
  const workingCapital = toll ? (inp.tollShare * inp.powerMW * inp.tollPrice) / 12 : 0;
  const ledgerOpt = { postTollLiquidityEur: postToll, projectReserveEur: liq, workingCapitalEur: workingCapital };

  let funding: DeLockedFunding;
  let lender: DeResult["lender"] = null;
  if (!inp.debt) funding = { debtEur: 0, principalEur: new Array(cal.periods.length).fill(0), dsraInitialEur: 0, liquidityReserveEur: liq, sizingStatus: "noDebt", iterations: 0 };
  else if (opts.funding) funding = opts.funding;
  else {
    // the lender case is the case on path low (§7.3), so its liquidity reserve — part of its uses — follows path low too;
    // the case itself then funds its own reserve with the sized loan (D14, the lender case as a full case, gives the same loan)
    const fl = feeOf(inp, lib, "low", yCod);
    const liqLender = liquidityReserve(inp, peak, fl.M, fl.a, idxDE(yCod), toll ? inp.tollShare : 0);
    let postTollLender: number | null = null;
    if (postToll !== null) {
      const y = cal.months[cal.tollLast! + 1]!.year;
      const fl1 = feeOf(inp, lib, "low", y);
      postTollLender = liquidityReserve(inp, peak, fl1.M, fl1.a, idxDE(y), 0);
    }
    const s = sizeDeDebt(inp, opsLender!, capex, cal, liqLender, { postTollLiquidityEur: postTollLender, projectReserveEur: liqLender, workingCapitalEur: workingCapital });
    funding = { ...s.funding, liquidityReserveEur: liq };
    lender = { ops: opsLender!, ledger: s.ledger };
  }
  const led = runDeLedger(inp, ops, capex, cal, funding, ledgerOpt);
  const fc = cal.fcDay;
  const deficit = led.minCashEur < -0.01;
  const end = led.months[led.months.length - 1]!;
  // settled: no loan or interest left at the end and no negative cash (spec R2.2 §8)
  const settled = end.debtCloseEur + end.interestPayableCloseEur <= 0.01 && end.cashCloseEur >= -0.01;
  const market: DeMarketBasis = {
    lbarEur: lib.manifest.snapshots[inp.snapshot].avgPriceEUR, nSnap: DE_REVENUE.tb2["DE-2025"] / DE_REVENUE.tb2[inp.snapshot],
    peakDayPurchasesEur: peak, iMaxMWh: (inp.cycleCap * inp.durationHours * inp.powerMW) / inp.rte,
    liquidityTargetCodEur: funding.liquidityReserveEur, liquidityTargetPostTollEur: postToll,
  };

  // checks (spec §14; semantics S2)
  const D = funding.debtEur;
  checks.push(
    check("sourcesUses", led.maxSourcesUsesErrorEur <= 0.01, led.maxSourcesUsesErrorEur),
    check("drawsEqualDebt", Math.abs(led.drawsEur - D) <= 0.01, led.drawsEur - D),
    check("balanceSheet", led.maxBalanceErrorEur <= 0.01, led.maxBalanceErrorEur),
    check("bucketsReconcile", led.months.every((m) => Math.abs(m.bucketCEur + m.bucketMEur - m.cfadsEur) <= 0.01)),
    check("taxReconcile", led.maxTaxRollErrorEur <= 0.01 && led.years.every((y) => y.gewPoolCloseEur >= -0.01 && y.kstPoolCloseEur >= -0.01), led.maxTaxRollErrorEur),
    check("sharesSumToOne", ops.months.every((m) => m.s >= 0 && m.s <= 1)),
    check("tollFeeWithinContract", ops.maxTollFeeRatio <= 1 + 1e-12, ops.maxTollFeeRatio),
    check("fundingConverged", funding.sizingStatus !== "failed", funding.iterations),
    check("gearingCap", D <= inp.maxGearing * led.usesExVatEur + 0.01, led.usesExVatEur > 0 ? D / led.usesExVatEur : null),
    check("cashNonNegative", !deficit, led.minCashEur),
    check("debtRepaid", D > 0 ? led.debtAfterMaturityEur <= 0.01 : null, led.debtAfterMaturityEur),
    check("dsraFunded", D > 0 ? !led.dsraShort : null),
    check("interestBarrier", led.years.every((y) => y.interestBarrierPass), Math.max(...led.years.map((y) => y.netInterestEur)), true),
    check("grandfatheringLost", inp.grandfathered ? cal.grandfatheringApplied : null, null, true),
    check("distributionCapped", !led.distributions.some((d) => d.cappedBy === "section30" && d.paidEur < d.freeCashEur - 0.01), null, true),
    check("lockup", D > 0 ? !led.distributions.some((d) => d.cappedBy === "lockup") : null, null, true),
    check("default", D > 0 ? led.periods.every((p) => p.dscr === null || p.dscr >= inp.defaultDscr) : null, Math.min(...led.periods.map((p) => p.dscr ?? Infinity))),
  );

  // KPIs (spec §9.1)
  const flows: DatedFlow[] = led.investorFlows.map((f) => ({ day: f.day, amount: f.amount }));
  const investorIrr = deIrrMetric(flows, !deficit && settled);
  const investorNpv = xnpv(inp.equityHurdle, flows, fc);
  const investorNpvComparison = xnpv(inp.comparisonRate, flows, fc);
  const projectPre = deIrrMetric(led.projectPreTax);
  const projectPost = deIrrMetric(led.projectPostTax);
  const projectNpv = xnpv(inp.projectDiscountRate, led.projectPostTax, fc);
  const serviced = (p: { debtServiceEur: number }) => D > 0 && p.debtServiceEur > DE_ENGINE.absToleranceMoney;
  const withDs = led.periods.filter(serviced);
  const minDscr = withDs.length ? Math.min(...withDs.map((p) => p.cfadsEur / p.debtServiceEur)) : null;
  const avgDscr = withDs.length ? withDs.reduce((s, p) => s + p.cfadsEur, 0) / withDs.reduce((s, p) => s + p.debtServiceEur, 0) : null;
  const lenderDs = (lender?.ledger.periods ?? []).filter(serviced);
  const lenderMin = lenderDs.length ? Math.min(...lenderDs.map((p) => p.cfadsEur / p.debtServiceEur)) : null;
  const contractualCod = cal.months[cal.plannedCodIndex]!.start;
  const maturityDay = cal.periods.length ? cal.periods[cal.periods.length - 1]!.day : contractualCod;
  const llcr = D > 0 ? xnpv(inp.interestRate, led.cfadsMonthly.filter((f) => f.day <= maturityDay), contractualCod) / D : null;
  // LCOS: the whole battery as merchant on the chosen path, the toll ignored (spec §9.1, K18)
  const opsL = runDeOperations(inp, lib, cal, capex, { ignoreToll: true, lowerNode: opts.lowerNode });
  const costFlows: DatedFlow[] = [];
  const mwhFlows: DatedFlow[] = [];
  for (const o of opsL.months) {
    const day = cal.months[o.index]!.last;
    const cost = o.purchasesEur + o.optimiserFeeEur + o.opexTotalEur + o.augmentationEur + o.pcsOverhaulEur + o.decommissioningEur;
    if (cost !== 0) costFlows.push({ day, amount: cost });
    if (o.marketDischargeMWh > 0) mwhFlows.push({ day, amount: o.marketDischargeMWh });
  }
  for (const line of capex.lines) line.profile.forEach((w, i) => w !== 0 && costFlows.push({ day: cal.months[i]!.last, amount: line.amount * w }));
  const pvMwh = xnpv(inp.projectDiscountRate, mwhFlows, fc);
  const lcos = pvMwh > 0 ? xnpv(inp.projectDiscountRate, costFlows, fc) / pvMwh : null;
  const rev2029 = led.years.find((y) => y.year === 2029)?.revenueEur ?? null;
  let cum = 0;
  let payback: number | null = null;
  for (const f of [...flows].sort((a, b) => a.day - b.day)) {
    cum += f.amount;
    if (payback === null && cum >= 0 && f.amount > 0) payback = (f.day - fc) / 365;
  }
  const metric = (v: number | null): DeMetric => ({ value: v, status: v === null ? "notApplicable" : "valid" });
  const kpis: Record<string, DeMetric> = {
    investorIrr, investorNpvEur: metric(investorNpv), investorNpvComparisonEur: metric(investorNpvComparison),
    projectIrrPreTax: projectPre, projectIrrPostTax: projectPost, projectNpvPostTaxEur: metric(projectNpv),
    dscrMin: metric(minDscr), dscrAvg: metric(avgDscr), lenderDscrMin: metric(lenderMin), llcr: metric(llcr),
    debtEur: metric(D > 0 ? D : null), gearing: metric(D > 0 ? D / led.usesExVatEur : null), lcosEurPerMWh: metric(lcos),
    revenue2029PerMwEur: metric(rev2029 === null ? null : rev2029 / inp.powerMW), paybackYears: metric(payback),
    liquidationPayoutEur: metric(led.liquidationPayoutEur),
  };
  return { market, inputs: inp, status: statusOf(checks), checks, cal, capex, ops, ledger: led, lender, funding, kpis };
}

/** A delay to commercial operation is a stress after financial close (spec §18, case B03): the loan stays the one
 *  sized on the contractual timing. For a delayed case with a loan, that locked funding; otherwise undefined (the case
 *  sizes its own loan). Sizing a delayed case on its own lender case would shrink the loan to nothing for delays of a
 *  few months, because the lender's first half-years lose their cash. */
export function contractualFunding(inp: DeInputs, lib: DeLibrary): DeLockedFunding | undefined {
  if (!inp.debt || inp.codDelayMonths === 0) return undefined;
  const f = runDe({ ...inp, codDelayMonths: 0 }, lib).funding;
  return f && f.sizingStatus === "converged" && f.debtEur > 0 ? f : undefined;
}

/** Applies a duration and its presets (de-cases.json durationPresets) unless the caller overrides them. */
export function withDeDuration(inp: DeInputs, durationHours: number): DeInputs {
  const p = DE_DURATION_PRESETS[durationHours as 2 | 4] ?? {};
  return { ...inp, ...p, durationHours };
}

// ---------------------------------------------------------------------------------------------------------------------
// T* — the break-even toll price (spec §9.2): the shared solver of v1.1a with German parameters

export interface TStarCandidate { price: number; supported: boolean; funded: boolean; npv: number | null }
export interface TStarRoot { price: number; kind: "grid" | "bisection"; verifiedNpv: number; funded: boolean }
export interface TStarBracket { lo: number; hi: number; finalLo: number; finalHi: number; status: string; divisions: number; root?: number }
export interface TStarResult {
  outcome: "found" | "belowDomain" | "aboveDomain" | "unresolvedPartialDomain" | "refinementFailed" | "unsupported";
  value: number | null;
  coverage: "complete" | "partial" | null;
  candidates: TStarCandidate[];
  roots: TStarRoot[];
  brackets: TStarBracket[];
}

/** `fresh` marks the verification run of a root: it bypasses any cache (spec §9.2 step 5). */
export type NpvAt = (price: number, fresh: boolean) => { supported: boolean; funded: boolean; npv: number | null };

export function tStarSolve(npvAt: NpvAt): TStarResult {
  const g = DE_ENGINE.tStarGrid;
  const cands: TStarCandidate[] = [];
  for (let t = g.from; t <= g.to; t += g.step) {
    const r = npvAt(t, false);
    cands.push({ price: t, supported: r.supported, funded: r.funded, npv: r.supported ? r.npv : null });
  }
  const roots: TStarRoot[] = [];
  const brackets: TStarBracket[] = [];
  const gridRoot = cands.map((c) => c.supported && Math.abs(c.npv!) < 1);
  cands.forEach((c, i) => {
    if (!gridRoot[i]) return;
    const v = npvAt(c.price, true);
    if (v.supported && Math.abs(v.npv!) < 1) roots.push({ price: c.price, kind: "grid", verifiedNpv: v.npv!, funded: v.funded });
    // a rejected grid root is recorded as a zero-width bracket (spec R2.1 §9.2, N04)
    else brackets.push({ lo: c.price, hi: c.price, finalLo: c.price, finalHi: c.price, status: "verificationFailed", divisions: 0 });
  });
  for (let i = 0; i + 1 < cands.length; i++) {
    const A = cands[i]!, B = cands[i + 1]!;
    if (!A.supported || !B.supported || gridRoot[i] || gridRoot[i + 1] || A.npv! * B.npv! >= 0) continue;
    let a = A.price, b = B.price, fa = A.npv!;
    let status = "iterationCap", root: number | undefined, it = 0;
    for (it = 1; it <= DE_ENGINE.tStarMaxDivisions; it++) {
      const mid = (a + b) / 2;
      if (mid === a || mid === b) { status = "stagnated"; break; }
      const r = npvAt(mid, false);
      if (!r.supported) { status = "unsupportedMidpoint"; break; }
      const fm = r.npv!;
      if ((fm >= 0) === (fa >= 0)) { a = mid; fa = fm; } else b = mid;
      if (Math.abs(fm) < 1 && b - a <= 1) { status = "converged"; root = mid; break; }
    }
    if (it > DE_ENGINE.tStarMaxDivisions) it = DE_ENGINE.tStarMaxDivisions;
    const rec: TStarBracket = { lo: A.price, hi: B.price, finalLo: a, finalHi: b, status, divisions: it };
    if (status === "converged") {
      const v = npvAt(root!, true);
      if (v.supported && Math.abs(v.npv!) < 1) {
        roots.push({ price: root!, kind: "bisection", verifiedNpv: v.npv!, funded: v.funded });
        rec.root = root;
      } else rec.status = "verificationFailed";
    }
    brackets.push(rec);
  }
  roots.sort((x, y) => x.price - y.price);
  const coverage = cands.every((c) => c.supported) ? "complete" : "partial";
  const c0 = cands[0]!;
  let outcome: TStarResult["outcome"];
  if (!cands.some((c) => c.supported)) outcome = "unsupported";
  else if (c0.supported && c0.funded && c0.npv! >= 0) outcome = "belowDomain";
  else if (roots.length) outcome = "found";
  else if (brackets.some((b) => b.status !== "converged")) outcome = "refinementFailed";
  else if (coverage === "partial") outcome = "unresolvedPartialDomain";
  else if (cands.every((c) => c.npv! < 0)) outcome = "aboveDomain";
  else outcome = "belowDomain";
  return { outcome, value: outcome === "found" ? roots[0]!.price : null, coverage, candidates: cands, roots, brackets };
}

export function tStarOfCase(inp: DeInputs, lib: DeLibrary): TStarResult {
  const dom = deInputChecks(inp);
  if (dom.some((c) => c.status === "fail") || !(inp.tollEnabled && inp.tollShare > 0)) {
    return { outcome: "unsupported", value: null, coverage: null, candidates: [], roots: [], brackets: [] };
  }
  const cache = new Map<number, ReturnType<NpvAt>>();
  return tStarSolve((price, fresh) => {
    const hit = fresh ? undefined : cache.get(price);
    if (hit) return hit;
    const r = runDe({ ...inp, tollPrice: price }, lib);
    const supported = r.status.primary === "ok" && r.funding?.sizingStatus !== "failed";
    const out = { supported, funded: r.checks.find((c) => c.id === "cashNonNegative")?.status !== "fail", npv: r.kpis?.investorNpvEur?.value ?? null };
    if (!fresh) cache.set(price, out);
    return out;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// k — the merchant spread multiplier at NPV 0 (spec §9.2, the S1.3 rule `breakEvenSpread`)

export interface KCandidate { k: number; supported: boolean; npv: number | null }
export interface KBracket { lo: number; hi: number; finalLo: number; finalHi: number; steps: number; stop: "width" | "unsupportedMidpoint" | "steps" }
export interface KResult {
  status: "found" | "notReached" | "unsupportedBelow" | "unsupported";
  value: number | null;
  supportedFrom: number | null;
  /** The scan (26 points) and the refined bracket: the evidence from which the status follows (R2.2 M03). */
  candidates: KCandidate[];
  bracket: KBracket | null;
}

export function kSolve(npvAt: (k: number) => number | null): KResult {
  const [lo0] = DE_ENGINE.kDomain;
  const pts: [number, number][] = [];
  const candidates: KCandidate[] = [];
  let supportedFrom: number | null = null;
  for (let i = 0; i <= 25; i++) {
    const k = lo0 + 0.1 * i;
    const v = npvAt(k);
    candidates.push({ k, supported: v !== null, npv: v });
    if (v === null) continue;
    supportedFrom ??= k;
    pts.push([k, v]);
  }
  for (let j = 1; j < pts.length; j++) {
    let [a, fa] = pts[j - 1]!;
    let [b] = pts[j]!;
    if (fa * pts[j]![1] > 0) continue;
    const lo = a, hi = b;
    let steps = 0;
    let stop: KBracket["stop"] = "width";
    for (; steps < 40 && b - a > 1e-5; steps++) {
      const mid = (a + b) / 2;
      const fm = npvAt(mid);
      if (fm === null) { stop = "unsupportedMidpoint"; break; }
      if (fa * fm <= 0) b = mid;
      else { a = mid; fa = fm; }
    }
    if (stop === "width" && b - a > 1e-5) stop = "steps";
    return { status: "found", value: (a + b) / 2, supportedFrom, candidates, bracket: { lo, hi, finalLo: a, finalHi: b, steps, stop } };
  }
  if (supportedFrom === null) return { status: "unsupported", value: null, supportedFrom: null, candidates, bracket: null };
  const below = supportedFrom > lo0 + 1e-9 && pts[0]![1] > 0;
  return { status: below ? "unsupportedBelow" : "notReached", value: null, supportedFrom, candidates, bracket: null };
}

export function kOfCase(inp: DeInputs, lib: DeLibrary): KResult {
  return kSolve((k) => {
    const r = runDe({ ...inp, spreadMultiplierK: k }, lib);
    return r.status.primary === "ok" ? (r.kpis?.investorNpvEur?.value ?? null) : null;
  });
}

/** For tests: the effective fee of the base path in a year. */
export function deFeeOfYear(inp: DeInputs, lib: DeLibrary, year: number): number {
  return feeOf(inp, lib, inp.spreadPath, year).fee;
}

export { DE_REVENUE };
