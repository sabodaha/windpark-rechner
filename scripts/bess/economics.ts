// What drives the v1 result: the base case and one-lever variants, funding re-sized per variant (a pre-investment
// view), plus the 2029 per-MW bridge from perfect-foresight margin to CFADS. Usage:
//   npx tsx scripts/bess/economics.ts <library version> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { BESS_BASE, breakEvenSpread, parseLibrary, runBess, type BessInputs, type LibraryManifest } from "../../src/bess/engine";

const version = process.argv[2] ?? "2";
const manifest = JSON.parse(readFileSync(`public/bess/ua-library-v${version}.json`, "utf-8")) as LibraryManifest;
const bin = readFileSync(`public/bess/ua-library-v${version}.bin`);
const lib = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const variants: [string, Partial<BessInputs>][] = [
  ["base: 2 h, reference, DAM only", {}],
  ["4 h", { durationH: 4 }],
  ["1 h", { durationH: 1 }],
  ["scenario high", { scenario: "high" }],
  ["scenario low", { scenario: "low" }],
  ["snapshot last 12 months", { snapshot: "UA-LTM-2026-09" }],
  ["capture 0.85", { captureFactor: 0.85 }],
  ["war loss ratio 0.20 (EL 1.6 %)", { lossRatio: 0.2 }],
  ["no war risk (EL 0)", { lossRatio: 0 }],
  ["CAPEX −10 %", { capexFactor: 0.9 }],
  ["no debt", { debt: false }],
  ["terminal remittance blocked", { terminalRemittance: "blocked" }],
  ["4 h + high + capture 0.85 + EL 1.6 %", { durationH: 4, scenario: "high", captureFactor: 0.85, lossRatio: 0.2 }],
];

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)} %`);
const m = (v: number | null | undefined) => (v === null || v === undefined ? "—" : (v / 1e6).toFixed(2));
const rows: Record<string, unknown>[] = [];
for (const [name, patch] of variants) {
  const inp = { ...BESS_BASE, ...patch };
  const r = runBess(inp, lib);
  const be = breakEvenSpread(inp, lib, r.funding);
  const y29 = r.annual.find((a) => a.year === 2029)!;
  const k = r.kpis;
  rows.push({
    name, investorIrr: k.investorIrr!.value, irrStatus: k.investorIrr!.status, investorNpv: k.investorNpv!.value,
    projectIrrPostTax: k.projectIrrPostTax!.value, projectStatus: k.projectIrrPostTax!.status, debt: k.debtEur!.value,
    gearing: k.gearing!.value, lcos: k.lcos!.value, pf2029: k.pfMargin2029PerMW!.value, net2029: k.netRevenue2029PerMW!.value,
    ebitda2029PerMW: y29.ebitdaEur / inp.powerMW, capex: r.capexAllInEur, breakEven: be.value, breakEvenStatus: be.status,
    fails: r.checks.filter((c) => c.status === "fail").map((c) => c.id),
  });
  console.log(
    `${name.padEnd(40)} IRR ${pct(k.investorIrr!.value).padStart(8)} ${k.investorIrr!.status.padEnd(10)} NPV15 ${m(k.investorNpv!.value).padStart(7)} ` +
      `projIRR ${pct(k.projectIrrPostTax!.value).padStart(7)} debt ${m(k.debtEur!.value).padStart(5)} LCOS ${(k.lcos!.value ?? 0).toFixed(0).padStart(4)} ` +
      `PF29 ${((k.pfMargin2029PerMW!.value ?? 0) / 1e3).toFixed(0).padStart(4)}k net29 ${((k.netRevenue2029PerMW!.value ?? 0) / 1e3).toFixed(0).padStart(4)}k ` +
      `EBITDA29 ${(y29.ebitdaEur / inp.powerMW / 1e3).toFixed(0).padStart(4)}k k* ${be.value?.toFixed(2) ?? be.status}`,
  );
}
// 2029 bridge per MW for the base case
const base = runBess(BESS_BASE, lib);
const a = base.annual.find((x) => x.year === 2029)!;
const P = BESS_BASE.powerMW;
const bridge = {
  pfMargin: a.pfMarginEur / P,
  captureLoss: (a.capturedMarginEur - a.pfMarginEur) / P,
  optimiserFee: -a.optimiserFeeEur / P,
  opex: -a.opexEur / P,
  tariffs: -a.tariffsEur / P,
  warExpected: -a.warExpectedEur / P,
  ebitda: a.ebitdaEur / P,
  tax: -a.taxPaidEur / P,
  cfads: a.cfadsEur / P,
};
console.log("2029 bridge, € per MW:", Object.fromEntries(Object.entries(bridge).map(([k2, v]) => [k2, Math.round(v)])));
writeFileSync(process.argv[3] ?? "bess-economics.json", JSON.stringify({ libraryVersion: version, rows, bridge2029PerMW: bridge }, null, 1));
