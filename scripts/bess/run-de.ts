// German acceptance export (spec v1.2 R2 §16; R3.1 §11): reads the resolved inputs of a fixtures directory, runs every
// case and writes one document per case in its output contract (R2.4: de-output.schema.json; R3.1 with the stack:
// de-output-v2.schema.json). The documents are the engine side of gate 3; they are not shown to the independent reference
// before its own outputs are frozen.
// Usage: npx tsx scripts/bess/run-de.ts <fixturesDir> <outDir> [--cases=de-stack-resolved-inputs.json] [--only=D01,B03] [--library=<dir>]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toDeOutput } from "../../src/bess/de/export";
import { kOfCase, runDe, tStarOfCase, type DeResult } from "../../src/bess/de/index";
import { parseDeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";
import type { DeInputs } from "../../src/bess/de/types";

const [fixturesDir, outDir] = process.argv.slice(2);
if (!fixturesDir || !outDir) throw new Error("usage: run-de.ts <fixturesDir> <outDir>");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
// --library=<dir> runs on another library in the engine's layout (gate 3 library swap, gate3/swap_library.py)
const libDir = process.argv.find((a) => a.startsWith("--library="))?.slice(10) ?? "public/bess";
const manifest = JSON.parse(readFileSync(join(libDir, "de-library-v1.json"), "utf-8")) as DeLibraryManifest;
const bin = readFileSync(join(libDir, "de-library-v1.bin"));
const lib = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const library = { artifact: "de-library-v1", fileVersion: manifest.version, algorithmVersion: manifest.algorithmVersion,
  binSha256: sha(join(libDir, "de-library-v1.bin")), manifestSha256: sha(join(libDir, "de-library-v1.json")) };

interface Resolved { inputs: DeInputs; run: { funding: string; lowerNode: boolean; tStar: boolean; kSearch: boolean } }
// --cases=<file> names the resolved-inputs file of the fixtures directory (R3.1: de-stack-resolved-inputs.json)
const casesFile = process.argv.find((a) => a.startsWith("--cases="))?.slice(8) ?? "de-resolved-inputs.json";
const doc = JSON.parse(readFileSync(join(fixturesDir, casesFile), "utf-8")) as { cases: Record<string, Resolved> };
mkdirSync(outDir, { recursive: true });
const results = new Map<string, DeResult>();
const runCase = (id: string): DeResult => {
  const hit = results.get(id);
  if (hit) return hit;
  const c = doc.cases[id]!;
  let funding;
  if (c.run.funding.startsWith("locked:")) funding = runCase(c.run.funding.slice(7)).funding ?? undefined;
  const r = runDe(c.inputs, lib, { funding, lowerNode: c.run.lowerNode });
  results.set(id, r);
  return r;
};
const t0 = Date.now();
for (const id of Object.keys(doc.cases)) {
  if (only && !only.includes(id)) continue;
  const c = doc.cases[id]!;
  const r = runCase(id);
  const tStar = c.run.tStar && r.status.primary === "ok" ? tStarOfCase(c.inputs, lib) : null;
  const kSearch = c.run.kSearch && r.status.primary === "ok" ? kOfCase(c.inputs, lib) : null;
  const out = toDeOutput(r, { caseId: id, resolvedInputs: c.inputs as unknown as Record<string, unknown>, library, tStar, kSearch });
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(out, null, 1) + "\n", "utf-8");
  const k = r.kpis;
  console.log(id, r.status.primary, r.status.reasons.join(","), k ? `IRR ${k.investorIrr?.value?.toFixed(4) ?? k.investorIrr?.status} NPV ${Math.round(k.investorNpvEur!.value!)} debt ${Math.round(r.funding!.debtEur)}` : "",
    tStar ? `T* ${tStar.outcome} ${tStar.value?.toFixed(0) ?? ""}` : "", kSearch ? `k ${kSearch.status} ${kSearch.value?.toFixed(4) ?? ""}` : "");
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
