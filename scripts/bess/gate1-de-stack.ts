// Gate 1 of spec R3.1 §11.1, on the engine's own library:
// (a) the R2.4 cases rerun to the byte equal to the accepted engine documents;
// (b) the lower bound: over each stack case's life, marketNet with the stack ≥ 0.99 × day-ahead only with the same inputs
//     and the same funding; the difference by year goes to the report;
// (c) the loan: a fresh loan with the stack equals the fresh loan of day-ahead only (amount, scheduled principal, funded
//     initial DSRA, to €0.01).
// Usage: npx tsx scripts/bess/gate1-de-stack.ts <r24FixturesDir> <r31FixturesDir> <acceptedR24Dir> <reportFile>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { toDeOutput } from "../../src/bess/de/export";
import { kOfCase, runDe, tStarOfCase, type DeResult } from "../../src/bess/de/index";
import { parseDeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";
import type { DeInputs, DeLockedFunding } from "../../src/bess/de/types";

const [r24Dir, r31Dir, acceptedDir, reportFile] = process.argv.slice(2);
if (!r24Dir || !r31Dir || !acceptedDir || !reportFile) throw new Error("usage: gate1-de-stack.ts <r24FixturesDir> <r31FixturesDir> <acceptedR24Dir> <reportFile>");
const libDir = "public/bess";
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const manifest = JSON.parse(readFileSync(join(libDir, "de-library-v1.json"), "utf-8")) as DeLibraryManifest;
const bin = readFileSync(join(libDir, "de-library-v1.bin"));
const lib = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const library = { artifact: "de-library-v1", fileVersion: manifest.version, algorithmVersion: manifest.algorithmVersion,
  binSha256: sha(join(libDir, "de-library-v1.bin")), manifestSha256: sha(join(libDir, "de-library-v1.json")) };

interface Resolved { inputs: DeInputs; run: { funding: string; lowerNode: boolean; tStar: boolean; kSearch: boolean } }
const load = (dir: string, file: string) => (JSON.parse(readFileSync(join(dir, file), "utf-8")) as { cases: Record<string, Resolved> }).cases;

function runner(cases: Record<string, Resolved>) {
  const memo = new Map<string, DeResult>();
  const run = (id: string): DeResult => {
    const hit = memo.get(id);
    if (hit) return hit;
    const c = cases[id]!;
    const r = runDe(c.inputs, lib, { funding: fundingOf(c), lowerNode: c.run.lowerNode });
    memo.set(id, r);
    return r;
  };
  const fundingOf = (c: Resolved): DeLockedFunding | undefined => (c.run.funding.startsWith("locked:") ? run(c.run.funding.slice(7)).funding ?? undefined : undefined);
  return { run, fundingOf };
}

// (a) the R2.4 cases, to the byte
const r24 = load(r24Dir, "de-resolved-inputs.json");
const a = runner(r24);
const gateA: { case: string; equal: boolean }[] = [];
for (const [id, c] of Object.entries(r24)) {
  const r = a.run(id);
  const ok = r.status.primary === "ok";
  const out = toDeOutput(r, { caseId: id, resolvedInputs: c.inputs as unknown as Record<string, unknown>, library,
    tStar: c.run.tStar && ok ? tStarOfCase(c.inputs, lib) : null, kSearch: c.run.kSearch && ok ? kOfCase(c.inputs, lib) : null });
  const text = JSON.stringify(out, null, 1) + "\n";
  gateA.push({ case: id, equal: text === readFileSync(join(acceptedDir, `${id}.json`), "utf-8") });
}

// (b) and (c) on the R3.1 cases whose stack is on
const r31 = load(r31Dir, "de-stack-resolved-inputs.json");
const b = runner(r31);
const gateB: Record<string, unknown>[] = [];
const gateC: Record<string, unknown>[] = [];
const near = (x: number, y: number) => Math.abs(x - y) <= 0.01;
for (const [id, c] of Object.entries(r31)) {
  const r = b.run(id);
  if (!r.stackOn || r.status.primary !== "ok") continue;
  const da = runDe({ ...c.inputs, stackEnabled: false }, lib, { funding: b.fundingOf(c), lowerNode: c.run.lowerNode });
  const byYear = new Map<number, { stack: number; dayAhead: number }>();
  r.ops!.months.forEach((o, i) => {
    const y = r.cal!.months[i]!.year;
    const e = byYear.get(y) ?? { stack: 0, dayAhead: 0 };
    e.stack += o.marketNetEur;
    e.dayAhead += da.ops!.months[i]!.marketNetEur;
    byYear.set(y, e);
  });
  const stack = r.ops!.months.reduce((s, o) => s + o.marketNetEur, 0);
  const dayAhead = da.ops!.months.reduce((s, o) => s + o.marketNetEur, 0);
  gateB.push({
    case: id, path: c.inputs.reservePath, lifetimeStackEur: stack, lifetimeDayAheadEur: dayAhead, ratio: dayAhead !== 0 ? stack / dayAhead : null,
    pass: stack >= 0.99 * dayAhead,
    byYear: [...byYear].map(([year, e]) => ({ year, stackEur: e.stack, dayAheadEur: e.dayAhead, differenceEur: e.stack - e.dayAhead })),
  });
  if (c.run.funding === "sized" && c.inputs.debt) {
    const f = r.funding!, g = da.funding!;
    const ok = near(f.debtEur, g.debtEur) && near(f.dsraInitialEur, g.dsraInitialEur) && f.principalEur.length === g.principalEur.length &&
      f.principalEur.every((v, i) => near(v, g.principalEur[i]!));
    gateC.push({ case: id, debtEur: f.debtEur, dayAheadDebtEur: g.debtEur, dsraInitialEur: f.dsraInitialEur, dayAheadDsraInitialEur: g.dsraInitialEur,
      maxPrincipalDifferenceEur: Math.max(0, ...f.principalEur.map((v, i) => Math.abs(v - (g.principalEur[i] ?? 0)))), pass: ok });
  }
}

const report = {
  gate: "spec R3.1 §11.1 gate 1, engine side, own library",
  library,
  a: { cases: gateA.length, equal: gateA.filter((x) => x.equal).length, pass: gateA.every((x) => x.equal), detail: gateA },
  b: { cases: gateB.length, pass: gateB.every((x) => x.pass), minRatio: Math.min(...gateB.map((x) => (x.ratio as number) ?? Infinity)), detail: gateB },
  c: { cases: gateC.length, pass: gateC.every((x) => x.pass), detail: gateC },
};
writeFileSync(reportFile, JSON.stringify(report, null, 1) + "\n", "utf-8");
console.log(`gate 1a: ${report.a.equal}/${report.a.cases} byte-equal`);
console.log(`gate 1b: ${gateB.filter((x) => x.pass).length}/${gateB.length} pass, min ratio ${report.b.minRatio.toFixed(4)}`);
for (const x of gateB) console.log(`  ${x.case} ${x.path} ratio ${(x.ratio as number).toFixed(4)}`);
console.log(`gate 1c: ${gateC.filter((x) => x.pass).length}/${gateC.length} pass`);
for (const x of gateC) console.log(`  ${x.case} debt ${(x.debtEur as number).toFixed(2)} vs ${(x.dayAheadDebtEur as number).toFixed(2)} max principal diff ${(x.maxPrincipalDifferenceEur as number).toExponential(2)}`);
