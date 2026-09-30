// The formula workbook's structure. Its numbers are verified by recalculating it in Microsoft Excel
// (scripts/workbook: verify.ts build → recalc.ps1 → verify.ts compare), which a unit test cannot do.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { BASE_CASE, buildSnapshot, SCENARIOS } from "../src/engine";
import type { Inputs } from "../src/engine";
import { buildFormulaWorkbook, canonicalInputs, type WorkbookExtras } from "../src/lib/workbook/build";
import { colName, excelDate } from "../src/lib/workbook/ooxml";
import { en } from "../src/messages/en";

const extras: WorkbookExtras = {
  tornado: { equityIrr: [], projectIrrPostTax: [], minDscr: [], lcoeRealCt: [] },
  bid: { target: null, feasible: null, admissible: null, ceilingCt: 7.25, searchedUpToCt: 15, stepCt: 0.25, toleranceCt: 0.0005 },
  bidTarget: 0.08,
  curve: [],
};
const snap = buildSnapshot(BASE_CASE);
const book = buildFormulaWorkbook(snap, extras, en, "https://igorsabodakha.com/wind-farm-calculator/");
const files = unzipSync(book.bytes);
const sheetXml = Object.entries(files)
  .filter(([k]) => k.startsWith("xl/worksheets/"))
  .map(([, v]) => strFromU8(v));
const formulas = sheetXml.flatMap((x) => [...x.matchAll(/<f>([^<]*)<\/f>/g)].map((m) => m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')));

const ALLOWED = new Set([
  "IF", "AND", "OR", "MIN", "MAX", "SUM", "SUMIFS", "SUMPRODUCT", "COUNTIF", "COUNTIFS", "AVERAGEIFS", "INDEX", "MATCH",
  "CHOOSE", "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "INT", "MOD", "DATE", "YEAR", "MONTH", "EDATE", "XIRR", "XNPV",
  "IFERROR",
]);

describe("formula workbook", () => {
  it("has the fourteen sheets of the plan, in order", () => {
    const wb = strFromU8(files["xl/workbook.xml"]!);
    const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([
      "Readme", "Inputs", "Timing", "Construction", "Operations", "Tax", "Debt", "Waterfall", "Statements", "Results",
      "Checks", "Scenarios", "Sensitivities", "Sources",
    ]);
    expect(wb).toContain('fullCalcOnLoad="1"');
  });

  it("uses only portable functions: no OFFSET, INDIRECT, dynamic arrays or macros", () => {
    expect(formulas.length).toBeGreaterThan(20_000);
    const used = new Set(formulas.flatMap((f) => [...f.matchAll(/([A-Z][A-Z0-9.]*)\(/g)].map((m) => m[1]!)));
    for (const fn of used) expect(ALLOWED.has(fn), fn).toBe(true);
    expect(Object.keys(files).some((k) => /vba|macro|externalLink/i.test(k))).toBe(false);
  });

  it("stores a result with every formula, so previews show numbers", () => {
    let withoutValue = 0;
    for (const x of sheetXml) {
      for (const m of x.matchAll(/<c r="[A-Z]+\d+"[^>]*>(<f>[^<]*<\/f>)(<v>[^<]*<\/v>)?<\/c>/g)) if (!m[2]) withoutValue++;
    }
    expect(withoutValue).toBe(0);
    const bare = buildFormulaWorkbook(snap, extras, en, "x", { withoutCache: true });
    const bareXml = Object.entries(unzipSync(bare.bytes)).filter(([k]) => k.startsWith("xl/worksheets/")).map(([, v]) => strFromU8(v)).join("");
    expect(bareXml).not.toMatch(/<\/f><v>/);
  });

  it("binds the key results to the engine", () => {
    const expected = (id: string) => book.manifest.find((m) => m.id === id)?.expected;
    for (const s of SCENARIOS) {
      expect(expected(`r.${s}.irr`)).toBe(snap.scenarios[s].kpis.equityIrr);
      expect(expected(`r.${s}.npv`)).toBe(snap.scenarios[s].kpis.npvEquity);
      expect(expected(`r.${s}.minDscr`)).toBe(snap.scenarios[s].kpis.minDscr);
    }
    expect(expected("c.base.uses")).toBe(snap.scenarios.base.sourcesUses.totalUses);
    expect(expected("chk.master")).toBe("OK");
  });

  it("carries the disclaimer, the engine version and the input hash", () => {
    expect(sheetXml.every((x) => x.includes("not investment, tax or legal advice"))).toBe(true);
    const core = strFromU8(files["docProps/core.xml"]!);
    expect(core).toContain(snap.inputHash);
    expect(core).toContain(snap.engineVersion);
    expect(core).toContain("<dc:creator>Igor Sabodakha</dc:creator>");
  });

  it("is deterministic", () => {
    const again = buildFormulaWorkbook(buildSnapshot(BASE_CASE), extras, en, "https://igorsabodakha.com/wind-farm-calculator/");
    expect(Buffer.from(again.bytes).equals(Buffer.from(book.bytes))).toBe(true);
  });

  it("colours inputs, links and pasted values differently", () => {
    const styles = strFromU8(files["xl/styles.xml"]!);
    expect(styles).toContain("FF0000FF"); // blue input font
    expect(styles).toContain("FFFFF2CC"); // yellow input fill
    expect(styles).toContain("FF008000"); // green links
    expect(styles).toContain("FFE4DFEC"); // purple solver fill
  });
});

describe("canonical inputs (D04)", () => {
  const edit = (fn: (c: Inputs) => void): Inputs => {
    const c = structuredClone(BASE_CASE);
    fn(c);
    return c;
  };

  it("leaves the base case unchanged", () => {
    expect(canonicalInputs(BASE_CASE)).toEqual(BASE_CASE);
  });

  it("rounds to 0.001 of the unit shown", () => {
    const c = canonicalInputs(
      edit((x) => {
        x.revenue.awardPriceCt = 5.234567; // ct/kWh
        x.energy.siteQuality = 0.6812345; // shown as 68.12345 %
        x.financing.interestRate = 0.05351; // shown as 5.351 %
      }),
    );
    expect(c.revenue.awardPriceCt).toBe(5.235);
    expect(c.energy.siteQuality).toBeCloseTo(0.68123, 12);
    expect(c.financing.interestRate).toBeCloseTo(0.05351, 12);
  });
});

describe("helpers", () => {
  it("column names and Excel dates", () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2027-01-01")).toBe(46388);
  });
});
