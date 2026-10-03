// The German parameter set (registry-de.md, spec v1.2 R2, 3 October 2026). A name that is not here is an engine error,
// not a zero and not a Ukrainian value. Money without VAT; "2026 €" means 2026 prices indexed with idxDE.
import type { DeInputs } from "./types";

export const DE_REGISTRY_VERSION = "registry-de R2 2026-10-03";

/** The base case (registry CASE … DIST), the `base` of fixtures/de-cases.json. */
export const DE_BASE: DeInputs = {
  marketPack: "DE",
  caseName: "Batteriespeicher Musterfeld",
  powerMW: 50,
  durationHours: 2,
  rte: 0.85,
  cycleCap: 1.5,
  snapshot: "DE-2025",
  spreadPath: "reference",
  spreadMultiplierK: 1,
  captureFactor: 0.75,
  optimiserFeeRate: 0.1,
  fExchange: 0,
  availabilityYear1: 0.95,
  availability: 0.97,
  degradationStress: false,
  codDelayMonths: 0,
  tollEnabled: true,
  tollShare: 0.8,
  tollMonths: 84,
  tollPrice: 120_000,
  tollAvailabilityGuarantee: 0.95,
  tollerCyclesPerDay: 1.5,
  agnesFee: 5000,
  grandfathered: false,
  bkzPerKw: 135,
  auxChargesPerMw: 2000,
  dcBlockPerKwhDc: 75,
  pcsMvPerKw: 70,
  bopEpcPerKw: 100,
  substationPerKw: 100,
  developmentPerKw: 160,
  contingencyShare: 0.05,
  capexFactor: 1,
  developmentFactor: 1,
  omPerMw: 10_000,
  insuranceRate: 0.005,
  landLeasePerHa: 25_000,
  landHa: 1,
  meteringPerPoint: 3500,
  spvAdmin: 150_000,
  avalFeeRate: 0.0125,
  decommissioningPerKwh: 10,
  augmentationPrice: 86,
  augmentationDcShare: 0.15,
  pcsOverhaulPerMw: 30_000,
  hebesatz: 4,
  afaBatteryYears: 15,
  afaPcsYears: 20,
  afaSubstationYears: 20,
  afaBkzYears: 20,
  debt: true,
  interestRate: 0.056,
  upfrontFee: 0.015,
  commitmentFee: 0.005,
  repaymentCount: 20,
  targetDscrContracted: 1.15,
  targetDscrMerchant: 2,
  maxGearing: 0.8,
  lockupDscr: 1.1,
  defaultDscr: 1,
  liquidityReserveDays: 3,
  stammkapital: 25_000,
  equityHurdle: 0.12,
  projectDiscountRate: 0.08,
  comparisonRate: 0.12,
};

/** Presets that follow the duration (de-cases.json durationPresets): applied unless the case sets the field itself. */
export const DE_DURATION_PRESETS: Record<2 | 4, Partial<DeInputs>> = {
  2: { omPerMw: 10_000, bopEpcPerKw: 100, developmentPerKw: 160, landHa: 1, tollPrice: 120_000 },
  4: { omPerMw: 16_000, bopEpcPerKw: 150, developmentPerKw: 180, landHa: 1.5, tollPrice: 150_000 },
};

/** Variant presets (de-cases.json variantPresets). */
export const DE_VARIANTS = {
  merchant: { tollEnabled: false, debt: false, equityHurdle: 0.15, projectDiscountRate: 0.1 },
  tollNoDebt: { debt: false },
} satisfies Record<string, Partial<DeInputs>>;

export const DE_CASE = {
  financialClose: "2027-02-01",
  constructionMonths: 12,
  operatingLifeYears: 15,
  settlementHorizonMonths: 3,
  /** §118(6) EnWG: commissioned by this date (registry GRID grandfatheringDeadline). */
  grandfatheringDeadline: "2029-08-04",
  /** First repayment; payments every six months (registry FIN). */
  firstRepayment: "2028-08-01",
  /** With debt the first payout is not before this date (two completed periods, registry DIST). */
  firstDistributionWithDebt: "2029-02-01",
  /** The first semi-annual distribution date of the calendar (without debt it applies directly). */
  firstDistributionDate: "2028-08-01",
} as const;

