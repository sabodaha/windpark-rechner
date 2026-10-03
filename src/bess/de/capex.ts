// German CAPEX (spec v1.2 R2 §5.1, G13): seven lines in 2026 €, without VAT and without growth to purchase, each with
// its payment schedule over the 12 construction months and its AfA treatment (§6.3).
import { DE_CAPEX, DE_GRID, DE_TECH } from "./registry";
import type { DeInputs } from "./types";

export type DeCapexLineId = "dc" | "pcs" | "bop" | "substation" | "bkz" | "development" | "contingency";

export interface DeCapexLine {
  id: DeCapexLineId;
  amount: number;
  /** Weight by construction month 0…11; sums to 1. */
  profile: number[];
  /** AfA class of a direct line, or "allocated" (spread over battery, PCS and substation, §6.3). */
  afa: "battery" | "pcs" | "substation" | "bkz" | "allocated";
}

export interface DeCapexBuild {
  lines: DeCapexLine[];
  usableAcMWh: number;
  nameplateDcMWh: number;
  totalEur: number;
  /** Insured value in 2026 €: DC, PCS, BoP, substation and contingency (registry OPEX insuredValue). */
  insuredValue2026: number;
}

function profile(weights: [number, number][]): number[] {
  const p = new Array(12).fill(0) as number[];
  for (const [m, w] of weights) p[m]! += w;
  return p;
}

export function buildDeCapex(inp: DeInputs): DeCapexBuild {
  const kw = inp.powerMW * 1000;
  const usableAcMWh = inp.powerMW * inp.durationHours;
  const nameplateDcMWh = usableAcMWh * DE_TECH.nameplateFactor;
  const f = inp.capexFactor;
  const dc = inp.dcBlockPerKwhDc * nameplateDcMWh * 1000 * f;
  const pcs = inp.pcsMvPerKw * kw * f;
  const bop = inp.bopEpcPerKw * kw * f;
  const sub = inp.substationPerKw * kw * f;
  const cont = inp.contingencyShare * (dc + pcs + bop + sub);
  const dev = inp.developmentPerKw * kw * f * inp.developmentFactor;
  const bkz = inp.bkzPerKw * kw;
  const epc = profile(DE_CAPEX.epcSchedule);
  const month0 = profile([[0, 1]]);
  const lines: DeCapexLine[] = [
    { id: "dc", amount: dc, profile: epc, afa: "battery" },
    { id: "pcs", amount: pcs, profile: epc, afa: "pcs" },
    { id: "bop", amount: bop, profile: epc, afa: "allocated" },
    { id: "substation", amount: sub, profile: epc, afa: "substation" },
    { id: "bkz", amount: bkz, profile: profile(DE_GRID.bkzSchedule), afa: "bkz" },
    { id: "development", amount: dev, profile: month0, afa: "allocated" },
    { id: "contingency", amount: cont, profile: epc, afa: "allocated" },
  ];
  return {
    lines, usableAcMWh, nameplateDcMWh,
    totalEur: lines.reduce((s, l) => s + l.amount, 0),
    insuredValue2026: dc + pcs + bop + sub + cont,
  };
}
