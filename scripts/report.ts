// Prints the base case, scenarios, checks, tornado and bid calculator. Optional: --json <path>
// writes the full base-case result (used by the independent spreadsheet reconciliation).
import { writeFileSync } from "node:fs";
import { BASE_CASE, runScenarios, solveAwardPrice, tornado } from "../src/engine";
import type { ModelResult } from "../src/engine";

const pct = (v: number | null, d = 2) => (v === null ? "n/a" : `${(v * 100).toFixed(d)} %`);
const num = (v: number | null, d = 2) => (v === null ? "n/a" : v.toFixed(d));
const meur = (v: number) => `${(v / 1e6).toFixed(2)} m€`;

const t0 = performance.now();
const s = runScenarios(BASE_CASE);
const t1 = performance.now();
const base = s.base;
const k = base.kpis;

console.log(`Windpark Musterhöhe — base case  (3 scenarios in ${(t1 - t0).toFixed(1)} ms)`);
console.log(`Timeline: FC ${base.timeline.financialClose} · COD ${base.timeline.cod} · EEG end ${base.timeline.eegEnd} · loan ${base.timeline.loanMaturity} · end ${base.timeline.endOfLife}`);
console.log(`Capacity ${k.capacityMw} MW · P50 ${k.fullLoadHoursP50.toFixed(0)} h · KF ${num(k.correctionFactor, 3)} · AW ${num(k.awCt)} ct/kWh`);
console.log(`Capex ${meur(k.capex)} (${k.capexPerKw.toFixed(0)} €/kW) · uses ${meur(k.totalUses)} · debt ${meur(k.debt)} (${pct(k.gearing, 1)}) · equity ${meur(k.equity)}`);
console.log(`Debt sizing: binding ${base.sizing.binding} · lender case (${base.sizing.bankPriceBasis}) min DSCR P50 ${num(base.sizing.minBankDscrP50, 3)} · P90 ${num(base.sizing.minBankDscrP90, 3)}`);
console.log("");
const row = (name: string, r: ModelResult) =>
  console.log(
    `${name.padEnd(9)} equity IRR ${pct(r.kpis.equityIrr).padStart(9)} · project IRR post-tax ${pct(r.kpis.projectIrrPostTax).padStart(9)}` +
      ` · min DSCR ${num(r.kpis.minDscr).padStart(5)} · NPV equity ${meur(r.kpis.npvEquity).padStart(10)}` +
      ` · errors ${r.checks.filter((c) => !c.ok && c.severity === "error").map((c) => c.id).join(",") || "none"}`,
  );
row("Base", base);
row("P90", s.p90);
row("Downside", s.downside);
console.log(`LCOE ${num(k.lcoeRealCt)} ct/kWh real 2026 · ${num(k.lcoeNominalCt)} ct/kWh nominal · LLCR ${num(k.llcr)} · payback ${num(k.paybackYears, 1)} yrs · pre-tax project IRR ${pct(k.projectIrrPreTax)}`);
console.log("");
console.log("Checks (base):");
for (const c of base.checks) console.log(`  ${c.ok ? "ok  " : c.severity === "error" ? "FAIL" : "WARN"} ${c.id.padEnd(20)} ${String(typeof c.value === "number" ? num(c.value, 4) : c.value).padEnd(14)} ${c.detail}`);
console.log("");
console.log("Year  energy GWh  JW €/MWh  premium  revenue  opex  EBITDA  taxes  CFADS  debt svc  DSCR  distrib");
for (const a of base.annual) {
  console.log(
    `${a.year}  ${(a.energyKwh / 1e6).toFixed(1).padStart(9)}  ${(a.marketValueEurKwh * 1000).toFixed(1).padStart(8)}  ${(a.revenuePremium / 1e6).toFixed(2).padStart(7)}` +
      `  ${(a.revenue / 1e6).toFixed(2).padStart(7)}  ${(a.opex / 1e6).toFixed(2).padStart(4)}  ${(a.ebitda / 1e6).toFixed(2).padStart(6)}  ${(a.taxes / 1e6).toFixed(2).padStart(5)}` +
      `  ${(a.cfads / 1e6).toFixed(2).padStart(5)}  ${(a.debtService / 1e6).toFixed(2).padStart(8)}  ${a.dscr === null ? "  -  " : a.dscr.toFixed(2).padStart(5)}  ${(a.distribution / 1e6).toFixed(2).padStart(7)}`,
  );
}
console.log("");
const t2 = performance.now();
const bars = tornado(BASE_CASE, "equityIrr");
const t3 = performance.now();
console.log(`Tornado, equity IRR (${(t3 - t2).toFixed(0)} ms for ${bars.length * 2 + 1} runs):`);
for (const b of bars) console.log(`  ${b.id.padEnd(15)} ${b.lowLabel.padStart(9)} → ${pct(b.low).padStart(9)}   ${b.highLabel.padStart(9)} → ${pct(b.high).padStart(9)}`);
const t4 = performance.now();
const bid = solveAwardPrice(BASE_CASE, 0.08);
const t5 = performance.now();
console.log("");
console.log(`Bid calculator: 8 % equity IRR needs ${num(bid.awardPriceCt, 3)} ct/kWh (AW ${num(bid.awCt, 2)} ct) — ${(t5 - t4).toFixed(0)} ms`);

const jsonAt = process.argv.indexOf("--json");
if (jsonAt > 0 && process.argv[jsonAt + 1]) {
  writeFileSync(process.argv[jsonAt + 1]!, JSON.stringify({ inputs: BASE_CASE, base, p90: s.p90, downside: s.downside, bid }, null, 2));
  console.log(`\nJSON written to ${process.argv[jsonAt + 1]}`);
}
