// Prints the base case, scenarios, checks, tornado and bid calculator. Optional: --json <path>
// writes the full base-case result.
import { writeFileSync } from "node:fs";
import { BASE_CASE, runScenarios, SCENARIOS, solveAwardPrice, tornado } from "../src/engine";
import type { ModelResult } from "../src/engine";

const pct = (v: number | null, d = 2) => (v === null ? "n/a" : `${(v * 100).toFixed(d)} %`);
const num = (v: number | null, d = 2) => (v === null ? "n/a" : v.toFixed(d));
const meur = (v: number) => `${(v / 1e6).toFixed(2)} m€`;

const t0 = performance.now();
const s = runScenarios(BASE_CASE);
const t1 = performance.now();
const base = s.base;
const k = base.kpis;
const tl = base.timeline;

console.log(`Windpark Musterhöhe — base case  (${SCENARIOS.length} scenarios in ${(t1 - t0).toFixed(1)} ms)`);
console.log(`Timeline: FC ${tl.financialClose} · COD ${tl.cod} · EEG end ${tl.eegEnd} · loan ${tl.loanMaturity} · end ${tl.endOfLife}`);
console.log(`Loan: grace ends ${tl.graceEnd} · first instalment ${tl.firstInstalment} · award ${tl.awardNotice} (lapses ${tl.awardLapse})`);
console.log(`Capacity ${k.capacityMw} MW · P50 ${k.fullLoadHoursP50.toFixed(0)} h · KF ${num(k.correctionFactor, 4)} · AW ${num(k.awCt, 4)} ct/kWh`);
console.log(`Capex ${meur(k.capex)} (${k.capexPerKw.toFixed(0)} €/kW) · uses ${meur(k.totalUses)} · debt ${meur(k.debt)} (${pct(k.gearing, 1)}) · equity ${meur(k.equity)} · DSRA ${meur(base.sourcesUses.dsraInitial)}`);
console.log(`Debt sizing: binding ${base.sizing.binding} · lender case (${base.sizing.bankPriceBasis}) min DSCR P50 ${num(base.sizing.minBankDscrP50, 3)} · P90 ${num(base.sizing.minBankDscrP90, 3)}`);
console.log("");
const row = (name: string, r: ModelResult) => {
  const v = r.validity;
  console.log(
    `${name.padEnd(9)} equity IRR ${pct(r.kpis.equityIrr).padStart(9)} · project IRR post-tax ${pct(r.kpis.projectIrrPostTax).padStart(9)}` +
      ` · min DSCR ${num(r.kpis.minDscr).padStart(5)} (${r.kpis.minDscrYear}) · NPV equity ${meur(r.kpis.npvEquity).padStart(10)}` +
      ` · validity ${v.integrity}/${v.funding}/${v.covenant}/${v.scope}${v.returnsMeaningful ? "" : " RETURNS N.M."}` +
      ` · failed ${r.checks.filter((c) => !c.ok && c.severity !== "info").map((c) => c.id).join(",") || "none"}`,
  );
};
for (const name of SCENARIOS) row(name, s[name]);
for (const name of SCENARIOS) {
  const periods = s[name].awPeriods.map((p) => `${p.start}: ${p.awCt.toFixed(2)} ct (${(p.siteQuality * 100).toFixed(1)} %)`);
  if (periods.length > 1) console.log(`  AW periods ${name}: ${periods.join(" · ")}`);
}
console.log(`LCOE ${num(k.lcoeRealCt)} ct/kWh real 2026 · ${num(k.lcoeNominalCt)} ct/kWh nominal · LLCR ${num(k.llcr)} · avg DSCR ${num(k.avgDscr)} · payback ${num(k.paybackYears, 1)} yrs · pre-tax project IRR ${pct(k.projectIrrPreTax)}`);
console.log("");
console.log("Checks (base):");
for (const c of base.checks) {
  const status = c.ok ? "ok  " : c.severity === "error" ? "FAIL" : c.severity === "warning" ? "WARN" : "info";
  console.log(`  ${status} ${c.group.padEnd(9)} ${c.id.padEnd(20)} ${String(typeof c.value === "number" ? num(c.value, 4) : c.value).padEnd(14)} ${c.detail}`);
}
console.log("");
console.log("Year  energy GWh  JW €/MWh  premium  revenue  opex  EBITDA  dWC  taxes  CFADS  debt svc  DSCR  distrib  book eq");
for (const a of base.annual) {
  console.log(
    `${a.year}  ${(a.energyKwh / 1e6).toFixed(1).padStart(9)}  ${(a.marketValueEurKwh * 1000).toFixed(1).padStart(8)}  ${(a.revenuePremium / 1e6).toFixed(2).padStart(7)}` +
      `  ${(a.revenue / 1e6).toFixed(2).padStart(7)}  ${(a.opex / 1e6).toFixed(2).padStart(4)}  ${(a.ebitda / 1e6).toFixed(2).padStart(6)}  ${(a.deltaWorkingCapital / 1e6).toFixed(2).padStart(5)}  ${(a.taxes / 1e6).toFixed(2).padStart(5)}` +
      `  ${(a.cfads / 1e6).toFixed(2).padStart(5)}  ${(a.debtService / 1e6).toFixed(2).padStart(8)}  ${a.dscr === null ? "  -  " : a.dscr.toFixed(2).padStart(5)}  ${(a.distribution / 1e6).toFixed(2).padStart(7)}  ${(a.bookEquity / 1e6).toFixed(2).padStart(7)}`,
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
console.log(
  `Bid calculator (${(t5 - t4).toFixed(0)} ms): 8 % equity IRR needs ${num(bid.target?.awardPriceCt ?? null, 3)} ct/kWh` +
    ` (AW ${num(bid.target?.awCt ?? null, 2)} ct); financeable ${num(bid.feasible?.awardPriceCt ?? null, 3)} ct;` +
    ` admissible under ${bid.ceilingCt} ct: ${bid.admissible}`,
);

const jsonAt = process.argv.indexOf("--json");
if (jsonAt > 0 && process.argv[jsonAt + 1]) {
  writeFileSync(process.argv[jsonAt + 1]!, JSON.stringify({ inputs: BASE_CASE, ...s, bid }, null, 2));
  console.log(`\nJSON written to ${process.argv[jsonAt + 1]}`);
}
