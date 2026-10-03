// Gate 1 of spec v1.1 §14: with the v1.1 modules off, the engine reproduces the released v1 outputs on all nine
// acceptance cases — money to €0.01 (or ₴0.01), ratios and physical quantities to 1e-9, dates and statuses exactly.
// The fixture is frozen from the released engine (scripts/bess/regression-fixture.ts) and is never regenerated to pass.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLibrary, type LibraryManifest } from "@/bess/engine";
import { acceptanceCases } from "../scripts/bess/cases";

const FIXTURE = "test/fixtures/bess-v1-regression.json";
const ready = existsSync(FIXTURE) && existsSync("public/bess/ua-library-v2.bin");

/** Money rows: amounts in EUR or UAH, by the key or by an enclosing key. */
const MONEY = /(eur|uah|npv|lcos|margin|revenue|cfads|^ds$|cash|debt|equity|uses|reserve|principal|byYear|amount|tax|opex|tariff|capex|dividend|investorNet|war)/i;

function compare(a: unknown, b: unknown, path: string, money: boolean, out: string[]) {
  if (out.length > 20) return;
  if (typeof b === "number" && typeof a === "number") {
    const tol = money ? 0.01 : 1e-9;
    if (!(Math.abs(a - b) <= tol)) out.push(`${path}: ${a} vs ${b}`);
    return;
  }
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) { out.push(`${path}: length ${Array.isArray(a) ? a.length : typeof a} vs ${b.length}`); return; }
    b.forEach((v, i) => compare(a[i], v, `${path}[${i}]`, money, out));
    return;
  }
  if (b && typeof b === "object") {
    if (!a || typeof a !== "object") { out.push(`${path}: ${typeof a} vs object`); return; }
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      if (k === "ms") continue;
      compare((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, money || MONEY.test(k), out);
    }
    return;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

describe.runIf(ready)("released v1 regression (spec v1.1 §14, gate 1)", () => {
  it("reproduces all nine acceptance cases of the released engine", () => {
    const manifest = JSON.parse(readFileSync("public/bess/ua-library-v2.json", "utf-8")) as LibraryManifest;
    const bin = readFileSync("public/bess/ua-library-v2.bin");
    const lib = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf-8")) as { cases: Record<string, unknown> };
    const now = JSON.parse(JSON.stringify(acceptanceCases(lib))) as Record<string, unknown>;
    const diffs: string[] = [];
    compare(now, fixture.cases, "cases", false, diffs);
    expect(diffs, diffs.join("\n")).toEqual([]);
  }, 60_000);
});
