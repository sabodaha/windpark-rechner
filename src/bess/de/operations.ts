// German operations by month (spec v1.2 R2 §2–§5): cohorts and wear (S1.3 §7, shared `soh`), the contracted capacity
// curve of the toll, the merchant slice from the library with the price transform and the signed effective fee, the toll
// fee with its availability and capacity factors, OPEX lines from the actual COD, lifecycle events and decommissioning.
// Spec R3.1 adds the revenue stack on the merchant slice: aFRR capacity in held years, its activation (wear only) and the
// intraday uplift; without a stack plan every month is the R2.4 month to the bit.
import { soh } from "../engine/operations";
import type { DeCalendar } from "./calendar";
import type { DeCapexBuild } from "./capex";
import { deMonthFields, lookupDe, UnsupportedLibraryInput, type DeLibrary } from "./library";
import { DE_BASE, DE_CAPEX, DE_GRID, DE_REVENUE, DE_SPREAD_PATHS, DE_STACK, DE_TECH, idxDE, type DeSpreadPath } from "./registry";
import type { DeInputs, DeReservePath } from "./types";

export interface DeOpsMonth {
  index: number;
  s: number;
  availability: number | null;
  usableMWhOpen: number | null;
  usableHours: number | null;
  contractUsableMWh: number | null;
  sohInitial: number | null;
  sohAugmentation: number | null;
  spreadM: number | null;
  levelShiftA: number | null;
  importFee: number | null;
  marketChargeMWh: number;
  marketDischargeMWh: number;
  tollerDischargeMWh: number;
  dischargeMWh: number;
  efcInitial: number | null;
  efcAugmentation: number | null;
  salesEur: number;
  purchasesEur: number;
  marginEur: number;
  capturedEur: number;
  optimiserFeeEur: number;
  marketNetEur: number;
  availabilityFactor: number | null;
  capacityFactor: number | null;
  tollFeeAccruedEur: number;
  omEur: number;
  insuranceEur: number;
  leaseEur: number;
  meteringEur: number;
  adminEur: number;
  avalEur: number;
  auxChargesEur: number;
  agnesEur: number;
  opexTotalEur: number;
  augmentationEur: number;
  pcsOverhaulEur: number;
  decommissioningEur: number;
  // the revenue stack (spec R3.1 §1–§7); false and 0 in a month without operation or without a stack. The R2.4 fields
  // above keep their meaning: sales, purchases, margin, captured margin and market energy are the wholesale share's.
  stackOn: boolean;
  /** held(y) of the month's calendar year (§2). */
  reserveHeld: boolean;
  wholesaleShare: number;
  afrrSliceShare: number;
  /** MW_A: offered aFRR capacity (§1.3). */
  afrrMw: number;
  /** R(y) of the month's calendar year on the case's path (§3.2), with a stack plan. */
  reserveMultiplier: number;
  capRevAfrrEur: number;
  activationDischargeMWh: number;
  activationChargeMWh: number;
  intradayUpliftEur: number;
}

/** The stack of a case run (spec R3.1 §1.1–§2): absent for the lender case, the LCOS run and a case without the stack. */
export interface DeStackPlan {
  /** held(y) of the annual opportunity rule (§2), by calendar year. */
  held: Map<number, boolean>;
  /** The first month with aFRR: the actual COD + reserveStartLagMonths (§1.1). */
  reserveStartIndex: number;
}

export interface DeOpsSettings {
  /** The lender case reads path `low` (spec §7.3). */
  spreadPath?: DeSpreadPath;
  /** Lower usable-hours node, no interpolation (lender case). */
  lowerNode?: boolean;
  /** LCOS view: the whole battery as merchant, the toll ignored (spec §9.1). */
  ignoreToll?: boolean;
  /** The revenue stack of the case (spec R3.1); absent = off. */
  stack?: DeStackPlan;
}

export interface DeOpsResult {
  months: DeOpsMonth[];
  /** First library failure (month and message), or null. */
  unsupported: string | null;
  retiredBelowGrid: boolean;
  /** max over toll months of tollFee / contractual fee (≤ 1 by construction; checked). */
  maxTollFeeRatio: number;
}

const opexFactor = (y: number) => idxDE(y) / idxDE(2026);

/** R(y): the aFRR saturation multiplier of a calendar year; the first and last columns hold outside the table (§3.2). */
export function reserveMultiplier(path: DeReservePath, year: number): number {
  const [first, last] = DE_STACK.pathYears;
  return DE_STACK.paths[path][Math.min(Math.max(year, first), last) as 2027];
}

