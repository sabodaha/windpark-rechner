// CAPEX from drivers (model-spec §8): one all-in perimeter without financing costs, a payment profile by construction
// month, the line currency and whether import-exempt (the AC battery system) or subject to 20 % VAT.
import { CAPEX, TECH } from "./registry";
import { uaCpiIndex } from "./macro";

export type Connection = "dso110kV" | "ukrenergoBay";

export interface CapexLine {
  id: string;
  currency: "EUR" | "UAH";
  /** Amount in the line currency at the payment price level (EUR lines in 2026 €, flat to purchase). */
  amount: number;
  /** Weight by construction month 0…(n−1); sums to 1. */
  profile: number[];
  vatable: boolean;
}

export interface CapexBuild {
  lines: CapexLine[];
  nameplateDcMWh: number;
  usableAcMWh: number;
  epcEur: number;
  /** All-in in EUR at the book FX for UAH lines (for display and the replacement value). */
  allInEur: number;
  developmentEur: number;
}

function profile(months: number, weights: [number, number][]): number[] {
  const p = new Array(months).fill(0) as number[];
  for (const [m, w] of weights) p[Math.min(m, months - 1)]! += w;
  return p;
}

function even(months: number, from: number, to: number): number[] {
  const p = new Array(months).fill(0) as number[];
  const lo = Math.min(from, months - 1);
  const hi = Math.min(to, months - 1);
  for (let m = lo; m <= hi; m++) p[m] = 1 / (hi - lo + 1);
  return p;
}

/** Construction months are fixed by the contract schedule (12); a COD delay does not move the payments. */
export function buildCapex(powerMW: number, durationH: number, connection: Connection, capexFactor: number): CapexBuild {
  const months = 12;
  const usableAcMWh = powerMW * durationH;
  const nameplateDcMWh = usableAcMWh * TECH.nameplateFactor;
  const acSystem = CAPEX.dcBlockEurPerKwhDc * nameplateDcMWh * 1000 + CAPEX.pcsMvEurPerMW * powerMW;
  const substation = CAPEX.hvSubstationEurPerMW * powerMW;
  const base = acSystem + substation;
  const bop = CAPEX.bopCivilFireShare * base;
  const ems = CAPEX.emsShare * base;
  const margin = CAPEX.epcMarginShare * base;
  const epc = base + bop + ems + margin;
  const epcProfile = profile(months, [[0, 0.2], [3, 0.5 / 6], [4, 0.5 / 6], [5, 0.5 / 6], [6, 0.5 / 6], [7, 0.5 / 6], [8, 0.5 / 6], [11, 0.3]]);
  const month0 = profile(months, [[0, 1]]);
  const cpi2027 = uaCpiIndex(2027) / uaCpiIndex(2026);
  const f = capexFactor;
  const lines: CapexLine[] = [
    // DC blocks and PCS inverters are import-VAT exempt (8507 60, 8504 40); MV transformers are not (N13)
    { id: "acSystem", currency: "EUR", amount: f * (acSystem - CAPEX.mvTransformerEurPerMW * powerMW), profile: epcProfile, vatable: false },
    { id: "mvTransformers", currency: "EUR", amount: f * CAPEX.mvTransformerEurPerMW * powerMW, profile: epcProfile, vatable: true },
    { id: "hvSubstation", currency: "EUR", amount: f * substation, profile: epcProfile, vatable: true },
    { id: "bopCivilFire", currency: "EUR", amount: f * bop, profile: epcProfile, vatable: true },
    { id: "ems", currency: "EUR", amount: f * ems, profile: epcProfile, vatable: true },
    { id: "epcMargin", currency: "EUR", amount: f * margin, profile: epcProfile, vatable: true },
    { id: "connectionFee", currency: "UAH", amount: f * CAPEX.connectionFeeUahPerKw * powerMW * 1000 * cpi2027, profile: month0, vatable: true },
    // the NEURC rate is in UAH (Res. 2231); the book quotes it in € at the book FX, so convert back and index to 2027
    { id: "line110kV", currency: "UAH", amount: f * CAPEX.line110kVKm * CAPEX.line110kVEurPerKm * CAPEX.bookFxUah * cpi2027, profile: month0, vatable: true },
    { id: "physicalProtection", currency: "EUR", amount: f * CAPEX.physicalProtectionEur, profile: even(months, 5, 11), vatable: true },
    { id: "development", currency: "EUR", amount: f * CAPEX.developmentEurPerMW * powerMW, profile: month0, vatable: true },
    { id: "ownersCost", currency: "EUR", amount: f * CAPEX.ownersCostShareOfEpc * epc, profile: even(months, 0, 11), vatable: true },
    { id: "contingency", currency: "EUR", amount: f * CAPEX.contingencyShareOfEpc * epc, profile: epcProfile, vatable: true },
  ];
  if (connection === "ukrenergoBay") {
    lines.push({ id: "ukrenergoBay", currency: "EUR", amount: f * CAPEX.ukrenergoBayExtraEur, profile: epcProfile, vatable: true });
  }
  const allInEur = lines.reduce((s, l) => s + (l.currency === "EUR" ? l.amount : l.amount / cpi2027 / CAPEX.bookFxUah), 0);
  return { lines, nameplateDcMWh, usableAcMWh, epcEur: f * epc, allInEur, developmentEur: f * CAPEX.developmentEurPerMW * powerMW };
}

/** The investment as actually paid, in EUR: hryvnia lines at the exchange rate of their payment month (spec §8). This,
 *  not the 2026 benchmark `allInEur`, is the base of the replacement value (S1.3). */
export function paidCapexEur(capex: CapexBuild, fxOfMonth: (constructionMonth: number) => number): number {
  let total = 0;
  for (const line of capex.lines) {
    line.profile.forEach((w, i) => {
      if (w !== 0) total += line.currency === "EUR" ? line.amount * w : (line.amount * w) / fxOfMonth(i);
    });
  }
  return total;
}
