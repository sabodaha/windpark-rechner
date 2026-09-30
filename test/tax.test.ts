import { describe, expect, it } from "vitest";
import { computeTaxes, corporateLossShare, corporateTaxRate, depreciation, offsetLosses } from "../src/engine/tax";

describe("corporate tax path (§ 23 KStG, 2025 amendment)", () => {
  it("falls one point a year from 2028 to 10 % in 2032", () => {
    expect([2027, 2028, 2029, 2030, 2031, 2032, 2040].map(corporateTaxRate)).toEqual([
      0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.1,
    ].map((v) => expect.closeTo(v, 12)));
  });

  it("minimum taxation share is 70 % up to 2027 and 60 % from 2028", () => {
    expect(corporateLossShare(2027)).toBe(0.7);
    expect(corporateLossShare(2028)).toBe(0.6);
  });
});

describe("loss offset with minimum taxation", () => {
  it("offsets 1 m fully and the share of the excess", () => {
    const r = offsetLosses(3_000_000, 5_000_000, 0.6);
    expect(r.taxable).toBeCloseTo(800_000, 6);
    expect(r.pool).toBeCloseTo(2_800_000, 6);
  });

  it("adds a loss to the pool", () => {
    expect(offsetLosses(-500, 100, 0.6)).toEqual({ taxable: 0, pool: 600 });
  });
});

describe("trade tax and corporate tax", () => {
  it("adds back 25 % of interest and half the land lease above € 200,000", () => {
    // base = 0 + 0.25 × (900,000 + 250,000 − 200,000) = 237,500 → − 24,500 allowance (KG) = 213,000
    const t = computeTaxes([{ year: 2030, ebt: 0, interest: 900_000, lease: 500_000 }], "KG", 4.0);
    expect(t.tradeTax[0]).toBeCloseTo(213_000 * 0.035 * 4.0, 6);
    expect(t.corporateTax[0]).toBe(0);
  });

  it("gives the € 24,500 allowance to a KG but not to a GmbH", () => {
    const kg = computeTaxes([{ year: 2030, ebt: 100_000, interest: 0, lease: 0 }], "KG", 4.0);
    const gmbh = computeTaxes([{ year: 2030, ebt: 100_000, interest: 0, lease: 0 }], "GmbH", 4.0);
    expect(kg.tradeTax[0]).toBeCloseTo(75_500 * 0.14, 6);
    expect(gmbh.tradeTax[0]).toBeCloseTo(100_000 * 0.14, 6);
    expect(gmbh.corporateTax[0]).toBeCloseTo(12_000, 6);
    expect(gmbh.soli[0]).toBeCloseTo(660, 6);
  });

  it("carries trade-tax losses forward", () => {
    const t = computeTaxes(
      [
        { year: 2030, ebt: -500_000, interest: 0, lease: 0 },
        { year: 2031, ebt: 700_000, interest: 0, lease: 0 },
      ],
      "GmbH",
      4.0,
    );
    expect(t.tradeTax[0]).toBe(0);
    expect(t.tradeTax[1]).toBeCloseTo(200_000 * 0.14, 6);
  });
});

describe("depreciation", () => {
  const years = Array.from({ length: 20 }, (_, i) => 2028 + i);

  it("straight-line over 16 years, commissioning month counted in full", () => {
    const d = depreciation(16_000, 7, 16, false, years);
    expect(d[0]).toBeCloseTo(500, 9); // July–December: 6/12 of 1,000
    expect(d[1]).toBeCloseTo(1000, 9);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(16_000, 6);
    expect(d[16]).toBeCloseTo(500, 9);
    expect(d[17]).toBe(0);
  });

  it("declining balance at 3 × 6.25 % = 18.75 %, then switches to straight-line", () => {
    const d = depreciation(16_000, 1, 16, true, years);
    expect(d[0]).toBeCloseTo(3000, 9);
    expect(d[1]).toBeCloseTo((16_000 - 3000) * 0.1875, 9);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(16_000, 6);
    // In the switch year the remaining book value is spread evenly over the remaining life.
    const last = d.slice(11, 16);
    for (const v of last) expect(v).toBeCloseTo(last[0]!, 6);
  });
});
