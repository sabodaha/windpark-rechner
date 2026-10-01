import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERIFIED_VARIANTS } from "../src/lib/workbook/verification";
import { BASE_CASE, ENGINE_VERSION } from "../src/engine";
import { variantWorkbooks, workbookDigest, type ExcelRun } from "../scripts/workbook/digest";
import { pairCoverage, USER_EDITS, VARIANTS } from "../scripts/workbook/variants";

const archive = new URL("../verification/excel-run.json", import.meta.url);
const stale =
  "The workbook changed since Microsoft Excel last verified it: run the Excel verification again (scripts/workbook/verify.ts: build, recalc.ps1, compare, archive) and commit verification/excel-run.json";

describe("workbook verification", () => {
  it("the pages quote the number of variants Excel recalculates", () => {
    expect(Object.keys(VARIANTS)).toHaveLength(VERIFIED_VARIANTS);
    for (const e of Object.values(USER_EDITS)) if (e.same) expect(VARIANTS[e.same], e.same).toBeDefined();
  });

  it("every pair of switch values meets in some variant", () => {
    expect(pairCoverage(Object.values(VARIANTS)).missing).toEqual([]);
  });

  it("the last Excel run covers every variant, passed, and was made from the current workbook", () => {
    expect(existsSync(archive), stale).toBe(true);
    const run = JSON.parse(readFileSync(archive, "utf8")) as ExcelRun;
    expect(Object.keys(run.variants).sort(), stale).toEqual(Object.keys(VARIANTS).sort());
    for (const [name, v] of Object.entries(run.variants)) expect([name, v.differ, v.cachesDiffer]).toEqual([name, 0, 0]);
    expect(Object.keys(run.edits).sort()).toEqual(Object.keys(USER_EDITS).sort());
    for (const [name, e] of Object.entries(run.edits)) expect([name, e.ok]).toEqual([name, true]);
    expect(Object.keys(run.negativeControls).sort()).toEqual(["negFormula", "negInput"]);
    for (const [name, c] of Object.entries(run.negativeControls)) expect([name, c.ok]).toEqual([name, true]);
    expect(run.pairs.missing).toEqual([]);
    expect(run.tolerance).toEqual({ money: 0.01, other: 1e-7 });
    expect(run.excel).toMatch(/^Microsoft Excel \d/);
    expect(run.engineVersion, stale).toBe(ENGINE_VERSION);
    // The workbook's formulas and the base case's pasted values are what Excel checked: any change needs a new run.
    expect(workbookDigest(variantWorkbooks(BASE_CASE).bare.bytes), stale).toBe(run.baseWorkbookDigest);
  });
});
