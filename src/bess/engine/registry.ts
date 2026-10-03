// The frozen v1 parameter set (registry revision S1.3, 2 October 2026). A value that is not here
// is an engine error, not a zero. Money without VAT; "2026 €" means 2026 prices with the stated indexation.

export const REGISTRY_VERSION = "v1-registry S1.3 2026-10-02";

export const CASE = {
  powerMW: 50,
  durationHoursBoL: 2 as 1 | 2 | 4,
  financialClose: "2027-02-01",
  constructionMonths: 12,
  operatingLifeYears: 15,
  settlementHorizonMonths: 3,
  codDelayMonths: 0,
  legacyCohortCodCutoff: "2028-04-30",
  grandfatherEnd: "2037-04-30",
} as const;

export const TECH = {
  rteNodes: [0.85, 0.88, 0.9] as const,
  rteBase: 0.85,
  socWindow: 0.9,
  etaDischargeSizing: Math.sqrt(0.88),
  /** MWh DC nameplate per MWh of usable AC energy at the start of life: 1 / (0.90 × √0.88) = 1.18445. */
  nameplateFactor: 1 / (0.9 * Math.sqrt(0.88)),
  auxStressShareOfPower: 0.01,
  availabilityYear1: 0.95,
  availability: 0.97,
  warrantyCycleCap: 1.5 as 1 | 1.5,
  /** EFC for fade = socWindow × AC delivered / usable AC at start of life (= DC discharged / nameplate DC). */
  efcPerAcCycle: 0.9,
  calendarFade: { coefficient: 0.011, exponent: 0.526 },
  cycleFade: { coefficient: 1.55e-4, exponent: 0.828 },
  minimumOperatingSoH: 0.6,
  degradationStressFactor: 1.3,
  augmentation: { monthAfterCod: 120, dcShareOfInitial: 0.15, priceEurPerKwhDc2026: 86 },
  pcsOverhaul: { monthAfterCod: 144, eurPerMW2026: 30_000 },
  decommissioningEurPerKwhUsable2026: 15,
} as const;

export const REVENUE = {
  anchorTb2Eur: 181.75,
  neighbourTb2Eur2025: 140.52,
  captureFactor: 0.75,
  optimiserFeeRate: 0.1,
  optimiserFixedFeeEurPerMonth: 0,
} as const;

/** Spread multiplier m(y) against the chosen snapshot's spread, in real 2025 €; 2031+ is flat. */
export const SPREAD_PATHS = {
  reference: { 2028: 1.0, 2029: 0.925, 2030: 0.85, 2031: 0.773 },
  low: { 2028: 0.85, 2029: 0.75, 2030: 0.65, 2031: 0.6 },
  high: { 2028: 1.15, 2029: 1.1, 2030: 1.05, 2031: 1.0 },
} as const;
export type ScenarioId = keyof typeof SPREAD_PATHS;

/** Price level L(y), real 2025 €/MWh, all scenarios; 2031+ is flat. */
export const PRICE_LEVEL_EUR = { 2028: 112.6, 2029: 110.4, 2030: 108.1, 2031: 105.9 } as const;

export const CAPEX = {
  dcBlockEurPerKwhDc: 75,
  pcsMvEurPerMW: 60_000,
  /** Part of the PCS/MV price that is MV transformers: not covered by the import VAT relief (N13). */
  mvTransformerEurPerMW: 20_000,
  hvSubstationEurPerMW: 60_000,
  bopCivilFireShare: 0.108,
  emsShare: 0.024,
  epcMarginShare: 0.084,
  connectionFeeUahPerKw: 935,
  line110kVKm: 5,
  line110kVEurPerKm: 76_500,
  /** UAH lines were set at this rate in the book (NBU, 30.09.2026). */
  bookFxUah: 50.93,
  physicalProtectionEur: 1_500_000,
  developmentEurPerMW: 15_000,
  ownersCostShareOfEpc: 0.03,
  contingencyShareOfEpc: 0.05,
  ukrenergoBayExtraEur: 440_000,
  vatRate: 0.2,
  vatRefundLagMonths: 2,
} as const;

export const OPEX = {
  omEurPerKwYear: 9,
  propertyInsuranceRate: 0.004,
  securityUahPerMonth: 52_000,
  spvAdminEurPerYear: 120_000,
  meteringEurPerYear: 3_000,
  landLeaseEurPerHaYear: 1_420,
  landHa: 2.5,
  marketOperatorFeeUahPerMWh: 6.88,
  marketOperatorFeeUahPerMonth: 4_669.71,
  neurcFeeRate: 0.00061,
  brpGuaranteeUah: 2_000_000,
} as const;

export const GRID = {
  transmissionDispatchUahPerMWh2027: 1_047.09,
  distributionClass1UahPerMWh2026: 628.37,
} as const;

export const WAR = {
  marketPremium: 0.08,
  lossRatio: 0.35,
  severity: 0.4,
  downtimeMonths: 6,
  insurancePremiumRate: 0.08,
  deductibleShare: 0.05,
  deductibleMinEur: 250_000,
  insurancePayoutLagMonths: 9,
  stateCompensationCapUah: 5_000_000,
  stateCompensationFeeUah: 5_000,
  stateCompensationLagMonths: 3,
} as const;

