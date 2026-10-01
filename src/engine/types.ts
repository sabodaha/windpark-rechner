import type { EngineTrace } from "./trace";

/** Calendar date as ISO string "YYYY-MM-DD" (UTC, no time of day). */
export type IsoDate = string;

export type RepaymentProfile = "linear" | "annuity" | "sculpted";
export type LegalForm = "KG" | "GmbH";
export type PostEegMode = "market" | "ppa";
/** Revenue the lender counts on when sizing the loan: the EEG floor or the full base-case prices. */
export type BankPriceBasis = "floor" | "base";
/** How a capex item is spread over the construction months. */
export type PaymentProfile = "atStart" | "linear" | "thirds" | "turbine";

export interface YearValue {
  year: number;
  value: number;
}

export interface CapexItem {
  key: string;
  /** Nominal €/kW at financial close, net of VAT. */
  eurPerKw: number;
  profile: PaymentProfile;
}

/**
 * All inputs of the model. Monetary inputs are nominal unless the name says which year's prices
 * they are in (e.g. `...2026` = in 2026 prices, indexed with CPI from there).
 */
export interface Inputs {
  project: {
    turbines: number;
    turbineMw: number;
    hubHeightM: number;
    rotorDiameterM: number;
    financialClose: IsoDate;
    constructionMonths: number;
    lifetimeYears: number;
  };
  energy: {
    /** Full-load hours of the turbine type at the EEG reference site (100 %). */
    referenceYieldHours: number;
    /** Gütefaktor as a fraction (0.68 = 68 %): site yield / reference yield. */
    siteQuality: number;
    /** Site in the EEG "Südregion" (Anlage 5): correction factors below 60 % apply. */
    southRegion: boolean;
    /** Technical availability. The Standortertrag already contains 98 %. */
    availability: number;
    /** Further losses not contained in the Standortertrag. */
    otherExtraLosses: number;
    degradationPerYear: number;
    sigma1y: number;
    sigma10y: number;
    /** Share of output falling into negative-price periods (no premium, plant curtailed). */
    negativePriceOutputShare: number;
    /** Share of time with negative prices, used for the § 51a EEG extension of the support period. */
    negativePriceTimeShare: number;
  };
  revenue: {
    /** Zuschlagswert in ct/kWh for the reference site. */
    awardPriceCt: number;
    /** Höchstwert of the tender round, ct/kWh (check only). */
    ceilingPriceCt: number;
    /** EEX Phelix-DE baseload calendar futures, nominal €/MWh. */
    futuresEurMwh: YearValue[];
    /** Baseload price after the futures strip, €/MWh in 2026 prices. */
    longTermBaseEurMwh2026: number;
    /** Marktwertfaktor Wind an Land: annual market value of onshore wind / baseload. */
    captureFactor: number;
    directMarketingCtKwh2026: number;
    postEeg: PostEegMode;
    ppaEurMwh2026: number;
    /**
     * Simplified two-sided premium stress: the plant pays back AW − JW when the market value exceeds the AW.
     * Inspired by the EEG 2027 draft, not its calculation.
     */
    twoSidedPremium: boolean;
    receivableDays: number;
    /** Public announcement of the award (§ 36e, § 55 EEG deadlines run from it). */
    awardNoticeDate: IsoDate;
    /** Months after the year end until the premium true-up (final settlement) is paid. */
    premiumTrueUpLagMonths: number;
    /** Payment to municipalities, ct/kWh; the § 6 EEG refund covers at most 0.2 ct/kWh. */
    municipalCtKwh: number;
    municipalAfterEeg: boolean;
    bankPriceBasis: BankPriceBasis;
  };
  capex: {
    items: CapexItem[];
    contingencyPct: number;
    vatRate: number;
    vatRefundLagMonths: number;
  };
  opex: {
    /** €/kW/yr in 2025 prices for operating years 1–10, 11–20 and 21+. */
    maintenancePerKw: [number, number, number];
    managementPerKw: [number, number, number];
    insurancePerKw: [number, number, number];
    otherPerKw: [number, number, number];
    leaseShareOfRevenue: number;
    leaseMinPerTurbine2026: number;
    /** Decommissioning security per metre of hub height and turbine (Hessen rule), €. */
    decommissioningBondPerMeterHub: number;
    /** Fee for the decommissioning guarantee (Avalprovision), p.a. */
    guaranteeFeeRate: number;
    decommissioningCostPerKw2026: number;
    decommissioningReserveYears: number;
    /** Generator grid fee (BNetzA AgNes proceedings), €/kW/yr in 2026 prices. */
    gridFeePerKw2026: number;
  };
  financing: {
    interestRate: number;
    tenorYearsFromClose: number;
    graceYears: number;
    repayment: RepaymentProfile;
    targetDscrP50: number;
    /** Target DSCR in a P90 (1-year) year. */
    targetDscrP90: number;
    covenantDscr: number;
    lockupDscr: number;
    maxGearing: number;
    upfrontFeePct: number;
    commitmentFeePerMonth: number;
    /** First construction month (1-based) in which the commitment fee is charged. */
    commitmentFeeStartMonth: number;
    dsraMonths: number;
    vatFacilitySpread: number;
    equityFirst: boolean;
  };
  tax: {
    legalForm: LegalForm;
    /** Trade-tax multiplier as a factor: 4.0 = 400 %. */
    hebesatz: number;
    depreciationYears: number;
    degressive: boolean;
  };
  macro: {
    /** CPI change in the given year (2026 = change from 2025 to 2026). */
    inflation: YearValue[];
    longRunInflation: number;
    costOfEquity: number;
    waccNominal: number;
    waccReal: number;
  };
}