/** € per offered MW-hour of aFRR capacity in a year before ρ, availability and the fee:
 *  (π+ + π−) · φ · R(y) · idxDE(y)/idxDE(2026), φ = reservePriceFactor. */
export function reserveRatePerMwh(inp: DeInputs, year: number): number {
  const p = DE_STACK.prices[inp.reservePriceWindow];
  return (p.pos + p.neg) * inp.reservePriceFactor * reserveMultiplier(inp.reservePath, year) * (idxDE(year) / idxDE(DE_STACK.priceYear));
}

/** The energy test of the offer (§1.3): min(1; usable hours / (2 · 1 h)). */
export const afrrEnergyFactor = (usableHours: number) => Math.min(1, usableHours / (2 * DE_STACK.energyHoursPerDirection));

export function spreadM(inp: DeInputs, path: DeSpreadPath, year: number): number {
  const t = DE_SPREAD_PATHS[path];
  const m = t[Math.min(Math.max(year, 2028), 2031) as 2028];
  return inp.spreadMultiplierK * m * (DE_REVENUE.tb2["DE-2025"] / DE_REVENUE.tb2[inp.snapshot]);
}

/** Spec §2.3: a(y) = L(y) − M·L̄ with L(y) = L̄; importFee = (1 − RTE)·a/M + (1 + RTE)·f/(idx·M). */
export function effectiveFee(inp: DeInputs, lbar: number, M: number, year: number): { a: number; fee: number } {
  const a = lbar - M * lbar;
  return { a, fee: ((1 - inp.rte) * a) / M + ((1 + inp.rte) * inp.fExchange) / (idxDE(year) * M) };
}

/** Spec §3.2: expected usable energy of the whole battery at 1.5 cycles/day of the current usable energy, base availability,
 *  no wear stress, augmentation on schedule; once per case, from the actual COD. */
export function contractCurve(inp: DeInputs, cal: DeCalendar, capex: DeCapexBuild): Map<number, number> {
  const curve = new Map<number, number>();
  if (cal.tollFirst === null || cal.tollLast === null) return curve;
  const cohorts = [{ bol: capex.usableAcMWh, start: cal.codIndex, efc: 0, active: true }];
  for (let i = cal.codIndex; i <= cal.tollLast; i++) {
    const m = cal.months[i]!;
    if (i === cal.augmentationIndex) cohorts.push({ bol: inp.augmentationDcShare * capex.usableAcMWh, start: i, efc: 0, active: true });
    let usable = 0;
    const shares: number[] = [];
    for (const c of cohorts) {
      const h = c.active ? soh((i - c.start) / 12, c.efc, 1) : 0;
      if (c.active && h < DE_TECH.minimumOperatingSoH) c.active = false;
      const u = c.active ? c.bol * h : 0;
      shares.push(u);
      usable += u;
    }
    curve.set(i, usable);
    // the base availability, not the case's: a lower availability or wear stress does not move the contract (spec §3.2)
    const avail = m.opIndex < 12 ? DE_BASE.availabilityYear1 : DE_BASE.availability;
    const discharge = usable * inp.tollerCyclesPerDay * m.days * avail;
    cohorts.forEach((c, j) => {
      if (usable > 0 && c.active) c.efc += (DE_TECH.efcPerAcCycle * discharge * (shares[j]! / usable)) / c.bol;
    });
  }
  return curve;
}

function emptyRow(index: number): DeOpsMonth {
  return {
    index, s: 0, availability: null, usableMWhOpen: null, usableHours: null, contractUsableMWh: null, sohInitial: null, sohAugmentation: null,
    spreadM: null, levelShiftA: null, importFee: null, marketChargeMWh: 0, marketDischargeMWh: 0, tollerDischargeMWh: 0, dischargeMWh: 0,
    efcInitial: null, efcAugmentation: null, salesEur: 0, purchasesEur: 0, marginEur: 0, capturedEur: 0, optimiserFeeEur: 0, marketNetEur: 0,
    availabilityFactor: null, capacityFactor: null, tollFeeAccruedEur: 0, omEur: 0, insuranceEur: 0, leaseEur: 0, meteringEur: 0, adminEur: 0,
    avalEur: 0, auxChargesEur: 0, agnesEur: 0, opexTotalEur: 0, augmentationEur: 0, pcsOverhaulEur: 0, decommissioningEur: 0,
    stackOn: false, reserveHeld: false, wholesaleShare: 0, afrrSliceShare: 0, afrrMw: 0, reserveMultiplier: 0, capRevAfrrEur: 0,
    activationDischargeMWh: 0, activationChargeMWh: 0, intradayUpliftEur: 0,
  };
}

