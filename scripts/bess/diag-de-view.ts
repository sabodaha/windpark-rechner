// Diagnostic: the German base case's view (what the static page carries): time per part and JSON size, headline numbers.
// Usage: npx tsx scripts/bess/diag-de-view.ts
import { deBase } from "../../src/bess/de/server";

const t0 = Date.now();
const b = deBase();
const t1 = Date.now();
const size = (x: unknown) => `${Math.round(JSON.stringify(x).length / 1024)} KB`;
console.log("deBase in", t1 - t0, "ms; sizes: core", size(b.core), "extras", size(b.extras), "sensitivity", size(b.sensitivity), "compare", size(b.compare));
const k = b.core.kpis!;
console.log("IRR", k.investorIrr, "NPV", Math.round(k.investorNpvEur!.value!), "T*", b.extras.tStar?.outcome, Math.round(b.extras.tStar?.value ?? 0));
console.log("bridge 2029 per MW", b.core.bridge2029);
console.log("tornado", b.sensitivity.tornado.bars.map((x) => `${x.id} ${Math.round(x.low?.npv ?? NaN)}/${Math.round(x.high?.npv ?? NaN)}`).join(" | "));
console.log("variants", b.sensitivity.variants.map((v) => `${v.id} ${v.investorIrr.status === "valid" ? (v.investorIrr.value! * 100).toFixed(1) + "%" : v.investorIrr.status}${v.status ? " " + v.status : ""}`).join(" | "));
console.log("compare", b.compare.rows.map((r) => `${r.id} IRR ${r.investorIrr?.value != null ? (r.investorIrr.value * 100).toFixed(1) + "%" : r.investorIrr?.status ?? r.status} NPV12 ${Math.round(r.npvCommonEur ?? NaN)} LCOS ${Math.round(r.lcosEurPerMWh ?? NaN)} rev29 ${Math.round(r.revenue2029PerMwEur ?? NaN)} gear ${r.gearing?.toFixed(3)}`).join("\n        "));
