// Quick look at a v1.1a contract case: checks, headline KPIs, the bridge and the buckets. Not an acceptance export.
// Usage: npx tsx scripts/bess/smoke-v11a.ts [mw] [price] [durationH]
import { readFileSync } from "node:fs";
import { BESS_BASE, contractBreakEven, contractCmax, parseLibrary, runBess, type LibraryManifest } from "../../src/bess/engine";
import { CONTRACT_DEFAULTS } from "../../src/bess/engine/registry";

const manifest = JSON.parse(readFileSync("public/bess/ua-library-v2.json", "utf-8")) as LibraryManifest;
const bin = readFileSync("public/bess/ua-library-v2.bin");
const lib = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const mw = Number(process.argv[2] ?? 40);
const price = Number(process.argv[3] ?? 17);
const dur = Number(process.argv[4] ?? 2) as 1 | 2 | 4;
const inp = { ...BESS_BASE, durationH: dur, contract: { ...CONTRACT_DEFAULTS, acceptedMW: mw, eurPerMWHour: price } };
const t0 = Date.now();
const r = runBess(inp, lib);
const ms = Date.now() - t0;
const k = (id: string) => r.kpis[id]?.value;
console.log({ ms, returnsMeaningful: r.returnsMeaningful, investorIrr: k("investorIrr"), investorNpv: k("investorNpv"), projectNpv: k("projectNpv"), debt: k("debtEur"), gearing: k("gearing"), minDscr: k("minDscr"), lcos: k("lcos") });
console.log("failed/warned checks:", r.checks.filter((c) => c.status === "fail").map((c) => `${c.id}=${c.value ?? ""} ${c.note ?? ""}`));
console.log("balanceSheet:", r.checks.find((c) => c.id === "balanceSheet"));
console.log("contract:", JSON.stringify({ ...r.contract, buckets: r.contract?.buckets.slice(0, 4) }, null, 1));
const base = runBess(BESS_BASE, lib);
console.log("v1 base:", { investorIrr: base.kpis.investorIrr!.value, investorNpv: base.kpis.investorNpv!.value, debt: base.funding.debtEur });
if (process.argv.includes("--cmax")) console.log("C_max:", contractCmax(inp, lib));
if (process.argv.includes("--pstar")) {
  const t1 = Date.now();
  const p = contractBreakEven(BESS_BASE, lib);
  console.log("p* (template from the DA base):", { ms: Date.now() - t1, outcome: p.outcome, value: p.value, admissibility: p.admissibility, fundedAtValue: p.fundedAtValue, coverage: p.coverage, capEur: p.capEur, roots: p.roots, brackets: p.brackets });
  console.log("candidates:", p.candidates.filter((c, i) => i % 5 === 0).map((c) => `${c.price}:${c.supported ? (c.funded ? "ok" : "unfunded") : c.reason}:${(c.npv ?? 0).toFixed(0)}`).join(" "));
}
