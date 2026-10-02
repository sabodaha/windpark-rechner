// Inputs and results of the BESS engine (v1: Ukraine, day-ahead only). Values default to v1-registry.md.
import type { Connection } from "./capex";
import type { Duration, Snapshot } from "./library";
import type { ScenarioId } from "./registry";

export type PathCurrency = "EUR" | "UAH";

export interface BessInputs {
  powerMW: number;
  durationH: Duration;
  rte: number;
  cycleCap: number;
  augmentation: boolean;
  connection: Connection;
  codDelayMonths: number;
  scenario: ScenarioId;
  snapshot: Snapshot;
  pathCurrency: PathCurrency;
  captureFactor: number;
  optimiserFeeRate: number;
  capexFactor: number;
  lossRatio: number;
  insurance: boolean;
  coverAvailable: boolean;
  stateBudgetAvailable: boolean;
  debt: boolean;
  interestRate: number;
  targetDscr: number;
  maxGearing: number;
  fxStress: boolean;
  auxStress: boolean;
  degradationStress: boolean;
  equityHurdle: number;
  projectDiscountRate: number;
  /** Liquidation transfers to the investor: under the monthly NBU cap (base) or blocked (stress, spec §13). */
  terminalRemittance: "capped" | "blocked";
}

/** Funding fixed at financial close; stresses reuse it instead of re-sizing (model-spec §11, F19). */
export interface LockedFunding {
  /** Senior balance at COD (draws plus capitalised IDC), EUR. */
  debtEur: number;
  /** Scheduled principal per debt period, EUR. */
  principalEur: number[];
  dsraInitialEur: number;
  liquidityReserveUah: number;
  sizingStatus: "converged" | "failed" | "noDebt";
  iterations: number;
}

export interface CheckResult {
  id: string;
  group: "inputs" | "data" | "physical" | "integrity" | "funding" | "covenant" | "scope";
  status: "pass" | "fail" | "warning" | "notApplicable" | "outOfScope";
  value?: number;
  note?: string;
}

export interface Metric {
  value: number | null;
  /** `notApplicable`: the metric has no meaning in this case (cover ratios without a loan). `unfunded` is used for the
   *  investor IRR only; project IRRs classify their signed cash flows mathematically (U10). */
  status: "valid" | "ambiguous" | "notDefined" | "unfunded" | "notApplicable";
  /** IRRs only: every root found in the search domain (several when `ambiguous`). */
  roots?: number[];
}

export interface AnnualRow {
  year: number;
  deliveredMWh: number;
  sohInitial: number;
  usableHoursEnd: number;
  pfMarginEur: number;
  capturedMarginEur: number;
  optimiserFeeEur: number;
  netRevenueEur: number;
  opexEur: number;
  tariffsEur: number;
  warExpectedEur: number;
  ebitdaEur: number;
  taxPaidEur: number;
  lifecycleCapexEur: number;
  cfadsEur: number;
  debtServiceEur: number;
  dividendsGrossEur: number;
  investorNetEur: number;
  cashInSpvEur: number;
}

export interface BessResult {
  inputs: BessInputs;
  funding: LockedFunding;
  kpis: Record<string, Metric>;
  periods: { day: number; cfadsEur: number; debtServiceEur: number; dscr: number | null; balanceEur: number }[];
  lenderPeriods: { cfadsEur: number; debtServiceEur: number; dscr: number | null }[];
  annual: AnnualRow[];
  checks: CheckResult[];
  returnsMeaningful: boolean;
  capexAllInEur: number;
  investorFlows: { day: number; amount: number }[];
  /** Dated audit series, only with `RunOptions.detail`. */
  detail?: {
    projectPreTax: { day: number; amount: number }[];
    projectPostTax: { day: number; amount: number }[];
    cfadsMonthly: { day: number; amount: number }[];
    dividendAllocations: { day: number; grossUah: number; byYear: Record<number, number> }[];
    remittanceTail: { day: number; year: number; grossDividendUah: number; netEur: number; leftUah: number; fx: number }[];
    equityByMonth: { day: number; amount: number }[];
    pnlMonthlyUah: { operating: number[]; depreciation: number[]; interest: number[]; fxDiff: number[]; taxPaid: number[] };
  };
}
