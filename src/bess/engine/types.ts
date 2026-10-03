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
  /** v1.1a: an Ukrenergo special-auction contract for symmetric aFRR (spec v1.1 R2). Absent or disabled: v1 exactly. */
  contract?: ContractInputs;
}

/** The v1.1a contract inputs (spec v1.1 R2 §17). Prices are EUR per MW-hour of availability; shares are fractions. */
export interface ContractInputs {
  enabled: boolean;
  /** Reserve product; v1.1a supports only symmetric aFRR (absent = symmetric aFRR). */
  product?: "aFRR-symmetric" | "aFRR-up" | "aFRR-down" | "FCR" | "mFRR" | "RR";
  /** Awarded MW, an integer (C). */
  acceptedMW: number;
  /** Award price, EUR/(MW·h): the UAH bid divided by the auction month's average NBU rate (p_c). */
  eurPerMWHour: number;
  /** Auction month after financial close (0 = the FC month). */
  auctionMonthOffset: number;
  /** Contractual service start after the planned COD month (1 = the next month). */
  startOffsetFromCod: number;
  /** Awarded tenor, months (13–60). */
  tenorMonths: number;
  /** Sustained full activation each way, hours (h ≥ 1). */
  sustainHours: number;
  /** Recovery power margin as a share of C (ρ). */
  recoveryPowerShare: number;
  /** Peak-day activation multiple of the monthly average (φ_day). */
  peakDayFactor: number;
  /** Physical activation, MWh per MW of reserve per hour, up and down (α). */
  activationUp: number;
  activationDown: number;
  /** Share of physical energy left after within-hour netting (ν). */
  nettingShare: number;
  /** Balancing-energy price premia on the month's price level (β). */
  balancingPremiumUp: number;
  balancingPremiumDown: number;
  /** BSP settlement within a service month: eligible offset (base) or a no-offset cash stress. */
  settlementRegime: "offset" | "noOffset";
  /** Months from the service month to collecting a positive BSP residual (L_bal). */
  balancingLagMonths: number;
  /** Share of the BSP residual receivable collected (κ). */
  balancingCollection: number;
  /** Months from the service month to collecting the availability fee. */
  asPaymentLagMonths: number;
  /** Days of reserve purchases and BSP payables in the contract liquidity reserve. */
  liquidityDays: number;
  /** Unrelieved failure events per year (n_ev) and paid hours in each event's window (L_ev). */
  failureEvents: number;
  penaltyHours: number;
  /** Fee-only balancing non-compliance sensitivity: share of settled energy (δ). */
  bsFeeShare: number;
  /** A damaging strike ends the award (base) or suspends it until repair. */
  onHit: "terminated" | "suspended";
  /** Other loss of the award (certificate, delisting), per year (λ_o). */
  otherLossRate: number;
  /** Continuous standing load of the reserve as a share of C. */
  standingLoadShare: number;
  /** Penalties, escrow retention and bad debt reduce the taxable profit. */
  deductible: boolean;
  /** A hypothetical second award after the first (renewal, A2). */
  renewal: boolean;
  renewalPrice: number;
  renewalTenorMonths: number;
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
  /** v1.1a, contract runs only: operating cash of the reserve lines with VAT, as it enters CFADS (spec v1.1 §9). */
  contractNetEur?: number;
}

/** v1.1a contract summary of a run (spec v1.1 R2 §11–§13). Money in EUR. */
export interface ContractResult {
  delay: number;
  cancelled: boolean;
  effectiveStart: string | null;
  lastService: string | null;
  awards: { tag: string; start: string; endExclusive: string; eurPerMWHour: number; capEur: number }[];
  /** First full operating year (2029), EUR per MW of site power (spec §13). */
  bridge2029PerMW: {
    capacity: number;
    daNet: number;
    upEnergy: number;
    downEnergy: number;
    restoration: number;
    penalties: number;
    feesAndLoad: number;
    networkIncrement: number;
    net: number;
  };
  /** Debt periods: the contract and merchant buckets and the R24 budget. */
  buckets: { day: number; contractEur: number; merchantEur: number; budgetEur: number }[];
  /** Contract bucket over company CFADS in the initial award's months; null when not meaningful. */
  contractShare: number | null;
  /** For the interface: the award's money and physics at a glance (not part of the acceptance export). */
  summary: {
    acceptedMW: number;
    /** Highest balances of the escrow and of the contract liquidity reserve, EUR at each month's rate (spec §7). */
    escrowPeakEur: number;
    liquidityPeakEur: number;
    /** Energy stock bought before the first service hour, commodity without VAT, EUR (spec §4). */
    fillEur: number;
    /** The sponsor's calls for the escrow, the liquidity reserve and the fill, EUR (spec §7). */
    sponsorCallsEur: number;
    /** Largest share of the battery a unit of awarded mass takes (σ*) in a service or transition month (spec §3). */
    sigmaStarMax: number;
    /** Average share left to day-ahead trading in 2029 (σ_a); null without operating months in 2029. */
    daShare2029: number | null;
    /** Hours to restore the stock after a full command up and down (spec §3). */
    recoveryHoursUp: number;
    recoveryHoursDown: number;
    /** Highest use of the peak-day quota (а) on a service day: left side over the limit. */
    quotaUseMax: number;
  };
}

/** The case's primary status (spec v1.1 R3 §14): exactly one, the first that applies; `reasons` — the failing checks or
 *  the input rule behind it. */
export interface CaseStatus {
  primary: "ok" | "cancelled" | "inputUnsupported" | "physicallyUnsupported" | "calcError";
  reasons: string[];
}

export interface BessResult {
  inputs: BessInputs;
  status: CaseStatus;
  /** v1.1a: present only for an enabled, supported contract. */
  contract?: ContractResult;
  funding: LockedFunding;
  kpis: Record<string, Metric>;
  periods: { day: number; cfadsEur: number; debtServiceEur: number; dscr: number | null; balanceEur: number }[];
  lenderPeriods: { cfadsEur: number; debtServiceEur: number; dscr: number | null }[];
  annual: AnnualRow[];
  checks: CheckResult[];
  returnsMeaningful: boolean;
  capexAllInEur: number;
  investorFlows: { day: number; amount: number }[];
  /** Internal calendar, contract plan, operations and ledgers, only with `RunOptions.trace` (the acceptance export). */
  trace?: {
    cal: import("./calendar").Calendar;
    plan: import("./reserves").ContractPlan | null;
    lenderPlan: import("./reserves").ContractPlan | null;
    ops: import("./operations").OpsResult;
    ledger: import("./ledger").LedgerResult;
    lenderOps: import("./operations").OpsResult | null;
    lenderLedger: import("./ledger").LedgerResult | null;
    lenderInputs: BessInputs;
  };
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
