import { describe, expect, it } from "vitest";
import { toDay } from "../src/engine/dates";
import { annuityFactor, xirr, xnpv } from "../src/engine/finance";

// Microsoft's documented XIRR / XNPV example.
const excelExample = [
  { day: toDay("2008-01-01"), amount: -10000 },
  { day: toDay("2008-03-01"), amount: 2750 },
  { day: toDay("2008-10-30"), amount: 4250 },
  { day: toDay("2009-02-15"), amount: 3250 },
  { day: toDay("2009-04-01"), amount: 2750 },
];

describe("xirr / xnpv", () => {
  it("matches Excel's documented XIRR example (37.34 %)", () => {
    expect(xirr(excelExample).rate).toBeCloseTo(0.373362535, 8);
  });

  it("matches Excel's documented XNPV example (2,086.65 at 9 %)", () => {
    expect(xnpv(0.09, excelExample, toDay("2008-01-01"))).toBeCloseTo(2086.647602, 5);
  });

  it("solves a one-year flow exactly", () => {
    const flows = [
      { day: toDay("2021-01-01"), amount: -100 },
      { day: toDay("2022-01-01"), amount: 110 },
    ];
    expect(xirr(flows).rate).toBeCloseTo(0.1, 10);
  });

  it("returns null without a sign change", () => {
    expect(xirr([{ day: 0, amount: -1 }, { day: 365, amount: -2 }]).rate).toBeNull();
  });

  it("reports every root when the IRR is ambiguous", () => {
    // -100, +230, -132 has roots at 10 % and 20 %.
    const r = xirr([
      { day: 0, amount: -100 },
      { day: 365, amount: 230 },
      { day: 730, amount: -132 },
    ]);
    expect(r.roots).toHaveLength(2);
    expect(r.roots[0]).toBeCloseTo(0.1, 6);
    expect(r.roots[1]).toBeCloseTo(0.2, 6);
  });

  it("annuity factor", () => {
    expect(annuityFactor(0.05, 10)).toBeCloseTo(0.129504575, 8);
    expect(annuityFactor(0, 4)).toBe(0.25);
  });
});
