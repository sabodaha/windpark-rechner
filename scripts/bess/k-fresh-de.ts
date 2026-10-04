// Gate 3 of spec R3.1 (§11.1, closure Q07): for each case with a k search, the investor NPV of a fresh run at the reported
// k, and whether the annual rule switches inside the final bracket — a jump rather than an attained root.
// Usage: npx tsx scripts/bess/k-fresh-de.ts <r31FixturesDir> <outFile> [--library=<dir>]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kOfCase, runDe } from "../../src/bess/de/index";
import { parseDeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";
import type { DeInputs } from "../../src/bess/de/types";

const [fixturesDir, outFile] = process.argv.slice(2);
if (!fixturesDir || !outFile) throw new Error("usage: k-fresh-de.ts <r31FixturesDir> <outFile> [--library=<dir>]");
const libDir = process.argv.find((a) => a.startsWith("--library="))?.slice(10) ?? "public/bess";
const manifest = JSON.parse(readFileSync(join(libDir, "de-library-v1.json"), "utf-8")) as DeLibraryManifest;
const bin = readFileSync(join(libDir, "de-library-v1.bin"));
const lib = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const cases = (JSON.parse(readFileSync(join(fixturesDir, "de-stack-resolved-inputs.json"), "utf-8")) as {
  cases: Record<string, { inputs: DeInputs; run: { kSearch: boolean } }>;
}).cases;

const held = (inp: DeInputs) => runDe(inp, lib).stack?.years.filter((y) => y.held).map((y) => y.year) ?? [];
const report: Record<string, unknown>[] = [];
for (const [id, c] of Object.entries(cases)) {
  if (!c.run.kSearch) continue;
  const k = kOfCase(c.inputs, lib);
  if (k.status !== "found" || k.value === null || !k.bracket) {
    report.push({ case: id, status: k.status });
    continue;
  }
  const fresh = runDe({ ...c.inputs, spreadMultiplierK: k.value }, lib);
  const lo = held({ ...c.inputs, spreadMultiplierK: k.bracket.finalLo });
  const hi = held({ ...c.inputs, spreadMultiplierK: k.bracket.finalHi });
  report.push({
    case: id, k: k.value, finalLo: k.bracket.finalLo, finalHi: k.bracket.finalHi, stop: k.bracket.stop,
    freshNpvEur: fresh.kpis?.investorNpvEur?.value ?? null,
    heldAtFinalLo: lo, heldAtFinalHi: hi, switchInsideBracket: JSON.stringify(lo) !== JSON.stringify(hi),
  });
}
writeFileSync(outFile, JSON.stringify(report, null, 1) + "\n", "utf-8");
console.log(JSON.stringify(report, null, 1));
