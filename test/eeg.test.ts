import { describe, expect, it } from "vitest";
import { anzulegenderWert, correctionFactor, marketPremium } from "../src/engine/eeg";

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

  it("derives the anzulegender Wert from the award price", () => {
    expect(anzulegenderWert(4.79, 1.316)).toBeCloseTo(0.0630364, 7);
  });
});

describe("market premium", () => {
  it("is one-sided under EEG 2023", () => {
    expect(marketPremium(0.063, 0.05, false)).toBeCloseTo(0.013, 12);
    expect(marketPremium(0.063, 0.08, false)).toBe(0);
  });

  it("is two-sided under the EEG 2027 draft", () => {
    expect(marketPremium(0.063, 0.08, true)).toBeCloseTo(-0.017, 12);
  });
});
