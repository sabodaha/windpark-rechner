// Runs the BESS engine on the cases of the independent reference and writes their KPIs, statuses, IRR roots and dated
// audit series (project flows, equity, dividend vintages, remittance tail) for the acceptance comparison.
// Usage: npx tsx scripts/bess/run-cases.ts <out.json> [library version]
import { readFileSync, writeFileSync } from "node:fs";
import { toIso } from "../../src/engine/dates";
import { BESS_BASE, breakEvenSpread, parseLibrary, runBess, type BessInputs, type BessResult, type LibraryManifest, type LockedFunding } from "../../src/bess/engine";

const version = process.argv[3] ?? "2";
const manifest = JSON.parse(readFileSync(`public/bess/ua-library-v${version}.json`, "utf-8")) as LibraryManifest;
const bin = readFileSync(`public/bess/ua-library-v${version}.bin`);
const lib = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const dated = (rows: { day: number; amount: number }[]) => rows.map((r) => ({ date: toIso(r.day), eur: r.amount }));

const summary = (r: BessResult) => ({
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

const t0 = Date.now();
const opt = { detail: true };
const base = runBess(BESS_BASE, lib, opt);
const locked = { ...opt, funding: base.funding };
/** A case with its break-even multiplier on the funding it runs with (locked for the post-close stresses). */
const run = (inputs: BessInputs, opts: { detail: boolean; funding?: LockedFunding }) => {
  const r = runBess(inputs, lib, opts);
  return { ...summary(r), breakEven: breakEvenSpread(inputs, lib, opts.funding ?? r.funding) };
};
const out = {
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
  ms: Date.now() - t0,
};
writeFileSync(process.argv[2] ?? "bess-cases.json", JSON.stringify(out, null, 1));
const k = out.base.kpis as Record<string, number | null>;
console.log({ investorIrr: k.investorIrr, investorNpv: k.investorNpv, debt: k.debtEur, minDscr: k.minDscr, lenderMinDscr: k.lenderMinDscr, lcos: k.lcos, net2029: k.netRevenue2029PerMW, breakEven: out.base.breakEven.value, ms: out.ms });
