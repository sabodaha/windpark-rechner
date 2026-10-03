// Smoke run of the German engine on a synthetic library of the real shape (no prices): every fixture case is run and
// written in the acceptance format, so the semantic checker can test the ledger identities before the real library
// exists. Usage: npx tsx scripts/bess/smoke-de.ts <fixturesDir> <outDir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toDeOutput } from "../../src/bess/de/export";
import { kOfCase, runDe, tStarOfCase, type DeResult } from "../../src/bess/de/index";
import { syntheticDeLibrary } from "./de-synthetic";
import type { DeInputs } from "../../src/bess/de/types";

const [fixturesDir, outDir] = process.argv.slice(2);
if (!fixturesDir || !outDir) throw new Error("usage: smoke-de.ts <fixturesDir> <outDir>");
const lib = syntheticDeLibrary();
interface Resolved { inputs: DeInputs; run: { funding: string; lowerNode: boolean; tStar: boolean; kSearch: boolean } }
const doc = JSON.parse(readFileSync(join(fixturesDir, "de-resolved-inputs.json"), "utf-8")) as { cases: Record<string, Resolved> };
mkdirSync(outDir, { recursive: true });
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
  const c = doc.cases[id]!;
  const r = runCase(id);
  const tStar = c.run.tStar && r.status.primary === "ok" ? tStarOfCase(c.inputs, lib) : null;
  const kSearch = c.run.kSearch && r.status.primary === "ok" ? kOfCase(c.inputs, lib) : null;
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(toDeOutput(r, { caseId: id, resolvedInputs: c.inputs as unknown as Record<string, unknown>, library: { synthetic: true }, tStar, kSearch })), "utf-8");
  console.log(id, r.status.primary, r.status.reasons.join(","), r.kpis ? `NPV ${Math.round(r.kpis.investorNpvEur!.value!)} debt ${Math.round(r.funding!.debtEur)}` : "", tStar?.outcome ?? "", kSearch?.status ?? "");
}
