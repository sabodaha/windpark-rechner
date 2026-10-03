// Inputs and results of the German pack (spec v1.2 R2). Canonical names as in registry-de.md and fixtures/de-cases.json.

export type DeSnapshot = "DE-2025" | "DE-LTM-2026-09";

export interface DeInputs {
  marketPack: "DE";
  caseName: string;
  powerMW: number;
  durationHours: number;
  rte: number;
  cycleCap: number;
  snapshot: DeSnapshot;
  spreadPath: "reference" | "low" | "high";
  /** k of spec §2.2: M(y) = k · m(y) · n_snap. */
  spreadMultiplierK: number;
  captureFactor: number;
  optimiserFeeRate: number;
  fExchange: number;
  availabilityYear1: number;
  availability: number;
  degradationStress: boolean;
  codDelayMonths: number;
  tollEnabled: boolean;
  tollShare: number;
  tollMonths: number;
  tollPrice: number;
  tollAvailabilityGuarantee: number;
  tollerCyclesPerDay: number;
  agnesFee: number;
  grandfathered: boolean;
  bkzPerKw: number;
  auxChargesPerMw: number;
  dcBlockPerKwhDc: number;
  pcsMvPerKw: number;
  bopEpcPerKw: number;
  substationPerKw: number;
  developmentPerKw: number;
  contingencyShare: number;
  /** Multiplies every CAPEX line except BKZ. */
  capexFactor: number;
  /** Multiplies the development line only (after capexFactor). */
  developmentFactor: number;
  omPerMw: number;
  insuranceRate: number;
  landLeasePerHa: number;
  landHa: number;
  meteringPerPoint: number;
  spvAdmin: number;
  avalFeeRate: number;
  decommissioningPerKwh: number;
  augmentationPrice: number;
  augmentationDcShare: number;
  pcsOverhaulPerMw: number;
  /** Multiplier: 4.0 = 400 %. */
  hebesatz: number;
  afaBatteryYears: number;
  afaPcsYears: number;
  afaSubstationYears: number;
  afaBkzYears: number;
  debt: boolean;
  interestRate: number;
  upfrontFee: number;
  commitmentFee: number;
  repaymentCount: number;
  targetDscrContracted: number;
  targetDscrMerchant: number;
  maxGearing: number;
  lockupDscr: number;
  defaultDscr: number;
  liquidityReserveDays: number;
  stammkapital: number;
  equityHurdle: number;
  projectDiscountRate: number;
  comparisonRate: number;
}

/** Funding fixed by the sizing of a case; stresses reuse it (S1.3 §11, LockedFunding). */
export interface DeLockedFunding {
  debtEur: number;
  /** Scheduled principal per payment date. */
  principalEur: number[];
  dsraInitialEur: number;
  liquidityReserveEur: number;
  sizingStatus: "converged" | "failed" | "noDebt";
  iterations: number;
}

export type DeCheckGroup = "input" | "integrity" | "scope";

export interface DeCheck {
  id: string;
  group: DeCheckGroup;
  status: "pass" | "fail" | "warn" | "notApplicable";
  value?: number | string | null;
}

export interface DeMetric {
  value: number | null;
  status: "valid" | "ambiguous" | "notDefined" | "unfunded" | "notApplicable";
  roots?: number[];
}

export interface DeStatus {
  primary: "inputUnsupported" | "calcError" | "ok";
  reasons: string[];
}