export const FINANCE = {
  interestRate: 0.08,
  upfrontFeeRate: 0.01,
  commitmentFeeRate: 0.005,
  maturity: "2037-02-01",
  firstRepayment: "2028-08-01",
  targetDscrMerchant: 1.75,
  targetDscrContracted: 1.35,
  maxGearing: 0.6,
  lockupDscr: 1.15,
  defaultDscr: 1.05,
  liquidityReserveDays: 3,
  sizingDamping: 0.5,
  sizingMaxIterations: 100,
  sizingTolerance: 0.01,
} as const;

export const TAX = {
  citRate: 0.18,
  annualFilerRevenueThresholdUah: 40_000_000,
  dividendWht: 0.05,
  interestWht: 0,
} as const;

export const MACRO = {
  /** Annual-average EUR/UAH; 2025 is actual (NBU), later years from B-UM04; +2.9 % a year after 2029. */
  fxEurUah: { 2025: 47.09, 2026: 51.5, 2027: 54.6, 2028: 57.0, 2029: 58.8 } as Record<number, number>,
  fxGrowthAfter: 0.029,
  fxStress: 0.1,
  hicp: { 2026: 0.03, 2027: 0.025, 2028: 0.021 } as Record<number, number>,
  hicpAfter: 0.02,
  uaCpi: { 2026: 0.082, 2027: 0.083, 2028: 0.056 } as Record<number, number>,
  uaCpiAfter: 0.05,
  repatriationCapEurPerMonth: 1_000_000,
  equityHurdle: 0.15,
  projectDiscountRate: 0.1,
} as const;

/** v1.1a reserve contract rules and defaults (spec v1.1 R2 §17). */
export const RESERVE = {
  /** Performance security per awarded MW, EUR, posted as cash in the AS escrow (MR 3.18.11–3.18.12). */
  collateralEurPerMW: 30_000,
  /** Approved late start: +20 % security, the TSO keeps 25 % of the increased amount per month (MR 3.18.16). */
  deferralTopUpShare: 0.2,
  deferralRetentionPerMonth: 0.25,
  deferralMaxMonths: 4,
  /** aFRR availability non-compliance factor (MR 5.22.1). */
  penaltyFactorAfrr: 2,
  /** Re-certification, EUR in 2026 prices, indexed with euro inflation; certificate valid 60 months (TSC Annex 7, I.7.1). */
  certificateCostEur2026: 15_000,
  certificateMonths: 60,
  /** Special-auction cap for symmetric aFRR, UAH per MW-hour (Ukrenergo, caps for 2027; frozen scenario). */
  auctionCapUah: 1339.82,
  minTenorMonths: 13,
  maxTenorMonths: 60,
  maxDeferralMonths: 36,
  minSustainHours: 1,
  /** Longest settlement day, hours (the autumn DST change): the conservative energy bound of a service day. */
  longestDayHours: 25,
  /** Shortest settlement day, hours (the spring DST change): the conservative bound of a fill or exit day (spec R3 §3). */
  transitionDayHours: 23,
  /** p* diagnostic domain and stopping rules (spec R3 §12). */
  pStarDomain: [0, 40] as const,
  pStarStep: 1,
  pStarResidualEur: 1,
  pStarBracket: 0.001,
  pStarMaxBisections: 80,
} as const;

export const CONTRACT_DEFAULTS = {
  enabled: true,
  acceptedMW: 40,
  eurPerMWHour: 17,
  auctionMonthOffset: 0,
  startOffsetFromCod: 1,
  tenorMonths: 60,
  sustainHours: 1,
  recoveryPowerShare: 0.1,
  peakDayFactor: 2,
  activationUp: 0.05,
  activationDown: 0.05,
  nettingShare: 0.5,
  balancingPremiumUp: 0,
  balancingPremiumDown: 0,
  settlementRegime: "offset" as const,
  balancingLagMonths: 12,
  balancingCollection: 1,
  asPaymentLagMonths: 1,
  liquidityDays: 3,
  failureEvents: 2,
  penaltyHours: 1,
  bsFeeShare: 0,
  onHit: "terminated" as const,
  otherLossRate: 0,
  standingLoadShare: 0,
  deductible: true,
  renewal: false,
  renewalPrice: 17,
  renewalTenorMonths: 60,
};

/** Illustrative award presets by battery duration (spec §3, V03); each is validated against C_max. */
export const CONTRACT_PRESET_MW: Record<1 | 2 | 4, number> = { 1: 20, 2: 40, 4: 45 };

export const ENGINE = {
  absToleranceMoney: 0.01,
  /** RTE × bought − delivered per month after Float32 storage, MWh at 50 MW (M03); scales with power. */
  storageToleranceEnergyPer50MW: 1e-3,
  irrNpvResidual: 1,
  breakEvenDomain: [0.5, 3.0] as const,
} as const;
