// Diagnostic: status, failed checks and sizing of one German case at chosen toll prices, on the synthetic or the real
// library. Usage: npx tsx scripts/bess/diag-de.ts <fixturesDir> <caseId> <price,...> [--real]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runDe } from "../../src/bess/de/index";
import { parseDeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";
import type { DeInputs } from "../../src/bess/de/types";
import { syntheticDeLibrary } from "./de-synthetic";

const [fixturesDir, caseId, prices] = process.argv.slice(2);
const real = process.argv.includes("--real");
let lib;
if (real) {
  const manifest = JSON.parse(readFileSync("public/bess/de-library-v1.json", "utf-8")) as DeLibraryManifest;
  const bin = readFileSync("public/bess/de-library-v1.bin");
  lib = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
} else lib = syntheticDeLibrary();
const doc = JSON.parse(readFileSync(join(fixturesDir!, "de-resolved-inputs.json"), "utf-8")) as { cases: Record<string, { inputs: DeInputs }> };
const inp = doc.cases[caseId!]!.inputs;
for (const p of prices!.split(",").map(Number)) {
  const r = runDe({ ...inp, tollPrice: p }, lib);
  const failed = r.checks.filter((c) => c.status === "fail").map((c) => `${c.id}=${c.value}`);
  console.log(p, r.status.primary, r.funding?.sizingStatus, r.funding?.iterations, Math.round(r.funding?.debtEur ?? 0), "NPV", r.kpis?.investorNpvEur?.value, failed.join(" "));
}