export function runDeOperations(inp: DeInputs, lib: DeLibrary, cal: DeCalendar, capex: DeCapexBuild, s: DeOpsSettings = {}): DeOpsResult {
  const P = inp.powerMW;
  const path = s.spreadPath ?? inp.spreadPath;
  const lbar = lib.manifest.snapshots[inp.snapshot].avgPriceEUR;
  const key = { snapshot: inp.snapshot, duration: inp.durationHours, cycleCap: inp.cycleCap, rte: inp.rte };
  const stress = inp.degradationStress ? DE_TECH.degradationStressFactor : 1;
  const toll = !s.ignoreToll && inp.tollEnabled && inp.tollShare > 0 && cal.tollFirst !== null;
  const curve = toll ? contractCurve(inp, cal, capex) : new Map<number, number>();
  const usableBoL = capex.usableAcMWh;
  const cohorts = [{ bol: usableBoL, start: cal.codIndex, efc: 0, active: true }];
  const lowest = lib.manifest.axes.usableHours[String(inp.durationHours)]?.[0] ?? Infinity;
  const months: DeOpsMonth[] = [];
  let unsupported: string | null = null;
  let retiredBelowGrid = false;
  let maxTollFeeRatio = 0;
  const lastIndex = cal.months.length - 1;
  for (const m of cal.months) {
    const row = emptyRow(m.index);
    months.push(row);
    const y = m.year;
    const f = opexFactor(y);
    if (m.index === lastIndex) row.decommissioningEur = inp.decommissioningPerKwh * usableBoL * 1000 * f;
    if (m.phase !== "operation") continue;
    // lifecycle at the start of the month
    if (m.index === cal.augmentationIndex) {
      const addDcMWh = inp.augmentationDcShare * capex.nameplateDcMWh;
      cohorts.push({ bol: addDcMWh / DE_TECH.nameplateFactor, start: m.index, efc: 0, active: true });
      row.augmentationEur = inp.augmentationPrice * addDcMWh * 1000 * f;
    }
    if (m.index === cal.pcsOverhaulIndex) row.pcsOverhaulEur = inp.pcsOverhaulPerMw * P * f;
    // usable energy at the start of the month
    let usable = 0;
    const shares: number[] = [];
    cohorts.forEach((c, j) => {
      const h = c.active ? soh((m.index - c.start) / 12, c.efc, stress) : 0;
      if (c.active && h < DE_TECH.minimumOperatingSoH) c.active = false;
      const u = c.active ? c.bol * h : 0;
      shares.push(u);
      usable += u;
      if (j === 0) row.sohInitial = c.active ? h : 0;
      if (j === 1) row.sohAugmentation = c.active ? h : 0;
    });
    row.usableMWhOpen = usable;
    row.usableHours = usable / P;
    const avail = m.opIndex < 12 ? inp.availabilityYear1 : inp.availability;
    row.availability = avail;
    const sm = toll && cal.tollLast !== null && m.index >= cal.tollFirst! && m.index <= cal.tollLast ? inp.tollShare : 0;
    row.s = sm;
    // shares of the merchant slice q = 1 − s (spec R3.1 §1.2): aFRR from reserveStartIndex in held years
    const q = 1 - sm;
    let fA = 0;
    if (s.stack) {
      row.stackOn = true;
      row.reserveHeld = s.stack.held.get(y) ?? false;
      row.reserveMultiplier = reserveMultiplier(inp.reservePath, y);
      if (m.index >= s.stack.reserveStartIndex && row.reserveHeld) fA = inp.afrrShare;
    }
    row.wholesaleShare = q * (1 - fA);
    row.afrrSliceShare = q * fA;
    // market slice: price transform and the signed effective fee (§2.2–§2.4)
    const M = spreadM(inp, path, y);
    const { a, fee } = effectiveFee(inp, lbar, M, y);
    row.spreadM = M;
    row.levelShiftA = a;
    row.importFee = fee;
    let fld = { salesEUR: 0, purchasesEUR: 0, importMWh: 0, exportMWh: 0 };
    if (row.usableHours < lowest - 1e-9) retiredBelowGrid = true;
    else if (q > 0) {
      try {
        fld = deMonthFields(lookupDe(lib, key, row.usableHours, fee, s.lowerNode ?? false), m.month);
      } catch (e) {
        if (!(e instanceof UnsupportedLibraryInput)) throw e;
        unsupported ??= `${m.year}-${String(m.month).padStart(2, "0")}: ${e.message}`;
      }
    }
    const slice = P * row.wholesaleShare * avail;
    const I = fld.importMWh * slice;
    const O = fld.exportMWh * slice;
    row.marketChargeMWh = I;
    row.marketDischargeMWh = O;
    const ix = idxDE(y);
    row.salesEur = (M * fld.salesEUR * slice + a * O) * ix;
    row.purchasesEur = (M * fld.purchasesEUR * slice + a * I) * ix;
    row.marginEur = row.salesEur - row.purchasesEur;
    row.capturedEur = inp.captureFactor * Math.max(row.marginEur, 0) + Math.min(row.marginEur, 0);
    if (s.stack) {
      // aFRR capacity offered on the energy at the start of the month, its revenue and activation (§1.3, §3.3, §4)
      if (fA > 0) {
        const hours = 24 * m.days;
        row.afrrMw = row.afrrSliceShare * P * afrrEnergyFactor(row.usableHours!);
        row.capRevAfrrEur = row.afrrMw * reserveRatePerMwh(inp, y) * inp.reserveRealisation * hours * avail;
        row.activationDischargeMWh = row.afrrMw * inp.activationShare * hours * avail;
        row.activationChargeMWh = row.activationDischargeMWh;
      }
      // the intraday uplift on the positive captured wholesale margin, from the COD (§5.2)
      row.intradayUpliftEur = inp.intradayUplift * Math.max(row.capturedEur, 0);
    }
    // one fee on the positive parts (§5.3); without a stack the added terms are 0 and the R2.4 values are kept exactly
    row.optimiserFeeEur = inp.optimiserFeeRate * (Math.max(row.capturedEur, 0) + row.intradayUpliftEur + row.capRevAfrrEur);
    row.marketNetEur = row.capturedEur + row.intradayUpliftEur + row.capRevAfrrEur - row.optimiserFeeEur;
    // toll (§3.2) and the toller's discharge (§3.4)
    if (sm > 0) {
      const contract = curve.get(m.index)!;
      row.contractUsableMWh = contract;
      row.availabilityFactor = Math.min(1, avail / inp.tollAvailabilityGuarantee);
      row.capacityFactor = Math.min(1, usable / contract);
      row.tollFeeAccruedEur = (sm * P * inp.tollPrice) / 12 * row.availabilityFactor * row.capacityFactor;
      const contractual = (sm * P * inp.tollPrice) / 12;
      if (contractual > 0) maxTollFeeRatio = Math.max(maxTollFeeRatio, row.tollFeeAccruedEur / contractual);
      row.tollerDischargeMWh = sm * usable * inp.tollerCyclesPerDay * m.days * avail;
    }
    row.dischargeMWh = O + row.tollerDischargeMWh + row.activationDischargeMWh;
    cohorts.forEach((c, j) => {
      if (usable > 0 && c.active) c.efc += (DE_TECH.efcPerAcCycle * row.dischargeMWh * (shares[j]! / usable)) / c.bol;
    });
    row.efcInitial = cohorts[0]!.efc;
    row.efcAugmentation = cohorts[1]?.efc ?? null;
    // OPEX from the actual COD (§5.2), AgNes from 2029 unless grandfathered (§4)
    row.omEur = (inp.omPerMw * P * f) / 12;
    row.insuranceEur = (inp.insuranceRate * capex.insuredValue2026 * f) / 12;
    row.leaseEur = (inp.landLeasePerHa * inp.landHa * f) / 12;
    row.meteringEur = (inp.meteringPerPoint * DE_CAPEX.meteringPoints * f) / 12;
    row.adminEur = (inp.spvAdmin * f) / 12;
    row.avalEur = (inp.avalFeeRate * inp.decommissioningPerKwh * usableBoL * 1000 * f) / 12;
    row.auxChargesEur = (inp.auxChargesPerMw * P * f) / 12;
    row.agnesEur = y >= DE_GRID.agnesStartYear && !cal.grandfatheringApplied ? (inp.agnesFee * P * (idxDE(y) / idxDE(DE_GRID.agnesBaseYear))) / 12 : 0;
    row.opexTotalEur = row.omEur + row.insuranceEur + row.leaseEur + row.meteringEur + row.adminEur + row.avalEur + row.auxChargesEur + row.agnesEur;
  }
  return { months, unsupported, retiredBelowGrid, maxTollFeeRatio };
}

/** Peak daily purchases of the full battery at full energy and zero fee (real 2025 €), for the liquidity reserve (§7.1). */
export function peakDayPurchases(inp: DeInputs, lib: DeLibrary): number {
  const v = lookupDe(lib, { snapshot: inp.snapshot, duration: inp.durationHours, cycleCap: inp.cycleCap, rte: inp.rte }, inp.durationHours, 0);
  return v.peakDayPurchasesEUR * inp.powerMW;
}
