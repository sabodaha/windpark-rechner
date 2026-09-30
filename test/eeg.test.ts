import { describe, expect, it } from "vitest";
import { anzulegenderWert, correctionFactor, marketPremium, roundHalfUp } from "../src/engine/eeg";

describe("§ 36h correction factor", () => {
  it("hits every support point of the table", () => {
    const points: [number, number][] = [
      [0.6, 1.42], [0.7, 1.29], [0.8, 1.16], [0.9, 1.07], [1.0, 1.0],
      [1.1, 0.94], [1.2, 0.89], [1.3, 0.85], [1.4, 0.81], [1.5, 0.79],
    ];
    for (const [q, k] of points) expect(correctionFactor(q, false)).toBeCloseTo(k, 10);
  });

  it("interpolates linearly (68 % → 1.316, 75 % → 1.225)", () => {
    expect(correctionFactor(0.68, false)).toBeCloseTo(1.316, 10);
    expect(correctionFactor(0.75, false)).toBeCloseTo(1.225, 10);
  });

  it("goes below 60 % only in the Südregion", () => {
    expect(correctionFactor(0.55, false)).toBe(1.42);
    expect(correctionFactor(0.55, true)).toBeCloseTo(1.485, 10);
    expect(correctionFactor(0.5, true)).toBeCloseTo(1.55, 10);
    expect(correctionFactor(0.4, true)).toBe(1.55);
  });

  it("stays at 0.79 above 150 %", () => {
    expect(correctionFactor(1.7, false)).toBe(0.79);
  });

  it("derives the anzulegender Wert from the award price, rounded to two decimals in ct (§ 36h (5))", () => {
    // 4.79 × 1.316 = 6.30364 ct → 6.30 ct
    expect(anzulegenderWert(4.79, 1.316)).toBe(0.063);
  });

  it("rounds half up, ignoring binary noise", () => {
    expect(anzulegenderWert(6.305, 1)).toBeCloseTo(0.0631, 12); // exactly half → up
    expect(anzulegenderWert(4.5, 1.29)).toBeCloseTo(0.0581, 12); // 5.805 is stored as 5.80499…
    expect(anzulegenderWert(6.304, 1)).toBeCloseTo(0.063, 12);
    expect(roundHalfUp(-2.345, 2)).toBe(-2.35);
    expect(roundHalfUp(0.0000001, 2)).toBe(0);
  });
});

describe("market premium", () => {
  it("is one-sided under EEG 2023", () => {
    expect(marketPremium(0.063, 0.05, false)).toBeCloseTo(0.013, 12);
    expect(marketPremium(0.063, 0.08, false)).toBe(0);
  });

  it("is two-sided in the simplified stress", () => {
    expect(marketPremium(0.063, 0.08, true)).toBeCloseTo(-0.017, 12);
  });
});
