// The nine acceptance cases of the BESS engine (model-spec §18): the base, its variants and stresses, and the lender's
// case as a full case. Shared by the acceptance export (run-cases.ts) and the released-v1 regression gate
// (test/bess-regression.test.ts, spec v1.1 §14 gate 1).
import { toIso } from "../../src/engine/dates";
import { BESS_BASE, breakEvenSpread, runBess, type BessInputs, type BessResult, type Library, type LockedFunding } from "../../src/bess/engine";

const dated = (rows: { day: number; amount: number }[]) => rows.map((r) => ({ date: toIso(r.day), eur: r.amount }));

export const summary = (r: BessResult) => ({
  kpis: Object.fromEntries(Object.entries(r.kpis).map(([k, m]) => [k, m.value])),
  kpiStatus: Object.fromEntries(Object.entries(r.kpis).map(([k, m]) => [k, m.status])),
  irrRoots: { investorIrr: r.kpis.investorIrr!.roots, projectIrrPreTax: r.kpis.projectIrrPreTax!.roots, projectIrrPostTax: r.kpis.projectIrrPostTax!.roots },
  irrStatus: r.kpis.investorIrr!.status,
  funding: r.funding,
  periods: r.periods.map((p) => ({ date: toIso(p.day), cfads: p.cfadsEur, ds: p.debtServiceEur, dscr: p.dscr })),
  lenderPeriods: r.lenderPeriods,
  annual: r.annual,
  checks: r.checks.filter((c) => c.status !== "pass"),
  /** Every check with its status, passes included: the evidence behind "no check failed". */
  allChecks: r.checks,
  investorFlows: dated(r.investorFlows),
  projectPreTax: dated(r.detail!.projectPreTax),
  projectPostTax: dated(r.detail!.projectPostTax),
  equityByMonth: dated(r.detail!.equityByMonth),
  dividendAllocations: r.detail!.dividendAllocations.map((a) => ({ date: toIso(a.day), grossUah: a.grossUah, byYear: a.byYear })),
  remittanceTail: r.detail!.remittanceTail.map((t) => ({ date: toIso(t.day), netEur: t.netEur, leftUah: t.leftUah })),
});

/** Runs the nine cases with their break-even multipliers; the post-close stresses keep the base funding. */
export function acceptanceCases(lib: Library) {
  const opt = { detail: true };
  const base = runBess(BESS_BASE, lib, opt);
  const locked = { ...opt, funding: base.funding };
  /** A case with its break-even multiplier on the funding it runs with (locked for the post-close stresses). */
  const run = (inputs: BessInputs, opts: { detail: boolean; funding?: LockedFunding }) => {
    const r = runBess(inputs, lib, opts);
    return { ...summary(r), breakEven: breakEvenSpread(inputs, lib, opts.funding ?? r.funding) };
  };
  return {
    base: run(BESS_BASE, opt),
    noDebt: run({ ...BESS_BASE, debt: false }, opt),
    cohortLoss: run({ ...BESS_BASE, codDelayMonths: 3 }, locked),
    insurance: run({ ...BESS_BASE, insurance: true, coverAvailable: true, stateBudgetAvailable: true }, locked),
    ltm: run({ ...BESS_BASE, snapshot: "UA-LTM-2026-09" }, locked),
    fourHours: run({ ...BESS_BASE, durationH: 4 }, opt),
    terminalBlocked: run({ ...BESS_BASE, terminalRemittance: "blocked" }, locked),
    high: run({ ...BESS_BASE, scenario: "high" }, locked),
    // the lender's case as a full case: low path, lower library node, the base funding
    lender: (() => {
      const inputs = { ...BESS_BASE, scenario: "low" as const };
      const r = runBess(inputs, lib, { ...locked, lowerNode: true });
      return { ...summary(r), breakEven: breakEvenSpread(inputs, lib, base.funding, { lowerNode: true }) };
    })(),
  };
}