/** Multipliers used by the stress scenarios. 1 = no change. */
export interface ScenarioAdjustments {
  energyScale: number;
  priceScale: number;
  opexScale: number;
  capexScale: number;
  /**
   * Apply the § 36h (2) EEG site-quality reviews to the stressed yield: the AW is re-determined from year 6,
   * 11 and 16, and the first five years are settled retroactively. Only for multi-year stresses.
   */
  siteQualityReview: boolean;
}

/** The funding plan fixed at financial close: the loan and its instalments, and the start-up liquidity. */
export interface LockedDebt {
  amount: number;
  /** Principal of each scheduled instalment, in date order. */
  instalments: number[];
  /** Start-up liquidity funded at COD. */
  workingCapital: number;
}

export interface ConstructionMonth {
  index: number;
  date: IsoDate;
  capex: number;
  vat: number;
  vatRefund: number;
  vatFacilityBalance: number;
  vatInterest: number;
  upfrontFee: number;
  commitmentFee: number;
  interestDuringConstruction: number;
  dsraFunding: number;
  workingCapitalFunding: number;
  need: number;
  debtDraw: number;
  equityDraw: number;
  debtBalance: number;
}

export interface AnnualRow {
  year: number;
  cashFlowDate: IsoDate;
  operatingYear: number;
  operatingFraction: number;
  eegShare: number;
  energyKwh: number;
  energySoldKwh: number;
  baseEurMwh: number;
  marketValueEurKwh: number;
  /** AW in force during the year's support days (a day-weighted average when a § 36h review falls in the year). */
  awEurKwh: number;
  premiumEurKwh: number;
  revenueMarket: number;
  /** Market premium accrued for the year, incl. any § 36h review settlement. */
  revenuePremium: number;
  /** Retroactive § 36h (2) settlement for the previous five years, included in revenuePremium. */
  siteQualitySettlement: number;
  /** Monthly advances on the premium for the year, based on the previous year's market value (§ 26 EEG). */
  premiumAdvance: number;
  revenuePostEeg: number;
  revenue: number;
  maintenance: number;
  management: number;
  insurance: number;
  otherOpex: number;
  lease: number;
  directMarketing: number;
  municipal: number;
  guaranteeFee: number;
  gridFee: number;
  opex: number;
  municipalRefund: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  provisionChange: number;
  ebt: number;
  tradeTax: number;
  corporateTax: number;
  soli: number;
  taxes: number;
  netIncome: number;
  /** Year-end receivables: market sales (receivable days) plus premium and § 6 refund not yet paid. */
  receivables: number;
  receivablesMarket: number;
  receivablesPremium: number;
  deltaWorkingCapital: number;
  cfads: number;
  principal: number;
  debtService: number;
  debtOpening: number;
  debtClosing: number;
  dscr: number | null;
  dsraBalance: number;
  decommissioningReserve: number;
  trappedCash: number;
  cashDeficit: number;
  decommissioningPaid: number;
  /** Cash available to equity, before legal limits on distributions (§ 30 GmbHG, § 172 (4) HGB). */
  distribution: number;
  taxesUnlevered: number;
  projectCashFlowPreTax: number;
  projectCashFlowPostTax: number;
  provision: number;
  /** Equity in the model balance sheet (contributions − distributions + net income); not an HGB test. */
  bookEquity: number;
  balanceDifference: number;
}

