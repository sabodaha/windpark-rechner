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
    /** EEG 2027 draft: premium becomes two-sided (payback when the market value exceeds the AW). */
    twoSidedPremium: boolean;
    receivableDays: number;
    /** § 6 EEG payment to municipalities, ct/kWh. */
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

/** Multipliers used by the P90 and downside scenarios. 1 = no change. */
export interface ScenarioAdjustments {
  energyScale: number;
  priceScale: number;
  opexScale: number;
  capexScale: number;
}

/** A loan fixed at its base-case size — the lender's view after financial close. */
export interface LockedDebt {
  amount: number;
  principalByYear: Record<number, number>;
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
  awEurKwh: number;
  premiumEurKwh: number;
  revenueMarket: number;
  revenuePremium: number;
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
  receivables: number;
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
  distribution: number;
  taxesUnlevered: number;
  projectCashFlowPreTax: number;
  projectCashFlowPostTax: number;
  provision: number;
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

export interface Check {
  id: string;
  ok: boolean;
  severity: CheckSeverity;
  value: number | string | null;
  detail: string;
}

export interface SourcesUses {
  capex: number;
  upfrontFee: number;
  commitmentFee: number;
  interestDuringConstruction: number;
  vatInterest: number;
  dsraInitial: number;
  totalUses: number;
  debt: number;
  equity: number;
  totalSources: number;
}

/** What limited the loan, and the DSCRs in the lender's case (floor or base prices). */
export interface SizingInfo {
  bankPriceBasis: BankPriceBasis;
  minBankDscrP50: number | null;
  minBankDscrP90: number | null;
  binding: "dscrP50" | "dscrP90" | "gearing" | "locked" | "none";
}

export interface ModelResult {
  sizing: SizingInfo;
  timeline: {
    financialClose: IsoDate;
    cod: IsoDate;
    endOfLife: IsoDate;
    eegEnd: IsoDate;
    loanMaturity: IsoDate;
  };
  construction: ConstructionMonth[];
  annual: AnnualRow[];
  sourcesUses: SourcesUses;
  kpis: Kpis;
  checks: Check[];
  lockedDebt: LockedDebt;
  iterations: number;
  converged: boolean;
}
