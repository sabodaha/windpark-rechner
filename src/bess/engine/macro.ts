// Price indices and the EUR/UAH path (model-spec §4, §13). Indices are annual and constant within a year, with
// 2025 = 1. FX is an annual average placed at mid-year and interpolated log-linearly between mid-years.
import { MACRO } from "./registry";

function rate(table: Record<number, number>, after: number, year: number): number {
  return table[year] ?? after;
}

function index(table: Record<number, number>, after: number, year: number): number {
  let v = 1;
  for (let y = 2026; y <= year; y++) v *= 1 + rate(table, after, y);
  return v;
}

export const hicpIndex = (year: number): number => index(MACRO.hicp, MACRO.hicpAfter, year);
export const uaCpiIndex = (year: number): number => index(MACRO.uaCpi, MACRO.uaCpiAfter, year);

export function fxAnnual(year: number): number {
  const known = MACRO.fxEurUah[year];
  if (known !== undefined) return known;
  if (year < 2025) return MACRO.fxEurUah[2025]!;
  return MACRO.fxEurUah[2029]! * Math.pow(1 + MACRO.fxGrowthAfter, year - 2029);
}

/** UAH per EUR in a calendar month (1–12). The stress raises the path by 10 % from 2028. */
export function fxMonth(year: number, month: number, stress: boolean): number {
  const t = year + (month - 0.5) / 12;
  const y0 = month >= 7 ? year : year - 1;
  const w = t - (y0 + 0.5);
  const v = Math.exp((1 - w) * Math.log(fxAnnual(y0)) + w * Math.log(fxAnnual(y0 + 1)));
  return stress && year >= 2028 ? v * (1 + MACRO.fxStress) : v;
}

/** The 2025 annual average, used to map the import fee onto the library's base-period scale. */
export const FX_ANCHOR_2025 = MACRO.fxEurUah[2025]!;
