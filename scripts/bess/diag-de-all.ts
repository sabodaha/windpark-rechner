// Diagnostic: every German case on the real library, without T* or k: status, minimum cash, failed checks, investor IRR.
// Usage: npx tsx scripts/bess/diag-de-all.ts <fixturesDir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runDe, type DeResult } from "../../src/bess/de/index";
import { parseDeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";
import type { DeInputs } from "../../src/bess/de/types";

const [fixturesDir] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync("public/bess/de-library-v1.json", "utf-8")) as DeLibraryManifest;
const bin = readFileSync("public/bess/de-library-v1.bin");
const lib = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
interface Resolved { inputs: DeInputs; run: { funding: string; lowerNode: boolean } }
const doc = JSON.parse(readFileSync(join(fixturesDir!, "de-resolved-inputs.json"), "utf-8")) as { cases: Record<string, Resolved> };
const results = new Map<string, DeResult>();
const runCase = (id: string): DeResult => {
  const hit = results.get(id);
  if (hit) return hit;
  const c = doc.cases[id]!;
  const funding = c.run.funding.startsWith("locked:") ? runCase(c.run.funding.slice(7)).funding ?? undefined : undefined;
  const r = runDe(c.inputs, lib, { funding, lowerNode: c.run.lowerNode });
  results.set(id, r);
  return r;
};
for (const id of Object.keys(doc.cases)) {
  const r = runCase(id);
  const L = r.ledger;
  const failed = r.checks.filter((c) => c.status === "fail").map((c) => c.id);
  const irr = r.kpis?.investorIrr;
  let worst = "";
  if (L) {
    let mi = 0;
    L.months.forEach((m, i) => { if (m.cashCloseEur < L.months[mi]!.cashCloseEur) mi = i; });
    worst = `${2027 + Math.floor((1 + mi) / 12)}-${String(((1 + mi) % 12) + 1).padStart(2, "0")}`;
  }
  console.log(id.padEnd(4), r.status.primary.padEnd(11), "minCash", String(Math.round(L?.minCashEur ?? 0)).padStart(11), worst,
    "IRR", irr?.value?.toFixed(4) ?? irr?.status, "NPV", Math.round(r.kpis?.investorNpvEur?.value ?? 0), "payout", Math.round(L?.liquidationPayoutEur ?? 0),
    failed.length ? "FAIL " + failed.join(",") : "");
}
