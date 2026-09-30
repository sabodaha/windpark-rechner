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

/** Commercial rounding (half away from zero) that ignores binary noise such as 5.805 → 5.80499999. */
export function roundHalfUp(x: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  const scaled = Number((Math.abs(x) * f).toPrecision(12));
  const r = (Math.sign(x) * Math.round(scaled)) / f;
  return r === 0 ? 0 : r;
}

/** Anzulegender Wert in €/kWh = Zuschlagswert × Korrekturfaktor, rounded to two decimals in ct/kWh (§ 36h (5)). */
export function anzulegenderWert(awardPriceCt: number, factor: number): number {
  return roundHalfUp(awardPriceCt * factor, 2) / 100;
}

/** Support period under § 25 EEG: 20 years from commissioning (not rounded to year end for tendered plants). */
export const SUPPORT_YEARS = 20;

/** § 51a (1) EEG: negative-price periods are counted in the commissioning year and the 19 calendar years after it. */
export const NEGATIVE_PRICE_COUNT_YEARS = 20;

/** § 36h (2) EEG: the AW is re-determined from the start of years 6, 11 and 16 after commissioning. */
export const SITE_REVIEW_YEARS = [5, 10, 15] as const;
/** § 36h (2): past payments are settled only if the Gütefaktor moves by more than 2 percentage points. */
export const SITE_REVIEW_THRESHOLD = 0.02;

/** § 6 (2) EEG: at most 0.2 ct/kWh counts as a municipal payment that the grid operator refunds. */
export const MUNICIPAL_REFUND_CAP_CT = 0.2;

/** § 36e (1) EEG: the award lapses if the farm is not commissioned within 36 months of its announcement. */
export const AWARD_LAPSE_MONTHS = 36;
/** § 55 (1) Nr. 2 EEG: commissioning more than 30 months after the announcement triggers a penalty. */
export const AWARD_PENALTY_MONTHS = 30;

/**
 * Market premium per kWh (Anlage 1 Nr. 4: annual market value "JW"). One-sided under EEG 2023; in the
 * simplified two-sided stress it turns negative when the market value exceeds the AW.
 */
export function marketPremium(aw: number, marketValue: number, twoSided: boolean): number {
  const diff = aw - marketValue;
  return twoSided ? diff : Math.max(0, diff);
}
