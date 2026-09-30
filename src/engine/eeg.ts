// EEG 2023 rules that drive revenue.

/** § 36h (1) EEG 2023: Gütefaktor (percent) → Korrekturfaktor, linear interpolation in between. */
export const CORRECTION_FACTOR_TABLE: ReadonlyArray<readonly [number, number]> = [
  [50, 1.55],
  [60, 1.42],
  [70, 1.29],
  [80, 1.16],
  [90, 1.07],
  [100, 1.0],
  [110, 0.94],
  [120, 0.89],
  [130, 0.85],
  [140, 0.81],
  [150, 0.79],
];

/**
 * Korrekturfaktor for a site quality given as a fraction (0.68 = 68 %). Below 60 % the table only
 * applies in the Südregion (floor 1.55 below 50 %); elsewhere the factor stays at 1.42. Above 150 %
 * it stays at 0.79.
 */
export function correctionFactor(siteQuality: number, southRegion: boolean): number {
  const pct = siteQuality * 100;
  const lowest = southRegion ? 50 : 60;
  if (pct <= lowest) return southRegion ? 1.55 : 1.42;
  if (pct >= 150) return 0.79;
  for (let i = 1; i < CORRECTION_FACTOR_TABLE.length; i++) {
    const [g1, k1] = CORRECTION_FACTOR_TABLE[i]!;
    const [g0, k0] = CORRECTION_FACTOR_TABLE[i - 1]!;
    if (pct <= g1) return k0 + ((pct - g0) / (g1 - g0)) * (k1 - k0);
  }
  return 0.79;
}

/** Anzulegender Wert in €/kWh = Zuschlagswert × Korrekturfaktor. */
export function anzulegenderWert(awardPriceCt: number, factor: number): number {
  return (awardPriceCt / 100) * factor;
}

/** Support period under § 25 EEG: 20 years from commissioning (not rounded to year end for tendered plants). */
export const SUPPORT_YEARS = 20;

/**
 * Market premium per kWh (Anlage 1 Nr. 4: annual market value "JW"). One-sided under EEG 2023;
 * two-sided under the EEG 2027 draft, i.e. negative when the market value exceeds the AW.
 */
export function marketPremium(aw: number, marketValue: number, twoSided: boolean): number {
  const diff = aw - marketValue;
  return twoSided ? diff : Math.max(0, diff);
}
