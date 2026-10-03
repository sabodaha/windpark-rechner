// Diagnostic: months with negative cash in one German case on the real library, with the flows of those months.
// Usage: npx tsx scripts/bess/diag-de-cash.ts <fixturesDir> <caseId>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runDe } from "../../src/bess/de/index";
import { parseDeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";
import type { DeInputs } from "../../src/bess/de/types";

const [fixturesDir, caseId] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync("public/bess/de-library-v1.json", "utf-8")) as DeLibraryManifest;
const bin = readFileSync("public/bess/de-library-v1.bin");
const lib = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const doc = JSON.parse(readFileSync(join(fixturesDir!, "de-resolved-inputs.json"), "utf-8")) as { cases: Record<string, { inputs: DeInputs }> };
const r = runDe(doc.cases[caseId!]!.inputs, lib);
const L = r.ledger!;
const ym = (i: number) => `${2027 + Math.floor((1 + i) / 12)}-${String(((1 + i) % 12) + 1).padStart(2, "0")}`;
L.months.forEach((m, i) => {
  const o = r.ops!.months[i]!;
  if (m.cashCloseEur < -0.01 || o.augmentationEur > 0 || o.pcsOverhaulEur > 0 || o.decommissioningEur > 0)
    console.log(ym(i), "cash", Math.round(m.cashCloseEur), "dist", Math.round(m.distributionEur), "aug", Math.round(o.augmentationEur), "pcs", Math.round(o.pcsOverhaulEur),
      "decom", Math.round(o.decommissioningEur), "vat", Math.round(m.vatPaidEur), "tax", Math.round(m.kstPaidEur + m.soliPaidEur + m.gewPaidEur), "cfads", Math.round(m.cfadsEur));
});
const y = L.years.find((x) => x.year === 2029)!;
console.log("2029 revenue/MW", Math.round(y.revenueEur / 50), "EBITDA", Math.round(y.ebitdaEur), "IRR", r.kpis!.investorIrr, "payout", Math.round(L.liquidationPayoutEur));