export const DE_TECH = {
  socWindow: 0.9,
  /** 1 / (0.90 × √0.88), computed exactly (registry TECH). */
  nameplateFactor: 1 / (0.9 * Math.sqrt(0.88)),
  efcPerAcCycle: 0.9,
  calendarFade: { coefficient: 0.011, exponent: 0.526 },
  cycleFade: { coefficient: 1.55e-4, exponent: 0.828 },
  minimumOperatingSoH: 0.6,
  degradationStressFactor: 1.3,
  augmentationMonthAfterCod: 120,
  pcsOverhaulMonthAfterCod: 144,
} as const;

/** Spread multiplier m(y) against the snapshot's spread, real 2025 €; 2031+ is flat (registry SCEN, G02). */
export const DE_SPREAD_PATHS = {
  reference: { 2028: 1.0, 2029: 1.0, 2030: 1.0, 2031: 1.0 },
  low: { 2028: 0.85, 2029: 0.75, 2030: 0.65, 2031: 0.6 },
  high: { 2028: 1.185, 2029: 1.123, 2030: 1.062, 2031: 1.0 },
} as const;
export type DeSpreadPath = keyof typeof DE_SPREAD_PATHS;

export const DE_REVENUE = {
  /** TB2 of the snapshots, € per MW (registry REV anchorTb2 / ltmTb2): n_snap = anchor / snapshot, exactly. */
  tb2: { "DE-2025": 84_737.51, "DE-LTM-2026-09": 97_716.57 } as const,
  feeAxis: [-15, 35] as const,
  feeAxisTolerance: 1e-9,
} as const;

export const DE_TOLL = {
  paymentLagMonths: 1,
  vatRate: 0.19,
  /** Shown next to T* (Terralayr, 15.10.2025), not a model input. */
  marketRange: [110_000, 150_000] as const,
} as const;

export const DE_GRID = {
  agnesStartYear: 2029,
  /** AgNes is nominal in 2029 and indexed with idxDE from 2030 (K15). */
  agnesBaseYear: 2029,
  grandfatheringYears: 20,
  /** BKZ payments by construction month (0-based: months 1, 3 and 12 of the model). */
  bkzSchedule: [[0, 0.5], [2, 0.3], [11, 0.2]] as [number, number][],
} as const;

export const DE_CAPEX = {
  vatRate: 0.19,
  vatRefundLagMonths: 2,
  /** DC, PCS, BoP, substation, contingency: 20 % month 1, 50 % months 4–9, 30 % month 12 (0-based indices). */
  epcSchedule: [[0, 0.2], [3, 0.5 / 6], [4, 0.5 / 6], [5, 0.5 / 6], [6, 0.5 / 6], [7, 0.5 / 6], [8, 0.5 / 6], [11, 0.3]] as [number, number][],
  meteringPoints: 1,
} as const;

export const DE_TAX = {
  /** §4h (2) a) EStG: the exemption holds only below this net interest. */
  interestBarrierThreshold: 3_000_000,
  kstPrepaymentMonths: [3, 6, 9, 12] as const,
  gewPrepaymentMonths: [2, 5, 8, 11] as const,
} as const;

export const DE_FINANCE = {
  sizingDamping: 0.5,
  sizingMaxIterations: 100,
  sizingTolerance: 0.01,
} as const;

export const DE_ENGINE = {
  absToleranceMoney: 0.01,
  tStarGrid: { from: 0, to: 500_000, step: 25_000 } as const,
  tStarMaxDivisions: 60,
  kDomain: [0.5, 3.0] as const,
} as const;

/** idxDE: German HICP, idxDE(2025) = 1 (registry MACRO): 2.9 % (2026), 2.7 % (2027), 1.9 % (2028), then 2.0 %. */
export const DE_MACRO = { hicp: { 2026: 0.029, 2027: 0.027, 2028: 0.019 } as Record<number, number>, hicpAfter: 0.02 } as const;

export function idxDE(year: number): number {
  let v = 1;
  for (let y = 2026; y <= year; y++) v *= 1 + (DE_MACRO.hicp[y] ?? DE_MACRO.hicpAfter);
  return v;
}
