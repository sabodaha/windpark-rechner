// The engine trace: every intermediate line of a run, in the order the model computes it. It is the contract
// for the formula workbook and the PDF report — each of their rows is bound to one line here — and it changes
// only together with the engine version.
import type { IsoDate } from "./types";

/** One value per operating year, aligned with ModelResult.annual. */
export type Series = number[];

export interface TimingTrace {
  years: number[];
  /** First operating day in the year and the day after the last one. */
  start: IsoDate[];
  end: IsoDate[];
  opDays: number[];
  daysInYear: number[];
  opMonths: number[];
  fraction: number[];
  eegShare: number[];
  operatingYear: number[];
  /** 0 for operating years 1–10, 1 for 11–20, 2 from 21. */
  decade: number[];
  isLast: boolean[];
  /** The year falls into the decommissioning-reserve window. */
  reserveWindow: boolean[];
  /** Price index against 2025 and 2026. */
  index2025: number[];
  index2026: number[];
  /** Share of the year's support days in each AW period ([year][period]). */
  awWeights: number[][];
  /** Loan months and quarterly instalments in the year. */
  loanMonths: number[];
  instalments: number[];
}

export interface ConstructionTrace {
  /** Payment-profile weights by month for each capex item, plus "contingency". */
  weights: Record<string, number[]>;
  /** Capex by item and month, € net of VAT (after the scenario's capex factor). */
  capexByItem: Record<string, number[]>;
}

export interface OperationsTrace {
  energy: Series;
  sold: Series;
  /** Output eligible for the premium: sold × support share. */
  eligible: Series;
  basePrice: Series;
  marketValue: Series;
  marketValuePrev: Series;
  aw: Series;
  premiumRate: Series;
  advanceRate: Series;
  /** Share of the support days with a positive premium (for the § 6 refund). */
  premiumShare: Series;
  revenueMarket: Series;
  /** Premium for the year before any § 36h settlement. */
  premiumAccrued: Series;
  siteQualitySettlement: Series;
  revenuePremium: Series;
  postEegPrice: Series;
  revenuePostEeg: Series;
  revenue: Series;
  maintenance: Series;
  management: Series;
  insurance: Series;
  other: Series;
  leaseOnRevenue: Series;
  leaseMinimum: Series;
  lease: Series;
  directMarketing: Series;
  municipal: Series;
  guaranteeFee: Series;
  gridFee: Series;
  opex: Series;
  municipalRefund: Series;
  ebitda: Series;
  premiumAdvance: Series;
  /** December's advance, paid on 15 January. */
  decemberAdvance: Series;
  /** True-ups and § 6 refunds whose final settlement is still to come. */
  openSettlements: Series;
  receivablesMarket: Series;
  receivablesPremium: Series;
  receivables: Series;
  deltaWorkingCapital: Series;
}

export interface TaxTrace {
  depreciationBase: number;
  depreciationScheduled: Series;
  residualWriteOff: Series;
  depreciation: Series;
  provision: Series;
  provisionChange: Series;
  interest: Series;
  ebt: Series;
  addBack: Series;
  tradeIncome: Series;
  tradePoolOpen: Series;
  tradeLossUsed: Series;
  tradePoolClose: Series;
  tradeBase: Series;
  tradeTax: Series;
  corporatePoolOpen: Series;
  corporateLossUsed: Series;
  corporatePoolClose: Series;
  corporateTaxable: Series;
  corporateRate: Series;
  corporateTax: Series;
  soli: Series;
  taxes: Series;
  /** EBITDA − change in working capital − taxes of this pass. */
  cfads: Series;
}

export interface LoanMonth {
  /** First day of the month. */
  date: IsoDate;
  year: number;
  /** Index of the instalment paid at the end of the month, or −1. */
  instalment: number;
  opening: number;
  interest: number;
  principal: number;
  closing: number;
}

export interface WaterfallTrace {
  cfads: Series;
  debtService: Series;
  /** Unpaid cash carried from the year before (≤ 0). */
  deficitIn: Series;
  trappedUsed: Series;
  dsraOpen: Series;
  dsraTarget: Series;
  dsraTopUp: Series;
  dsraRelease: Series;
  dsraDraw: Series;
  dsraClose: Series;
  reserveContribution: Series;
  decommissioningPaid: Series;
  reserveClose: Series;
  /** 1 in a lock-up year. */
  lockUp: Series;
  trappedAdded: Series;
  trappedReleased: Series;
  /** DSRA, cash held back and the reserve released in the final year. */
  finalRelease: Series;
  trappedClose: Series;
  deficitOut: Series;
  distribution: Series;
}

export interface StatementsTrace {
  fixedAssets: Series;
  receivables: Series;
  dsra: Series;
  reserve: Series;
  trapped: Series;
  cashDeficit: Series;
  totalAssets: Series;
  debt: Series;
  provision: Series;
  equityContributed: number;
  cumulativeDistributions: Series;
  cumulativeNetIncome: Series;
  bookEquity: Series;
  difference: Series;
}

export interface DatedAmount {
  date: IsoDate;
  amount: number;
}

export interface EngineTrace {
  timing: TimingTrace;
  construction: ConstructionTrace;
  /** The scenario's own operations and taxes. */
  operations: OperationsTrace;
  tax: TaxTrace;
  /** Taxes of the project without debt (project IRR after tax). */
  taxUnlevered: TaxTrace;
  /** The lender's case with the final loan: operations and taxes at P50 and at P90 (1-year) output. */
  lenderP50: OperationsTrace;
  lenderP90: OperationsTrace;
  taxLenderP50: TaxTrace;
  taxLenderP90: TaxTrace;
  loanMonths: LoanMonth[];
  waterfall: WaterfallTrace;
  statements: StatementsTrace;
  flows: { equity: DatedAmount[]; projectPreTax: DatedAmount[]; projectPostTax: DatedAmount[] };
}