export interface Kpis {
  equityIrr: number | null;
  projectIrrPreTax: number | null;
  projectIrrPostTax: number | null;
  npvEquity: number;
  npvProject: number;
  lcoeRealCt: number;
  lcoeNominalCt: number;
  minDscr: number | null;
  minDscrYear: number | null;
  /** Average DSCR over the years with a repayment (interest-only years excluded). */
  avgDscr: number | null;
  llcr: number | null;
  paybackYears: number | null;
  debt: number;
  equity: number;
  totalUses: number;
  gearing: number;
  capex: number;
  capexPerKw: number;
  awCt: number;
  correctionFactor: number;
  fullLoadHoursP50: number;
  capacityMw: number;
}

export type CheckSeverity = "error" | "warning" | "info";

/**
 * What a check is about. Integrity: the calculation itself (convergence, accounting identities). Funding: can
 * the company pay its obligations. Covenant: the loan terms. Scope: cases the model does not cover fully.
 */
export type CheckGroup = "inputs" | "integrity" | "funding" | "covenant" | "scope";

export interface Check {
  id: string;
  group: CheckGroup;
  ok: boolean;
  severity: CheckSeverity;
  value: number | string | null;
  detail: string;
}

export type ValidityLevel = "ok" | "warning" | "error";

/** One status per check group, and whether the returns mean anything. */
export interface Validity {
  inputs: ValidityLevel;
  integrity: ValidityLevel;
  funding: ValidityLevel;
  covenant: ValidityLevel;
  scope: ValidityLevel;
  /** False when the company runs out of cash or the calculation fails: returns are then not meaningful. */
  returnsMeaningful: boolean;
  /** First year with unfunded cash and the largest unfunded amount. */
  shortfall: { year: number; amount: number } | null;
  /** Year and value of the lowest DSCR, if it is below the covenant. */
  covenantBreach: { year: number; dscr: number } | null;
  /** Years in which distributions were held back (DSCR below the lock-up level). */
  lockUpYears: number[];
}

export interface SourcesUses {
  capex: number;
  upfrontFee: number;
  commitmentFee: number;
  interestDuringConstruction: number;
  vatInterest: number;
  dsraInitial: number;
  /** Start-up liquidity: cash for the receivables of the first operating year (Liquiditätsreserve). */
  workingCapitalInitial: number;
  totalUses: number;
  debt: number;
  equity: number;
  totalSources: number;
}

/** The lender's case year by year: CFADS on the sizing prices at P50 and P90 (1-year) output. */
export interface LenderCase {
  years: number[];
  cfadsP50: number[];
  cfadsP90: number[];
  debtService: number[];
  dscrP50: (number | null)[];
  dscrP90: (number | null)[];
}

/** What limited the loan, and the DSCRs in the lender's case (floor or base prices). */
export interface SizingInfo {
  bankPriceBasis: BankPriceBasis;
  minBankDscrP50: number | null;
  minBankDscrP90: number | null;
  /** cashflow: no loan, because a year of the lender's case has no cash for debt service. */
  binding: "dscrP50" | "dscrP90" | "gearing" | "cashflow" | "locked" | "none";
  lenderCase: LenderCase;
}

export interface ModelResult {
  sizing: SizingInfo;
  timeline: {
    financialClose: IsoDate;
    cod: IsoDate;
    endOfLife: IsoDate;
    eegEnd: IsoDate;
    loanMaturity: IsoDate;
    graceEnd: IsoDate;
    firstInstalment: IsoDate | null;
    awardNotice: IsoDate;
    /** § 36e EEG: the award lapses if the farm is not commissioned by this date. */
    awardLapse: IsoDate;
  };
  /** AW periods: one for the whole support period, or several after § 36h (2) reviews. */
  awPeriods: { start: IsoDate; end: IsoDate; awCt: number; siteQuality: number }[];
  construction: ConstructionMonth[];
  annual: AnnualRow[];
  sourcesUses: SourcesUses;
  kpis: Kpis;
  checks: Check[];
  validity: Validity;
  lockedDebt: LockedDebt;
  iterations: number;
  converged: boolean;
  /** Every intermediate line, when the run was asked for it (RunOptions.trace). */
  trace?: EngineTrace;
}
