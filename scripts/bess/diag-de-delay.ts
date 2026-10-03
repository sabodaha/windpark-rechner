// Diagnostic: the calculator's view of a delayed base case — the loan stays the one sized on the contractual timing
// (spec §18, B03). Usage: npx tsx scripts/bess/diag-de-delay.ts
import { DE_BASE } from "../../src/bess/de/registry";
import { loadDeLibrary } from "../../src/bess/de/server";
import { computeDeCore, computeDeExtras } from "../../src/bess/de/view";

const lib = loadDeLibrary();
for (const d of [0, 1, 4, 6, 12]) {
  const inp = { ...DE_BASE, codDelayMonths: d };
  const c = computeDeCore(inp, lib);
  const k = c.kpis!;
  const t0 = Date.now();
  const x = d === 6 ? computeDeExtras(inp, lib) : null;
  console.log(`delay ${d}: loan ${Math.round(k.debtEur?.value ?? 0)} IRR ${k.investorIrr?.value?.toFixed(4) ?? k.investorIrr?.status} NPV ${Math.round(k.investorNpvEur!.value!)} failed ${c.checks.filter((q) => q.status === "fail").map((q) => q.id).join(",")}` +
    (x ? ` T* ${x.tStar?.outcome} ${Math.round(x.tStar?.value ?? 0)} (${Date.now() - t0} ms)` : ""));
}
