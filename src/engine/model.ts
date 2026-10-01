// The model: monthly construction, annual operations, taxes, debt sizing, cash waterfall, KPIs, checks.
// Pure and deterministic: runModel(inputs) always returns the same result for the same inputs.
import { addMonths, addYears, daysInYear, overlap, parts, toDay, toIso, yearStart } from "./dates";
import {
  anzulegenderWert,
  AWARD_LAPSE_MONTHS,
  AWARD_PENALTY_MONTHS,
  correctionFactor,
  marketPremium,
  MUNICIPAL_REFUND_CAP_CT,
  NEGATIVE_PRICE_COUNT_YEARS,
  SITE_REVIEW_THRESHOLD,
  SITE_REVIEW_YEARS,
  SUPPORT_YEARS,
} from "./eeg";
import { annuityFactor, xirr, xnpv, type DatedFlow } from "./finance";
import { computeTaxes, depreciation, TAX, type TaxResult } from "./tax";
import type {
  AnnualRow,
  Check,
  CheckGroup,
  ConstructionMonth,
  Inputs,
  Kpis,
  LenderCase,
  LockedDebt,
  ModelResult,
  PaymentProfile,
  ScenarioAdjustments,
  SizingInfo,
  SourcesUses,
  Validity,
  ValidityLevel,
} from "./types";
import type { EngineTrace, LoanMonth, OperationsTrace, TaxTrace } from "./trace";
import { InvalidInputsError, validateInputs } from "./validate";

/** Anlage 2 Nr. 7 EEG: up to 2 % unavailability is already part of the Standortertrag. */
export const AVAILABILITY_IN_SITE_YIELD = 0.98;
/** z-value of the 90 % one-sided quantile of a normal distribution. */
export const P90_Z = 1.2816;
const TOLERANCE = 1; // € — accounting checks
const DEBT_TOLERANCE = 0.5; // € — convergence of the debt size
/** € — a loan balance below one cent is repaid with the instalment that leaves it: no dust stays on the books. */
const DEBT_DUST = 0.01;
/** € — debt service below one euro is not material: such a year has no DSCR (engine and workbook alike). */
export const MIN_DEBT_SERVICE = 1;
/** € — a smaller loan is no loan (a lender's case with a year without cash for debt service allows none). */
const MIN_LOAN = 1;

export const NEUTRAL_SCENARIO: ScenarioAdjustments = {
  energyScale: 1,
  priceScale: 1,
  opexScale: 1,
  capexScale: 1,
  siteQualityReview: false,
};

export interface RunOptions {
  scenario?: Partial<ScenarioAdjustments>;
  /** Keep the loan of another run (the stress scenarios after financial close). */
  lockedDebt?: LockedDebt;
  /** Record every intermediate line (for the formula workbook and the report). */
  trace?: boolean;
}

interface YearSlot {
  year: number;
  /** First operating day in the year and the day after the last one. */
  start: number;
  end: number;
  opDays: number;
  /** Whole months in operation: commissioning and the end of life fall on the first of a month. */
  opMonths: number;
  fraction: number;
  eegShare: number;
  cfDay: number;
  operatingYear: number;
  isLast: boolean;
}

/** A stretch of the support period with one AW (several only after § 36h (2) reviews). */
interface AwPeriod {
  start: number;
  end: number;
  aw: number;
  siteQuality: number;
}

/** Contract dates of the loan, from the financial-close date (KfW 270: quarterly equal instalments). */
interface LoanCalendar {
  graceEndDay: number;
  maturityDay: number;
  maturityYear: number;
  firstInstalmentDay: number | null;
  firstRepaymentYear: number;
  /** Loan months from commissioning to the last instalment, grouped by calendar year. */
  monthsByYear: Map<number, { day: number; instalment: number }[]>;
  instalmentCount: number;
  instalmentsByYear: Map<number, number>;
}

interface Context {
  inputs: Inputs;
  adj: ScenarioAdjustments;
  capacityKw: number;
  fcDay: number;
  codDay: number;
  endDay: number;
  eegEndDay: number;
  codYear: number;
  monthDays: number[];
  capexMonthly: number[];
  vat: VatFacility;
  years: YearSlot[];
  loan: LoanCalendar;
  kf: number;
  aw: number;
  awPeriods: AwPeriod[];
  hoursP50: number;
  basePrice: Map<number, number>;
  marketValue: Map<number, number>;
  index: (year: number, base: number) => number;
  /** Start-up liquidity funded at COD: the operating case's receivables at the end of the first year. */
  startWorkingCapital: number;
}

interface VatFacility {
  vat: number[];
  refund: number[];
  balance: number[];
  interest: number[];
  tailInterest: number;
}

// ---------------------------------------------------------------------------------------------
// Context: timeline, prices, energy — everything that does not depend on the loan
// ---------------------------------------------------------------------------------------------

function makeIndex(inputs: Inputs): (year: number, base: number) => number {
  const rates = new Map(inputs.macro.inflation.map((v) => [v.year, v.value]));
  const cum = new Map<number, number>([[2025, 1]]);
  for (let y = 2026; y <= 2100; y++) cum.set(y, cum.get(y - 1)! * (1 + (rates.get(y) ?? inputs.macro.longRunInflation)));
  for (let y = 2024; y >= 2000; y--) cum.set(y, cum.get(y + 1)! / (1 + (rates.get(y + 1) ?? inputs.macro.longRunInflation)));
  return (year, base) => {
    const a = cum.get(year);
    const b = cum.get(base);
    if (a === undefined || b === undefined) throw new Error(`No price index for ${year}/${base}`);
    return a / b;
  };
}

export function profileWeights(profile: PaymentProfile, months: number): number[] {
  const w = new Array<number>(months).fill(0);
  if (months <= 0) return w;
  switch (profile) {
    case "atStart":
      w[0] = 1;
      break;
    case "linear":
      w.fill(1 / months);
      break;
    case "thirds": {
      const a = Math.max(1, Math.floor(months / 3));
      const b = Math.max(1, Math.floor(months / 3));
      const groups: [number, number, number][] = [
        [0, Math.min(a, months), 0.4],
        [Math.min(a, months), Math.min(a + b, months), 0.4],
        [Math.min(a + b, months), months, 0.2],
      ];
      let assigned = 0;
      for (const [s, e, share] of groups) {
        if (e <= s) continue;
        for (let m = s; m < e; m++) w[m] = (w[m] ?? 0) + share / (e - s);
        assigned += share;
      }
      if (assigned < 1) w[months - 1] = (w[months - 1] ?? 0) + (1 - assigned);
      break;
    }
    case "turbine": {
      // 10 % down payment, 70 % on delivery 4–2 months before COD, 20 % at commissioning.
      w[0] = (w[0] ?? 0) + 0.1;
      const delivery = [months - 4, months - 3, months - 2].map((m) => Math.max(0, m));
      for (const m of delivery) w[m] = (w[m] ?? 0) + 0.7 / delivery.length;
      w[months - 1] = (w[months - 1] ?? 0) + 0.2;
      break;
    }
  }
  return w;
}

function buildVatFacility(inputs: Inputs, capexMonthly: number[]): VatFacility {
  const { vatRate, vatRefundLagMonths: lag } = inputs.capex;
  const rate = inputs.financing.interestRate + inputs.financing.vatFacilitySpread;
  const vat = capexMonthly.map((c) => c * vatRate);
  const refund: number[] = [];
  const balance: number[] = [];
  const interest: number[] = [];
  let bal = 0;
  for (let m = 0; m < capexMonthly.length; m++) {
    interest.push((bal * rate) / 12);
    const r = m - lag >= 0 ? vat[m - lag]! : 0;
    refund.push(r);
    bal += vat[m]! - r;
    balance.push(bal);
  }
  // Refunds of the last months arrive after COD; their interest is funded at COD.
  let tailInterest = 0;
  for (let k = 0; k < lag; k++) {
    tailInterest += (bal * rate) / 12;
    const idx = capexMonthly.length - lag + k;
    bal -= idx >= 0 ? vat[idx]! : 0;
  }
  return { vat, refund, balance, interest, tailInterest };
}

/**
 * Loan dates from the financial-close date: interest only until the grace period ends, then 4 equal quarterly
 * instalments a year, each on the last day of a quarter counted from the end of the grace period.
 */
function buildLoanCalendar(inputs: Inputs, fcDay: number, codYearMonth: number, lastOperatingYear: number): LoanCalendar {
  const f = inputs.financing;
  const graceMonths = 12 * f.graceYears;
  const tenorMonths = 12 * f.tenorYearsFromClose;
  const instalmentCount = 4 * (f.tenorYearsFromClose - f.graceYears);
  const monthsByYear = new Map<number, { day: number; instalment: number }[]>();
  const instalmentsByYear = new Map<number, number>();
  let firstRepaymentYear = Infinity;
  for (let j = codYearMonth; j < tenorMonths; j++) {
    const day = addMonths(fcDay, j);
    const year = parts(day).year;
    const sinceGrace = j - graceMonths + 1;
    const instalment = sinceGrace >= 3 && sinceGrace % 3 === 0 ? sinceGrace / 3 - 1 : -1;
    if (!monthsByYear.has(year)) monthsByYear.set(year, []);
    monthsByYear.get(year)!.push({ day, instalment });
    if (instalment >= 0) {
      instalmentsByYear.set(year, (instalmentsByYear.get(year) ?? 0) + 1);
      firstRepaymentYear = Math.min(firstRepaymentYear, year);
    }
  }
  const maturityDay = addMonths(fcDay, tenorMonths) - 1;
  return {
    graceEndDay: addMonths(fcDay, graceMonths),
    maturityDay,
    maturityYear: parts(maturityDay).year,
    firstInstalmentDay: instalmentCount > 0 ? addMonths(fcDay, graceMonths + 3) - 1 : null,
    firstRepaymentYear: Number.isFinite(firstRepaymentYear) ? firstRepaymentYear : lastOperatingYear + 1,
    monthsByYear,
    instalmentCount,
    instalmentsByYear,
  };
}

/**
 * AW periods. Without a review the ex-ante AW applies for the whole support period. With the § 36h (2) review
 * (multi-year stresses), the AW from years 6, 11 and 16 follows the stressed site quality.
 */
function buildAwPeriods(inputs: Inputs, adj: ScenarioAdjustments, codDay: number, eegEndDay: number): AwPeriod[] {
  const e = inputs.energy;
  const exAnte = e.siteQuality;
  const awOf = (q: number) => anzulegenderWert(inputs.revenue.awardPriceCt, correctionFactor(q, e.southRegion));
  if (!adj.siteQualityReview) return [{ start: codDay, end: eegEndDay, aw: awOf(exAnte), siteQuality: exAnte }];
  const reviewed = exAnte * adj.energyScale;
  const bounds = [codDay, ...SITE_REVIEW_YEARS.map((n) => addYears(codDay, n)).filter((d) => d < eegEndDay), eegEndDay];
  return bounds.slice(0, -1).map((start, k) => {
    const q = k === 0 ? exAnte : reviewed;
    return { start, end: bounds[k + 1]!, aw: awOf(q), siteQuality: q };
  });
}

function buildContext(inputs: Inputs, adj: ScenarioAdjustments): Context {
  const p = inputs.project;
  const capacityKw = p.turbines * p.turbineMw * 1000;
  const fcDay = toDay(p.financialClose);
  const codDay = addMonths(fcDay, p.constructionMonths);
  const endDay = addYears(codDay, p.lifetimeYears);
  const supportEnd = addYears(codDay, SUPPORT_YEARS);
  const codYear = parts(codDay).year;
  // § 51a EEG: support is extended by the negative-price periods counted in the commissioning year and the 19
  // calendar years after it, rounded up to whole days.
  const countEnd = Math.min(supportEnd, yearStart(codYear + NEGATIVE_PRICE_COUNT_YEARS));
  const eegEndDay = supportEnd + Math.ceil(inputs.energy.negativePriceTimeShare * (countEnd - codDay));
  const lastYear = parts(endDay - 1).year;
  const index = makeIndex(inputs);

  const monthDays: number[] = [];
  for (let m = 0; m < p.constructionMonths; m++) monthDays.push(addMonths(fcDay, m + 1) - 1);

  const capexMonthly = new Array<number>(p.constructionMonths).fill(0);
  const itemsTotal = inputs.capex.items.reduce((s, it) => s + it.eurPerKw, 0);
  const contingency = itemsTotal * inputs.capex.contingencyPct;
  const spread = (eurPerKw: number, profile: PaymentProfile) => {
    const w = profileWeights(profile, p.constructionMonths);
    w.forEach((x, m) => (capexMonthly[m] = capexMonthly[m]! + x * eurPerKw * capacityKw * adj.capexScale));
  };
  for (const it of inputs.capex.items) spread(it.eurPerKw, it.profile);
  spread(contingency, "linear");

  const years: YearSlot[] = [];
  for (let y = codYear; y <= lastYear; y++) {
    const start = Math.max(codDay, yearStart(y));
    const end = Math.min(endDay, yearStart(y + 1));
    const opDays = end - start;
    const a = parts(start);
    const b = parts(end);
    years.push({
      year: y,
      start,
      end,
      opDays,
      opMonths: (b.year - a.year) * 12 + (b.month - a.month),
      fraction: opDays / daysInYear(y),
      eegShare: opDays > 0 ? overlap(start, end, codDay, eegEndDay) / opDays : 0,
      cfDay: end - 1,
      operatingYear: y - codYear,
      isLast: y === lastYear,
    });
  }

  const kf = correctionFactor(inputs.energy.siteQuality, inputs.energy.southRegion);
  const aw = anzulegenderWert(inputs.revenue.awardPriceCt, kf);
  const e = inputs.energy;
  const hoursP50 =
    e.siteQuality *
    e.referenceYieldHours *
    Math.min(1, e.availability / AVAILABILITY_IN_SITE_YIELD) *
    (1 - e.otherExtraLosses);

  const futures = new Map(inputs.revenue.futuresEurMwh.map((v) => [v.year, v.value]));
  const basePrice = new Map<number, number>();
  const marketValue = new Map<number, number>();
  for (let y = codYear - 1; y <= lastYear; y++) {
    const base = (futures.get(y) ?? inputs.revenue.longTermBaseEurMwh2026 * index(y, 2026)) * adj.priceScale;
    basePrice.set(y, base);
    marketValue.set(y, (base * inputs.revenue.captureFactor) / 1000);
  }

  return {
    inputs,
    adj,
    capacityKw,
    fcDay,
    codDay,
    endDay,
    eegEndDay,
    codYear,
    monthDays,
    capexMonthly,
    vat: buildVatFacility(inputs, capexMonthly),
    years,
    loan: buildLoanCalendar(inputs, fcDay, p.constructionMonths, lastYear),
    kf,
    aw,
    awPeriods: buildAwPeriods(inputs, adj, codDay, eegEndDay),
    hoursP50,
    basePrice,
    marketValue,
    index,
    startWorkingCapital: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Operations: energy, revenue, opex, EBITDA and receivables per calendar year
// ---------------------------------------------------------------------------------------------

/** "base": the scenario's prices. "bankFloor": the lender counts at most the AW per kWh sold during support. */
type PriceMode = "base" | "bankFloor";

interface OperatingYear {
  energy: number;
  sold: number;
  eligible: number;
  base: number;
  marketValue: number;
  marketValuePrev: number;
  aw: number;
  premiumRate: number;
  advanceRate: number;
  premiumShare: number;
  revenueMarket: number;
  premiumAccrued: number;
  revenuePremium: number;
  siteQualitySettlement: number;
  premiumAdvance: number;
  postEegPrice: number;
  revenuePostEeg: number;
  revenue: number;
  maintenance: number;
  management: number;
  insurance: number;
  other: number;
  leaseOnRevenue: number;
  leaseMinimum: number;
  lease: number;
  directMarketing: number;
  municipal: number;
  guaranteeFee: number;
  gridFee: number;
  opex: number;
  municipalRefund: number;
  ebitda: number;
  decemberAdvance: number;
  openSettlements: number;
  receivablesMarket: number;
  receivablesPremium: number;
  receivables: number;
}

/** Share of the year's support days that falls into each AW period. */
function supportWeights(ctx: Context, s: YearSlot): number[] {
  const supportDays = overlap(s.start, s.end, ctx.codDay, ctx.eegEndDay);
  return ctx.awPeriods.map((p) => (supportDays > 0 ? overlap(s.start, s.end, p.start, p.end) / supportDays : 0));
}

function operatingYears(ctx: Context, mode: PriceMode, energyScale: number): OperatingYear[] {
  const { inputs, adj, capacityKw } = ctx;
  const r = inputs.revenue;
  const o = inputs.opex;
  const twoSided = mode === "base" && r.twoSidedPremium;
  const premium = (aw: number, mv: number) => marketPremium(aw, mv, twoSided);
  const refundRate = Math.min(r.municipalCtKwh, MUNICIPAL_REFUND_CAP_CT) / 100;
  const bond = inputs.project.hubHeightM * o.decommissioningBondPerMeterHub * inputs.project.turbines;
  const periods = ctx.awPeriods;

  const volumes = ctx.years.map((s) => {
    const energy =
      capacityKw * ctx.hoursP50 * s.fraction * Math.pow(1 - inputs.energy.degradationPerYear, s.operatingYear) * energyScale;
    const sold = energy * (1 - inputs.energy.negativePriceOutputShare);
    const mv = ctx.marketValue.get(s.year)!;
    // § 51: no premium in negative-price periods, so only the output sold is eligible.
    return { energy, sold, mv, w: supportWeights(ctx, s), eligible: sold * s.eegShare };
  });

  // § 36h (2): if a review moves the Gütefaktor by more than 2 points, the previous five years are paid again at the
  // new AW. The difference is accrued in the year of the review and paid with that year's final settlement.
  const settlement = new Map<number, number>();
  periods.forEach((p, k) => {
    if (k === 0) return;
    const prev = periods[k - 1]!;
    if (Math.abs(p.siteQuality - prev.siteQuality) <= SITE_REVIEW_THRESHOLD + 1e-12) return;
    let delta = 0;
    for (const v of volumes) delta += v.eligible * v.w[k - 1]! * (premium(p.aw, v.mv) - premium(prev.aw, v.mv));
    const year = parts(p.start).year;
    settlement.set(year, (settlement.get(year) ?? 0) + delta);
  });

  const rows: OperatingYear[] = ctx.years.map((s, i) => {
    const { energy, sold, mv, w, eligible } = volumes[i]!;
    const y = s.year;
    const mvPrev = ctx.marketValue.get(y - 1) ?? mv;
    const sum = (fn: (p: AwPeriod) => number) => periods.reduce((acc, p, k) => acc + w[k]! * fn(p), 0);
    const aw = s.eegShare > 0 ? sum((p) => p.aw) : periods.at(-1)!.aw;
    const premiumRate = sum((p) => premium(p.aw, mv));
    // § 26: monthly advances may use the previous year's market value; an advance is never negative.
    const advanceRate = sum((p) => Math.max(0, p.aw - mvPrev));
    const premiumShare = sum((p) => (premium(p.aw, mv) > 0 ? 1 : 0));

    // The annual market value averages the price over all wind output, including negative-price periods. A curtailed
    // farm gives up only zero or negative prices there, so output × JW is a cautious estimate of its market revenue.
    // The lender's floor counts at most the AW on the output sold: market value up to the AW, plus the premium.
    const revenueMarket =
      mode === "bankFloor" ? sold * s.eegShare * sum((p) => Math.min(mv, p.aw)) : energy * mv * s.eegShare;
    const siteQualitySettlement = settlement.get(y) ?? 0;
    const premiumAccrued = eligible * premiumRate;
    const revenuePremium = premiumAccrued + siteQualitySettlement;
    const i26 = ctx.index(y, 2026);
    // After support: market sales on all output (as above), or a PPA paid on the output delivered — the farm is
    // curtailed in negative-price periods, as under a PPA with a negative-price clause.
    const postEegPrice = r.postEeg === "ppa" ? (r.ppaEurMwh2026 * i26 * adj.priceScale) / 1000 : mv;
    const revenuePostEeg = (r.postEeg === "ppa" ? sold : energy) * postEegPrice * (1 - s.eegShare);
    const revenue = revenueMarket + revenuePremium + revenuePostEeg;
    const premiumAdvance = eligible * advanceRate;

    const decade = s.operatingYear < 10 ? 0 : s.operatingYear < 20 ? 1 : 2;
    const fixed = capacityKw * ctx.index(y, 2025) * s.fraction * adj.opexScale;
    const maintenance = o.maintenancePerKw[decade] * fixed;
    const management = o.managementPerKw[decade] * fixed;
    const insurance = o.insurancePerKw[decade] * fixed;
    const other = o.otherPerKw[decade] * fixed;
    const leaseOnRevenue = o.leaseShareOfRevenue * revenue;
    const leaseMinimum = o.leaseMinPerTurbine2026 * inputs.project.turbines * i26 * s.fraction;
    const lease = Math.max(leaseOnRevenue, leaseMinimum);
    const directMarketing = ((r.directMarketingCtKwh2026 * i26) / 100) * sold;
    const municipalShare = s.eegShare + (r.municipalAfterEeg ? 1 - s.eegShare : 0);
    const municipal = (r.municipalCtKwh / 100) * energy * municipalShare;
    const guaranteeFee = bond * o.guaranteeFeeRate * s.fraction;
    const gridFee = o.gridFeePerKw2026 * capacityKw * i26 * s.fraction * adj.opexScale;
    const opex =
      maintenance + management + insurance + other + lease + directMarketing + municipal + guaranteeFee + gridFee;
    // § 6 (5) EEG: up to 0.2 ct/kWh is refunded in the final settlement for quantities that received a premium.
    const municipalRefund = refundRate * eligible * premiumShare;
    const ebitda = revenue + municipalRefund - opex;

    return {
      energy,
      sold,
      eligible,
      base: ctx.basePrice.get(y)!,
      marketValue: mv,
      marketValuePrev: mvPrev,
      aw,
      premiumRate: mode === "bankFloor" ? aw : premiumRate,
      advanceRate,
      premiumShare,
      revenueMarket,
      premiumAccrued,
      revenuePremium,
      siteQualitySettlement,
      premiumAdvance,
      postEegPrice,
      revenuePostEeg,
      revenue,
      maintenance,
      management,
      insurance,
      other,
      leaseOnRevenue,
      leaseMinimum,
      lease,
      directMarketing,
      municipal,
      guaranteeFee,
      gridFee,
      opex,
      municipalRefund,
      ebitda,
      decemberAdvance: 0,
      openSettlements: 0,
      receivablesMarket: 0,
      receivablesPremium: 0,
      receivables: 0,
    };
  });

  // Year-end receivables. Market sales: the receivable days of the year's daily revenue. Premium: December's
  // advance (paid on 15 January) plus every true-up and § 6 refund whose final settlement is still to come.
  const lag = r.premiumTrueUpLagMonths;
  const lagYears = lag > 0 ? Math.ceil(lag / 12) : 0;
  rows.forEach((row, i) => {
    const s = ctx.years[i]!;
    if (s.isLast) return; // at the end of life all open balances are settled on the closing date
    const billed = row.revenueMarket + row.revenuePostEeg;
    const market = s.opDays > 0 ? Math.min(billed, (billed / s.opDays) * r.receivableDays) : 0;
    let december = 0;
    let open = 0;
    if (lagYears > 0) {
      // December's advance is paid on 15 January — only if the support period still runs in December.
      december = ctx.eegEndDay > addMonths(yearStart(s.year), 11) ? row.premiumAdvance / s.opMonths : 0;
      for (let j = i; j >= 0 && ctx.years[j]!.year + lagYears > s.year; j--) {
        const q = rows[j]!;
        open += q.revenuePremium - q.premiumAdvance + q.municipalRefund;
      }
    }
    row.decemberAdvance = december;
    row.openSettlements = open;
    row.receivablesMarket = market;
    row.receivablesPremium = december + open;
    row.receivables = market + december + open;
  });
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Senior debt
// ---------------------------------------------------------------------------------------------

/** How the principal is set: by formula, per calendar year (sculpted) or per instalment (a locked loan). */
type LoanPlan =
  | { kind: "linear" | "annuity" }
  | { kind: "byYear"; principal: Record<number, number> }
  | { kind: "byInstalment"; principal: number[] };

interface DebtYear {
  open: number;
  interest: number;
  principal: number;
  close: number;
}

interface DebtSchedule {
  years: Map<number, DebtYear>;
  instalments: number[];
}

/** Monthly interest at rate / 12 on the balance; instalments at quarter ends; aggregated to calendar years. */
function debtSchedule(ctx: Context, amount: number, plan: LoanPlan, months?: LoanMonth[]): DebtSchedule {
  const r = ctx.inputs.financing.interestRate;
  const L = ctx.loan;
  const n = L.instalmentCount;
  const quarterly = plan.kind === "annuity" ? amount * annuityFactor(r / 4, n) : 0;
  const years = new Map<number, DebtYear>();
  const instalments: number[] = [];
  let balance = amount;
  for (const s of ctx.years) {
    const row: DebtYear = { open: balance, interest: 0, principal: 0, close: balance };
    for (const m of L.monthsByYear.get(s.year) ?? []) {
      const interest = (balance * r) / 12;
      row.interest += interest;
      const record = months ? { date: toIso(m.day), year: s.year, instalment: m.instalment, opening: balance, interest, principal: 0, closing: balance } : null;
      if (record) months!.push(record);
      if (m.instalment < 0) continue;
      let principal: number;
      if (m.instalment === n - 1) principal = balance;
      else if (plan.kind === "byYear") principal = (plan.principal[s.year] ?? 0) / (L.instalmentsByYear.get(s.year) ?? 1);
      else if (plan.kind === "byInstalment") principal = plan.principal[m.instalment] ?? 0;
      else if (plan.kind === "annuity") principal = quarterly - (balance * r) / 4;
      else principal = amount / n;
      principal = Math.max(0, Math.min(principal, balance));
      if (balance - principal < DEBT_DUST) principal = balance;
      instalments.push(principal);
      row.principal += principal;
      balance -= principal;
      if (record) {
        record.principal = principal;
        record.closing = balance;
      }
    }
    row.close = balance;
    years.set(s.year, row);
  }
  return { years, instalments };
}

function debtServiceOf(schedule: DebtSchedule, year: number): number {
  const d = schedule.years.get(year);
  return d ? d.interest + d.principal : 0;
}

/**
 * DSRA target at the end of a year: the given months of the next year's debt service — but never less than the
 * first repayment year's, so the reserve is funded at COD to the level it needs once repayment starts.
 */
function dsraTarget(ctx: Context, schedule: DebtSchedule, year: number): number {
  if (year >= ctx.loan.maturityYear) return 0;
  const next = Math.max(year + 1, ctx.loan.firstRepaymentYear);
  return (ctx.inputs.financing.dsraMonths / 12) * debtServiceOf(schedule, next);
}

/**
 * DSRA funded at COD: the given months of the debt service of the first full calendar year with repayment — the
 * COD year itself when the farm starts on 1 January and repays that year, otherwise the year after at the earliest.
 */
function dsraAtCod(ctx: Context, schedule: DebtSchedule): number {
  const firstFullYear = ctx.codDay === yearStart(ctx.codYear) ? ctx.codYear : ctx.codYear + 1;
  const basis = Math.max(ctx.loan.firstRepaymentYear, firstFullYear);
  if (basis > ctx.loan.maturityYear) return 0;
  return (ctx.inputs.financing.dsraMonths / 12) * debtServiceOf(schedule, basis);
}

// ---------------------------------------------------------------------------------------------
// Construction: monthly spend, VAT bridge, fees, interest during construction, funding
// ---------------------------------------------------------------------------------------------

interface ConstructionResult {
  months: ConstructionMonth[];
  uses: number;
  capitalized: number;
  capexNet: number;
  upfront: number;
  commitment: number;
  idc: number;
  vatInterest: number;
  dsra: number;
  workingCapital: number;
  equity: number;
  debtDrawn: number;
  balanceDifference: number;
}

function construction(ctx: Context, amount: number, dsra: number): ConstructionResult {
  const f = ctx.inputs.financing;
  const M = ctx.capexMonthly.length;
  const capexNet = ctx.capexMonthly.reduce((a, b) => a + b, 0);
  const wc = ctx.startWorkingCapital;
  let uses = capexNet * 1.05 + dsra + wc;
  let months: ConstructionMonth[] = [];
  let totals = { upfront: 0, commitment: 0, idc: 0, vatInterest: 0, equity: 0, drawn: 0 };
  for (let iter = 0; iter < 100; iter++) {
    const share = uses > 0 ? amount / uses : 0;
    const equityTotal = uses - amount;
    months = [];
    totals = { upfront: 0, commitment: 0, idc: 0, vatInterest: 0, equity: 0, drawn: 0 };
    let drawn = 0;
    let cumEquity = 0;
    let need = 0;
    for (let m = 0; m < M; m++) {
      const capex = ctx.capexMonthly[m]!;
      const upfront = m === 0 ? f.upfrontFeePct * amount : 0;
      const commitment = m + 1 >= f.commitmentFeeStartMonth ? f.commitmentFeePerMonth * Math.max(0, amount - drawn) : 0;
      const idc = (drawn * f.interestRate) / 12;
      const vatInterest = ctx.vat.interest[m]! + (m === M - 1 ? ctx.vat.tailInterest : 0);
      const dsraFunding = m === M - 1 ? dsra : 0;
      const workingCapitalFunding = m === M - 1 ? wc : 0;
      const monthNeed = capex + upfront + commitment + idc + vatInterest + dsraFunding + workingCapitalFunding;
      let debtDraw: number;
      if (f.equityFirst) {
        const equityLeft = Math.max(0, equityTotal - cumEquity);
        debtDraw = monthNeed - Math.min(monthNeed, equityLeft);
      } else debtDraw = share * monthNeed;
      const equityDraw = monthNeed - debtDraw;
      drawn += debtDraw;
      cumEquity += equityDraw;
      need += monthNeed;
      totals.upfront += upfront;
      totals.commitment += commitment;
      totals.idc += idc;
      totals.vatInterest += vatInterest;
      months.push({
        index: m + 1,
        date: toIso(ctx.monthDays[m]!),
        capex,
        vat: ctx.vat.vat[m]!,
        vatRefund: ctx.vat.refund[m]!,
        vatFacilityBalance: ctx.vat.balance[m]!,
        vatInterest,
        upfrontFee: upfront,
        commitmentFee: commitment,
        interestDuringConstruction: idc,
        dsraFunding,
        workingCapitalFunding,
        need: monthNeed,
        debtDraw,
        equityDraw,
        debtBalance: drawn,
      });
    }
    totals.equity = cumEquity;
    totals.drawn = drawn;
    const converged = Math.abs(need - uses) < 1e-6;
    uses = need;
    if (converged) break;
  }
  const capitalized = uses - dsra - wc;
  const balanceDifference = capitalized + dsra + wc - (totals.drawn + totals.equity);
  return {
    months,
    uses,
    capitalized,
    capexNet,
    upfront: totals.upfront,
    commitment: totals.commitment,
    idc: totals.idc,
    vatInterest: totals.vatInterest,
    dsra,
    workingCapital: wc,
    equity: totals.equity,
    debtDrawn: totals.drawn,
    balanceDifference,
  };
}

// ---------------------------------------------------------------------------------------------
// Taxes and provisions
// ---------------------------------------------------------------------------------------------

function degressiveAllowed(ctx: Context): boolean {
  return (
    ctx.inputs.tax.degressive &&
    ctx.codDay >= toDay(TAX.degressiveWindowStart) &&
    ctx.codDay <= toDay(TAX.degressiveWindowEnd)
  );
}

/**
 * Tax provision for decommissioning: accrued pro rata at the price level of each balance-sheet date and discounted
 * at 5.5 % — except when less than twelve months remain (§ 6 (1) Nr. 3a e) EStG).
 */
function provisionPath(ctx: Context): number[] {
  const cost2026 = ctx.inputs.opex.decommissioningCostPerKw2026 * ctx.capacityKw;
  const life = ctx.endDay - ctx.codDay;
  return ctx.years.map((s) => {
    const dayAfter = s.cfDay + 1;
    const elapsed = Math.min(1, (dayAfter - ctx.codDay) / life);
    const underTwelveMonths = ctx.endDay < addMonths(dayAfter, 12);
    const remainingYears = Math.max(0, (ctx.endDay - dayAfter) / 365);
    const discount = underTwelveMonths ? 1 : Math.pow(1 + TAX.provisionDiscountRate, remainingYears);
    const cost = cost2026 * ctx.index(s.year, 2026);
    return (cost * elapsed) / discount;
  });
}

interface TaxPass {
  base: number;
  scheduled: number[];
  residual: number[];
  depreciation: number[];
  provision: number[];
  provisionChange: number[];
  interest: number[];
  ebt: number[];
  tradeTax: number[];
  corporateTax: number[];
  soli: number[];
  taxes: number[];
  detail: TaxResult["detail"];
}

function taxPass(ctx: Context, ops: OperatingYear[], depreciationBase: number, interest: number[]): TaxPass {
  const yearsList = ctx.years.map((s) => s.year);
  const scheduled = depreciation(
    depreciationBase,
    parts(ctx.codDay).month,
    ctx.inputs.tax.depreciationYears,
    degressiveAllowed(ctx),
    yearsList,
  );
  // Dismantling at the end of life: any remaining book value is written off in the final year.
  const left = depreciationBase - scheduled.reduce((a, b) => a + b, 0);
  const residual = scheduled.map((_, i) => (i === scheduled.length - 1 && left > 1e-6 ? left : 0));
  const dep = scheduled.map((d, i) => d + residual[i]!);
  const prov = provisionPath(ctx);
  const provisionChange = prov.map((p, i) => p - (i > 0 ? prov[i - 1]! : 0));
  const ebt = ops.map((o, i) => o.ebitda - dep[i]! - interest[i]! - provisionChange[i]!);
  const t = computeTaxes(
    yearsList.map((year, i) => ({ year, ebt: ebt[i]!, interest: interest[i]!, lease: ops[i]!.lease })),
    ctx.inputs.tax.legalForm,
    ctx.inputs.tax.hebesatz,
  );
  const taxes = t.tradeTax.map((g, i) => g + t.corporateTax[i]! + t.soli[i]!);
  return { base: depreciationBase, scheduled, residual, depreciation: dep, provision: prov, provisionChange, interest, ebt, ...t, taxes };
}

function taxTrace(ctx: Context, ops: OperatingYear[], t: TaxPass): TaxTrace {
  let previous = ctx.startWorkingCapital;
  const cfads = ops.map((o, i) => {
    const deltaWc = o.receivables - previous;
    previous = o.receivables;
    return o.ebitda - deltaWc - t.taxes[i]!;
  });
  return {
    depreciationBase: t.base,
    depreciationScheduled: t.scheduled,
    residualWriteOff: t.residual,
    depreciation: t.depreciation,
    provision: t.provision,
    provisionChange: t.provisionChange,
    interest: t.interest,
    ebt: t.ebt,
    addBack: t.detail.addBack,
    tradeIncome: t.detail.tradeIncome,
    tradePoolOpen: t.detail.tradePoolOpen,
    tradeLossUsed: t.detail.tradeLossUsed,
    tradePoolClose: t.detail.tradePoolClose,
    tradeBase: t.detail.tradeBase,
    tradeTax: t.tradeTax,
    corporatePoolOpen: t.detail.corporatePoolOpen,
    corporateLossUsed: t.detail.corporateLossUsed,
    corporatePoolClose: t.detail.corporatePoolClose,
    corporateTaxable: t.detail.corporateTaxable,
    corporateRate: t.detail.corporateRate,
    corporateTax: t.corporateTax,
    soli: t.soli,
    taxes: t.taxes,
    cfads,
  };
}

function operationsTrace(ctx: Context, ops: OperatingYear[]): OperationsTrace {
  const col = <K extends keyof OperatingYear>(k: K) => ops.map((o) => o[k] as number);
  let previous = ctx.startWorkingCapital;
  const deltaWorkingCapital = ops.map((o) => {
    const d = o.receivables - previous;
    previous = o.receivables;
    return d;
  });
  return {
    energy: col("energy"),
    sold: col("sold"),
    eligible: col("eligible"),
    basePrice: col("base"),
    marketValue: col("marketValue"),
    marketValuePrev: col("marketValuePrev"),
    aw: col("aw"),
    premiumRate: col("premiumRate"),
    advanceRate: col("advanceRate"),
    premiumShare: col("premiumShare"),
    revenueMarket: col("revenueMarket"),
    premiumAccrued: col("premiumAccrued"),
    siteQualitySettlement: col("siteQualitySettlement"),
    revenuePremium: col("revenuePremium"),
    postEegPrice: col("postEegPrice"),
    revenuePostEeg: col("revenuePostEeg"),
    revenue: col("revenue"),
    maintenance: col("maintenance"),
    management: col("management"),
    insurance: col("insurance"),
    other: col("other"),
    leaseOnRevenue: col("leaseOnRevenue"),
    leaseMinimum: col("leaseMinimum"),
    lease: col("lease"),
    directMarketing: col("directMarketing"),
    municipal: col("municipal"),
    guaranteeFee: col("guaranteeFee"),
    gridFee: col("gridFee"),
    opex: col("opex"),
    municipalRefund: col("municipalRefund"),
    ebitda: col("ebitda"),
    premiumAdvance: col("premiumAdvance"),
    decemberAdvance: col("decemberAdvance"),
    openSettlements: col("openSettlements"),
    receivablesMarket: col("receivablesMarket"),
    receivablesPremium: col("receivablesPremium"),
    receivables: col("receivables"),
    deltaWorkingCapital,
  };
}

/** CFADS = EBITDA − change in working capital − taxes: one definition for sizing, covenant and lock-up. */
function cfadsFrom(ctx: Context, ops: OperatingYear[], t: TaxPass): number[] {
  let previous = ctx.startWorkingCapital;
  return ops.map((o, i) => {
    const deltaWc = o.receivables - previous;
    previous = o.receivables;
    return o.ebitda - deltaWc - t.taxes[i]!;
  });
}

function cfadsOf(ctx: Context, ops: OperatingYear[], depreciationBase: number, interest: number[]): number[] {
  return cfadsFrom(ctx, ops, taxPass(ctx, ops, depreciationBase, interest));
}

// ---------------------------------------------------------------------------------------------
// Debt sizing
// ---------------------------------------------------------------------------------------------

interface Sizing {
  amount: number;
  plan: LoanPlan;
  iterations: number;
  converged: boolean;
  gearingBound?: boolean;
  locked?: boolean;
}

function bankMode(ctx: Context): PriceMode {
  return ctx.inputs.revenue.bankPriceBasis === "floor" ? "bankFloor" : "base";
}

function interestOf(ctx: Context, schedule: DebtSchedule): number[] {
  return ctx.years.map((s) => schedule.years.get(s.year)!.interest);
}

/** The lender's case for a given loan: operations, taxes and CFADS at P50 and P90 (1-year) output on the sizing prices. */
function lenderPasses(ctx: Context, schedule: DebtSchedule, capitalized: number) {
  const mode = bankMode(ctx);
  const p90 = 1 - P90_Z * ctx.inputs.energy.sigma1y;
  const interest = interestOf(ctx, schedule);
  const ops50 = operatingYears(ctx, mode, ctx.adj.energyScale);
  const ops90 = operatingYears(ctx, mode, ctx.adj.energyScale * p90);
  const tax50 = taxPass(ctx, ops50, capitalized, interest);
  const tax90 = taxPass(ctx, ops90, capitalized, interest);
  const cfadsP50 = cfadsFrom(ctx, ops50, tax50);
  const cfadsP90 = cfadsFrom(ctx, ops90, tax90);
  const debtService = ctx.years.map((s) => debtServiceOf(schedule, s.year));
  const ratio = (cf: number, ds: number) => (ds >= MIN_DEBT_SERVICE ? cf / ds : null);
  const summary: LenderCase = {
    years: ctx.years.map((s) => s.year),
    cfadsP50,
    cfadsP90,
    debtService,
    dscrP50: cfadsP50.map((cf, i) => ratio(cf, debtService[i]!)),
    dscrP90: cfadsP90.map((cf, i) => ratio(cf, debtService[i]!)),
  };
  return { summary, ops50, ops90, tax50, tax90 };
}

function sizingInfo(ctx: Context, sizing: Sizing, lender: LenderCase): SizingInfo {
  const f = ctx.inputs.financing;
  const min = (v: (number | null)[]) => {
    const xs = v.filter((x): x is number => x !== null);
    return xs.length ? Math.min(...xs) : null;
  };
  const min50 = min(lender.dscrP50);
  const min90 = min(lender.dscrP90);
  let binding: SizingInfo["binding"] = "none";
  if (sizing.locked) binding = "locked";
  else if (sizing.gearingBound) binding = "gearing";
  else if (sizing.amount === 0) binding = "cashflow";
  else if (min90 !== null && Math.abs(min90 - f.targetDscrP90) < 1e-4) binding = "dscrP90";
  else if (min50 !== null && Math.abs(min50 - f.targetDscrP50) < 1e-4) binding = "dscrP50";
  return {
    bankPriceBasis: ctx.inputs.revenue.bankPriceBasis,
    minBankDscrP50: min50,
    minBankDscrP90: min90,
    binding,
    lenderCase: lender,
  };
}

function rescale(plan: LoanPlan, from: number, to: number): LoanPlan {
  if (from <= 0 || from === to) return plan;
  const k = to / from;
  if (plan.kind === "byYear") {
    return { kind: "byYear", principal: Object.fromEntries(Object.entries(plan.principal).map(([y, v]) => [y, v * k])) };
  }
  if (plan.kind === "byInstalment") return { kind: "byInstalment", principal: plan.principal.map((v) => v * k) };
  return plan;
}

/**
 * Sculpted loan for given annual debt-service targets. Each repayment year's principal is split evenly over its
 * quarterly instalments, so interest in year y = r/12 × (m·B − (P/k)·S), with m loan months, k instalments,
 * B the opening balance and S the instalments already paid summed over the months. Balances are affine in the
 * loan amount, so the amount that repays the loan exactly at maturity follows directly.
 */
function sculptAffine(ctx: Context, targets: Map<number, number>): number {
  const r = ctx.inputs.financing.interestRate;
  let a = 0;
  let b = 1;
  for (const s of ctx.years) {
    const c = sculptCoefficients(ctx, s.year);
    if (!c) continue;
    const ds = targets.get(s.year) ?? 0;
    const p0 = (ds - (r * c.months * a) / 12) / c.denom;
    const p1 = -((r * c.months * b) / 12) / c.denom;
    a -= p0;
    b -= p1;
  }
  return Math.abs(b) > 1e-12 ? -a / b : 0;
}

function sculptCoefficients(ctx: Context, year: number): { months: number; k: number; S: number; denom: number } | null {
  const months = ctx.loan.monthsByYear.get(year) ?? [];
  const k = ctx.loan.instalmentsByYear.get(year) ?? 0;
  if (k === 0) return null;
  let paid = 0;
  let S = 0;
  for (const m of months) {
    S += paid;
    if (m.instalment >= 0) paid += 1;
  }
  return { months: months.length, k, S, denom: 1 - (ctx.inputs.financing.interestRate * S) / (12 * k) };
}

/**
 * Principal per year for a loan amount: each year pays its debt-service target, never a negative instalment,
 * and the last year repays the rest. Feasible when no year's debt service exceeds its target.
 */
function sculptSchedule(ctx: Context, targets: Map<number, number>, amount: number) {
  const r = ctx.inputs.financing.interestRate;
  const principal: Record<number, number> = {};
  let balance = amount;
  let feasible = true;
  for (const s of ctx.years) {
    const c = sculptCoefficients(ctx, s.year);
    if (!c) continue;
    const target = targets.get(s.year) ?? 0;
    const due = s.year === ctx.loan.maturityYear ? balance : (target - (r * c.months * balance) / 12) / c.denom;
    let p = Math.max(0, Math.min(due, balance));
    if (balance - p < DEBT_DUST) p = balance;
    const interest = (r / 12) * (c.months * balance - (p / c.k) * c.S);
    if (p + interest > target * (1 + 1e-9) + DEBT_DUST) feasible = false;
    principal[s.year] = p;
    balance -= p;
  }
  return { principal, feasible };
}

/** The largest sculpted loan whose debt service stays within the targets in every year. */
function sculpt(ctx: Context, targets: Map<number, number>, cap: number): { amount: number; principal: Record<number, number> } {
  let t = targets;
  let amount = sculptAffine(ctx, t);
  if (amount > cap) {
    // Interest-only years cap the loan: scale every year's target alike.
    const k = cap / amount;
    t = new Map([...t.entries()].map(([y, v]) => [y, v * k]));
    amount = cap;
  }
  amount = Math.max(0, amount);
  let sim = sculptSchedule(ctx, t, amount);
  if (!sim.feasible) {
    // A year with too little cash would need a negative instalment: find the largest loan without one.
    let lo = 0;
    let hi = amount;
    for (let i = 0; i < 100 && hi - lo > 0.01; i++) {
      const mid = (lo + hi) / 2;
      if (sculptSchedule(ctx, t, mid).feasible) lo = mid;
      else hi = mid;
    }
    amount = lo;
    sim = sculptSchedule(ctx, t, amount);
  }
  return { amount, principal: sim.principal };
}

function sizeDebt(ctx: Context): Sizing {
  const f = ctx.inputs.financing;
  const mode = bankMode(ctx);
  const p90 = 1 - P90_Z * ctx.inputs.energy.sigma1y;
  const bank50 = operatingYears(ctx, mode, ctx.adj.energyScale);
  const bank90 = operatingYears(ctx, mode, ctx.adj.energyScale * p90);
  const sculpted = f.repayment === "sculpted";
  const formula: LoanPlan = { kind: f.repayment === "annuity" ? "annuity" : "linear" };
  const unit = debtSchedule(ctx, 1, formula);
  const capexNet = ctx.capexMonthly.reduce((a, b) => a + b, 0);

  let amount = 0.6 * capexNet;
  let plan: LoanPlan = formula; // a sculpted loan starts from equal instalments and is re-shaped every iteration
  let converged = false;
  let iterations = 0;
  let gearingBound = false;
  for (let iter = 1; iter <= 200; iter++) {
    iterations = iter;
    const schedule = debtSchedule(ctx, amount, plan);
    const cons = construction(ctx, amount, dsraAtCod(ctx, schedule));
    const interest = interestOf(ctx, schedule);
    const cf50 = cfadsOf(ctx, bank50, cons.capitalized, interest);
    const cf90 = cfadsOf(ctx, bank90, cons.capitalized, interest);

    let candidate = Infinity;
    let nextPlan: LoanPlan = formula;
    if (sculpted) {
      const r = f.interestRate;
      const targets = new Map<number, number>();
      let cap = Infinity;
      ctx.years.forEach((s, i) => {
        const months = ctx.loan.monthsByYear.get(s.year)?.length ?? 0;
        if (months === 0) return;
        const target = Math.max(0, Math.min(cf50[i]! / f.targetDscrP50, cf90[i]! / f.targetDscrP90));
        if ((ctx.loan.instalmentsByYear.get(s.year) ?? 0) > 0) targets.set(s.year, target);
        // Interest-only years before the first instalment must meet the targets too.
        else cap = Math.min(cap, target / ((r * months) / 12));
      });
      const sc = sculpt(ctx, targets, cap);
      candidate = sc.amount;
      nextPlan = { kind: "byYear", principal: sc.principal };
    } else {
      ctx.years.forEach((s, i) => {
        const a = debtServiceOf(unit, s.year);
        if (a > 0) candidate = Math.min(candidate, cf50[i]! / (f.targetDscrP50 * a), cf90[i]! / (f.targetDscrP90 * a));
      });
      candidate = Number.isFinite(candidate) ? Math.max(0, candidate) : 0;
    }

    // Gearing cap: debt ≤ max gearing × total uses, where uses depend on the debt (fees, interest).
    let capped = candidate;
    for (let k = 0; k < 50; k++) {
      const sch = debtSchedule(ctx, capped, rescale(nextPlan, candidate, capped));
      const limit = f.maxGearing * construction(ctx, capped, dsraAtCod(ctx, sch)).uses;
      if (capped <= limit + 1e-6) break;
      capped = limit;
    }
    nextPlan = rescale(nextPlan, candidate, capped);
    gearingBound = capped < candidate - DEBT_TOLERANCE;
    if (capped < MIN_LOAN) {
      capped = 0;
      if (nextPlan.kind === "byYear") nextPlan = { kind: "byYear", principal: {} };
    }

    const done = Math.abs(capped - amount) < DEBT_TOLERANCE;
    amount = iter > 50 ? (amount + capped) / 2 : capped;
    plan = nextPlan;
    if (done) {
      amount = capped;
      converged = true;
      break;
    }
  }
  return { amount, plan, iterations, converged, gearingBound };
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

export function runModel(inputs: Inputs, options: RunOptions = {}): ModelResult {
  const issues = validateInputs(inputs);
  if (issues.length > 0) throw new InvalidInputsError(issues);
  const adj: ScenarioAdjustments = { ...NEUTRAL_SCENARIO, ...options.scenario };
  const ctx = buildContext(inputs, adj);
  // The receivables of the first year are funded at COD, so the first months' sales need no extra cash. A locked
  // funding plan keeps the amount fixed at financial close.
  ctx.startWorkingCapital =
    options.lockedDebt?.workingCapital ?? Math.max(0, operatingYears(ctx, "base", adj.energyScale)[0]?.receivables ?? 0);
  let sizing: Sizing;
  if (options.lockedDebt) {
    sizing = {
      amount: options.lockedDebt.amount,
      plan: { kind: "byInstalment", principal: options.lockedDebt.instalments },
      iterations: 0,
      converged: true,
      locked: true,
    };
  } else sizing = sizeDebt(ctx);
  return assemble(ctx, sizing, options.trace ?? false);
}

/** Collects one value per year for each named line. */
function lines<K extends string>(names: readonly K[]): Record<K, number[]> {
  return Object.fromEntries(names.map((n) => [n, [] as number[]])) as Record<K, number[]>;
}

const WATERFALL_LINES = [
  "cfads",
  "debtService",
  "deficitIn",
  "trappedUsed",
  "dsraOpen",
  "dsraTarget",
  "dsraTopUp",
  "dsraRelease",
  "dsraDraw",
  "dsraClose",
  "reserveContribution",
  "decommissioningPaid",
  "reserveClose",
  "lockUp",
  "trappedAdded",
  "trappedReleased",
  "finalRelease",
  "trappedClose",
  "deficitOut",
  "distribution",
] as const;

const STATEMENT_LINES = [
  "fixedAssets",
  "receivables",
  "dsra",
  "reserve",
  "trapped",
  "cashDeficit",
  "totalAssets",
  "debt",
  "provision",
  "cumulativeDistributions",
  "cumulativeNetIncome",
  "bookEquity",
  "difference",
] as const;

function assemble(ctx: Context, sizing: Sizing, tracing: boolean): ModelResult {
  const { inputs } = ctx;
  const f = inputs.financing;
  const ops = operatingYears(ctx, "base", ctx.adj.energyScale);
  const loanMonths: LoanMonth[] = [];
  const schedule = debtSchedule(ctx, sizing.amount, sizing.plan, tracing ? loanMonths : undefined);
  const dsra0 = dsraAtCod(ctx, schedule);
  const cons = construction(ctx, sizing.amount, dsra0);
  const interest = interestOf(ctx, schedule);
  const levered = taxPass(ctx, ops, cons.capitalized, interest);
  const unlevered = taxPass(ctx, ops, cons.capexNet, interest.map(() => 0));
  const provision = provisionPath(ctx);
  const decomCost = inputs.opex.decommissioningCostPerKw2026 * ctx.capacityKw * ctx.index(parts(ctx.endDay - 1).year, 2026);
  const inReserveWindow = (s: YearSlot) => ctx.endDay - (s.cfDay + 1) < inputs.opex.decommissioningReserveYears * 365;

  const annual: AnnualRow[] = [];
  let receivablesPrev = ctx.startWorkingCapital;
  let dsra = dsra0;
  let reserve = 0;
  let trapped = 0;
  let deficit = 0;
  let cumDistribution = 0;
  let cumNetIncome = 0;
  let cumDepreciation = 0;
  let contributionsLeft = ctx.years.filter(inReserveWindow).length;
  const lockUpYears: number[] = [];
  const W = lines(WATERFALL_LINES);
  const B = lines(STATEMENT_LINES);

  ctx.years.forEach((s, i) => {
    const o = ops[i]!;
    const d = schedule.years.get(s.year)!;
    const taxes = levered.taxes[i]!;
    const deltaWc = o.receivables - receivablesPrev;
    receivablesPrev = o.receivables;
    const cfads = o.ebitda - deltaWc - taxes;
    const debtService = d.interest + d.principal;
    const deficitIn = deficit;
    let cash = cfads - debtService + deficit;

    // A shortfall is covered first by cash held back under the lock-up, then by the debt service reserve.
    let trappedUsed = 0;
    if (cash < 0 && trapped > 0) {
      trappedUsed = Math.min(trapped, -cash);
      trapped -= trappedUsed;
      cash += trappedUsed;
    }
    // Debt service reserve: top up to the target from surplus cash, release any excess, draw on a shortfall.
    const dsraOpen = dsra;
    const target = dsraTarget(ctx, schedule, s.year);
    let dsraTopUp = 0;
    let dsraRelease = 0;
    let dsraDraw = 0;
    if (target > dsra) {
      dsraTopUp = Math.min(target - dsra, Math.max(0, cash));
      dsra += dsraTopUp;
      cash -= dsraTopUp;
    } else {
      dsraRelease = dsra - target;
      cash += dsraRelease;
      dsra = target;
    }
    if (cash < 0) {
      dsraDraw = Math.min(dsra, -cash);
      dsra -= dsraDraw;
      cash += dsraDraw;
    }

    // Decommissioning reserve: equal instalments in the last years, paid out at the end of life.
    let decommissioningPaid = 0;
    let reserveContribution = 0;
    if (inReserveWindow(s) && contributionsLeft > 0) {
      const planned = (decomCost - reserve) / contributionsLeft;
      reserveContribution = s.isLast ? decomCost - reserve : Math.min(Math.max(0, cash), planned);
      reserve += reserveContribution;
      cash -= reserveContribution;
      contributionsLeft -= 1;
    }
    if (s.isLast) {
      decommissioningPaid = decomCost;
      reserve -= decomCost;
    }

    // Lock-up: distributions stay in the company while the DSCR is below the threshold.
    const dscr = debtService >= MIN_DEBT_SERVICE ? cfads / debtService : null;
    const lockUp = dscr !== null && dscr < f.lockupDscr && s.year <= ctx.loan.maturityYear;
    let trappedAdded = 0;
    let trappedReleased = 0;
    if (lockUp) {
      lockUpYears.push(s.year);
      if (cash > 0) {
        trappedAdded = cash;
        trapped += cash;
        cash = 0;
      }
    } else if (trapped > 0) {
      trappedReleased = trapped;
      cash += trapped;
      trapped = 0;
    }
    let finalRelease = 0;
    if (s.isLast) {
      finalRelease = dsra + trapped + reserve;
      cash += finalRelease;
      dsra = 0;
      trapped = 0;
      reserve = 0;
    }

    // Cash short at a year end — the final year included — stays a shortfall: payments by the owners are not
    // modelled (D01), so the case is not funded and its returns are not meaningful.
    let distribution = 0;
    if (cash >= 0) {
      distribution = cash;
      deficit = 0;
    } else deficit = cash;
    cumDistribution += distribution;
    if (tracing) {
      const w = {
        cfads,
        debtService,
        deficitIn,
        trappedUsed,
        dsraOpen,
        dsraTarget: target,
        dsraTopUp,
        dsraRelease,
        dsraDraw,
        dsraClose: dsra,
        reserveContribution,
        decommissioningPaid,
        reserveClose: reserve,
        lockUp: lockUp ? 1 : 0,
        trappedAdded,
        trappedReleased,
        finalRelease,
        trappedClose: trapped,
        deficitOut: deficit,
        distribution,
      };
      for (const k of WATERFALL_LINES) W[k].push(w[k]);
    }

    const netIncome = levered.ebt[i]! - taxes;
    cumNetIncome += netIncome;
    cumDepreciation += levered.depreciation[i]!;
    const provisionClosing = s.isLast ? 0 : provision[i]!;
    const assets = cons.capitalized - cumDepreciation + o.receivables + dsra + reserve + trapped + deficit;
    const liabilities = d.close + provisionClosing;
    const bookEquity = cons.equity - cumDistribution + cumNetIncome;
    const balanceDifference = assets - liabilities - bookEquity;
    if (tracing) {
      const b = {
        fixedAssets: cons.capitalized - cumDepreciation,
        receivables: o.receivables,
        dsra,
        reserve,
        trapped,
        cashDeficit: deficit,
        totalAssets: assets,
        debt: d.close,
        provision: provisionClosing,
        cumulativeDistributions: cumDistribution,
        cumulativeNetIncome: cumNetIncome,
        bookEquity,
        difference: balanceDifference,
      };
      for (const k of STATEMENT_LINES) B[k].push(b[k]);
    }

    const taxesUnlevered = unlevered.taxes[i]!;
    const projectPre = o.ebitda - deltaWc - (s.isLast ? decomCost : 0);

    annual.push({
      year: s.year,
      cashFlowDate: toIso(s.cfDay),
      operatingYear: s.operatingYear,
      operatingFraction: s.fraction,
      eegShare: s.eegShare,
      energyKwh: o.energy,
      energySoldKwh: o.sold,
      baseEurMwh: o.base,
      marketValueEurKwh: o.marketValue,
      awEurKwh: o.aw,
      premiumEurKwh: o.premiumRate,
      revenueMarket: o.revenueMarket,
      revenuePremium: o.revenuePremium,
      siteQualitySettlement: o.siteQualitySettlement,
      premiumAdvance: o.premiumAdvance,
      revenuePostEeg: o.revenuePostEeg,
      revenue: o.revenue,
      maintenance: o.maintenance,
      management: o.management,
      insurance: o.insurance,
      otherOpex: o.other,
      lease: o.lease,
      directMarketing: o.directMarketing,
      municipal: o.municipal,
      guaranteeFee: o.guaranteeFee,
      gridFee: o.gridFee,
      opex: o.opex,
      municipalRefund: o.municipalRefund,
      ebitda: o.ebitda,
      depreciation: levered.depreciation[i]!,
      interest: d.interest,
      provisionChange: levered.provisionChange[i]!,
      ebt: levered.ebt[i]!,
      tradeTax: levered.tradeTax[i]!,
      corporateTax: levered.corporateTax[i]!,
      soli: levered.soli[i]!,
      taxes,
      netIncome,
      receivables: o.receivables,
      receivablesMarket: o.receivablesMarket,
      receivablesPremium: o.receivablesPremium,
      deltaWorkingCapital: deltaWc,
      cfads,
      principal: d.principal,
      debtService,
      debtOpening: d.open,
      debtClosing: d.close,
      dscr,
      dsraBalance: dsra,
      decommissioningReserve: reserve,
      trappedCash: trapped,
      cashDeficit: deficit,
      decommissioningPaid,
      distribution,
      taxesUnlevered,
      projectCashFlowPreTax: projectPre,
      projectCashFlowPostTax: projectPre - taxesUnlevered,
      provision: provisionClosing,
      bookEquity,
      balanceDifference,
    });
  });

  const sourcesUses: SourcesUses = {
    capex: cons.capexNet,
    upfrontFee: cons.upfront,
    commitmentFee: cons.commitment,
    interestDuringConstruction: cons.idc,
    vatInterest: cons.vatInterest,
    dsraInitial: cons.dsra,
    workingCapitalInitial: cons.workingCapital,
    totalUses: cons.uses,
    debt: cons.debtDrawn,
    equity: cons.equity,
    totalSources: cons.debtDrawn + cons.equity,
  };

  const kpis = computeKpis(ctx, cons, annual, sizing.amount);
  const lockedDebt: LockedDebt = {
    amount: sizing.amount,
    instalments: schedule.instalments,
    workingCapital: ctx.startWorkingCapital,
  };
  const lender = lenderPasses(ctx, schedule, cons.capitalized);
  const sizingSummary = sizingInfo(ctx, sizing, lender.summary);
  const checks = runChecks(ctx, cons, annual, kpis, sizing, sizingSummary, schedule, lockUpYears);
  const noticeDay = toDay(inputs.revenue.awardNoticeDate);
  const trace: EngineTrace | undefined = tracing
    ? {
        timing: timingTrace(ctx),
        construction: constructionTrace(ctx),
        operations: operationsTrace(ctx, ops),
        tax: taxTrace(ctx, ops, levered),
        taxUnlevered: taxTrace(ctx, ops, unlevered),
        lenderP50: operationsTrace(ctx, lender.ops50),
        lenderP90: operationsTrace(ctx, lender.ops90),
        taxLenderP50: taxTrace(ctx, lender.ops50, lender.tax50),
        taxLenderP90: taxTrace(ctx, lender.ops90, lender.tax90),
        loanMonths,
        waterfall: W,
        statements: { ...B, equityContributed: cons.equity },
        flows: {
          equity: equityFlows({ construction: cons.months, annual }).map((x) => ({ date: toIso(x.day), amount: x.amount })),
          projectPreTax: projectFlows(cons, annual, "pre").map((x) => ({ date: toIso(x.day), amount: x.amount })),
          projectPostTax: projectFlows(cons, annual, "post").map((x) => ({ date: toIso(x.day), amount: x.amount })),
        },
      }
    : undefined;

  return {
    sizing: sizingSummary,
    timeline: {
      financialClose: toIso(ctx.fcDay),
      cod: toIso(ctx.codDay),
      endOfLife: toIso(ctx.endDay),
      eegEnd: toIso(ctx.eegEndDay),
      loanMaturity: toIso(ctx.loan.maturityDay),
      graceEnd: toIso(ctx.loan.graceEndDay),
      firstInstalment: ctx.loan.firstInstalmentDay === null ? null : toIso(ctx.loan.firstInstalmentDay),
      awardNotice: toIso(noticeDay),
      awardLapse: toIso(addMonths(noticeDay, AWARD_LAPSE_MONTHS)),
    },
    awPeriods: ctx.awPeriods.map((p) => ({
      start: toIso(p.start),
      end: toIso(p.end),
      awCt: p.aw * 100,
      siteQuality: p.siteQuality,
    })),
    construction: cons.months,
    annual,
    sourcesUses,
    kpis,
    checks,
    validity: validityOf(checks, annual, kpis, f.covenantDscr, lockUpYears),
    lockedDebt,
    iterations: sizing.iterations,
    converged: sizing.converged,
    ...(trace ? { trace } : {}),
  };
}

function timingTrace(ctx: Context): EngineTrace["timing"] {
  const reserveYears = ctx.inputs.opex.decommissioningReserveYears;
  return {
    years: ctx.years.map((s) => s.year),
    start: ctx.years.map((s) => toIso(s.start)),
    end: ctx.years.map((s) => toIso(s.end)),
    opDays: ctx.years.map((s) => s.opDays),
    daysInYear: ctx.years.map((s) => daysInYear(s.year)),
    opMonths: ctx.years.map((s) => s.opMonths),
    fraction: ctx.years.map((s) => s.fraction),
    eegShare: ctx.years.map((s) => s.eegShare),
    operatingYear: ctx.years.map((s) => s.operatingYear),
    decade: ctx.years.map((s) => (s.operatingYear < 10 ? 0 : s.operatingYear < 20 ? 1 : 2)),
    isLast: ctx.years.map((s) => s.isLast),
    reserveWindow: ctx.years.map((s) => ctx.endDay - (s.cfDay + 1) < reserveYears * 365),
    index2025: ctx.years.map((s) => ctx.index(s.year, 2025)),
    index2026: ctx.years.map((s) => ctx.index(s.year, 2026)),
    awWeights: ctx.years.map((s) => supportWeights(ctx, s)),
    loanMonths: ctx.years.map((s) => ctx.loan.monthsByYear.get(s.year)?.length ?? 0),
    instalments: ctx.years.map((s) => ctx.loan.instalmentsByYear.get(s.year) ?? 0),
  };
}

function constructionTrace(ctx: Context): EngineTrace["construction"] {
  const M = ctx.capexMonthly.length;
  const weights: Record<string, number[]> = {};
  const capexByItem: Record<string, number[]> = {};
  const scale = ctx.capacityKw * ctx.adj.capexScale;
  for (const it of ctx.inputs.capex.items) {
    weights[it.key] = profileWeights(it.profile, M);
    capexByItem[it.key] = weights[it.key]!.map((w) => w * it.eurPerKw * scale);
  }
  const contingency = ctx.inputs.capex.items.reduce((a, it) => a + it.eurPerKw, 0) * ctx.inputs.capex.contingencyPct;
  weights.contingency = profileWeights("linear", M);
  capexByItem.contingency = weights.contingency.map((w) => w * contingency * scale);
  return { weights, capexByItem };
}

// ---------------------------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------------------------

export function equityFlows(result: Pick<ModelResult, "construction" | "annual">): DatedFlow[] {
  return [
    ...result.construction.map((m) => ({ day: toDay(m.date), amount: -m.equityDraw })),
    ...result.annual.map((a) => ({ day: toDay(a.cashFlowDate), amount: a.distribution })),
  ];
}

/** Project view: capex and the start-up liquidity (its release shows in the change in working capital). */
function projectFlows(cons: ConstructionResult, annual: AnnualRow[], kind: "pre" | "post"): DatedFlow[] {
  return [
    ...cons.months.map((m) => ({ day: toDay(m.date), amount: -m.capex - m.workingCapitalFunding })),
    ...annual.map((a) => ({
      day: toDay(a.cashFlowDate),
      amount: kind === "pre" ? a.projectCashFlowPreTax : a.projectCashFlowPostTax,
    })),
  ];
}

function computeKpis(ctx: Context, cons: ConstructionResult, annual: AnnualRow[], debt: number): Kpis {
  const { inputs } = ctx;
  const eq = equityFlows({ construction: cons.months, annual });
  const pre = projectFlows(cons, annual, "pre");
  const post = projectFlows(cons, annual, "post");

  // LCOE in the style of Fraunhofer ISE: capex, opex and decommissioning over electricity sold, discounted.
  const decomCost = annual.reduce((s, a) => s + a.decommissioningPaid, 0);
  const endYear = parts(ctx.endDay - 1).year;
  const lcoe = (rate: number, real: boolean) => {
    const deflate = (year: number) => (real ? ctx.index(year, 2026) : 1);
    let costs = 0;
    let energy = 0;
    cons.months.forEach((m) => {
      const day = toDay(m.date);
      costs += m.capex / deflate(parts(day).year) / Math.pow(1 + rate, (day - ctx.fcDay) / 365);
    });
    annual.forEach((a) => {
      const t = (toDay(a.cashFlowDate) - ctx.fcDay) / 365;
      const df = Math.pow(1 + rate, t);
      costs += (a.opex - a.municipalRefund) / deflate(a.year) / df;
      energy += a.energySoldKwh / df;
    });
    costs += decomCost / deflate(endYear) / Math.pow(1 + rate, (ctx.endDay - 1 - ctx.fcDay) / 365);
    return energy > 0 ? (costs / energy) * 100 : NaN;
  };

  let minDscr: number | null = null;
  let minDscrYear: number | null = null;
  for (const a of annual) {
    if (a.dscr !== null && (minDscr === null || a.dscr < minDscr)) {
      minDscr = a.dscr;
      minDscrYear = a.year;
    }
  }
  const repaying = annual.filter((a) => a.dscr !== null && a.principal >= DEBT_DUST).map((a) => a.dscr!);
  let llcr: number | null = null;
  if (debt > 0) {
    const r = inputs.financing.interestRate;
    let pv = 0;
    annual.forEach((a, i) => {
      if (a.year > ctx.loan.maturityYear) return;
      // A loan maturing during the year counts that year's cash flow only up to maturity, discounted to it.
      const s = ctx.years[i]!;
      const share = a.year < ctx.loan.maturityYear ? 1 : Math.min(1, Math.max(0, (ctx.loan.maturityDay + 1 - s.start) / Math.max(1, s.end - s.start)));
      const day = Math.min(toDay(a.cashFlowDate), ctx.loan.maturityDay);
      pv += (share * a.cfads) / Math.pow(1 + r, (day - ctx.codDay) / 365);
    });
    llcr = pv / debt;
  }

  return {
    equityIrr: xirr(eq).rate,
    projectIrrPreTax: xirr(pre).rate,
    projectIrrPostTax: xirr(post).rate,
    npvEquity: xnpv(inputs.macro.costOfEquity, eq, ctx.fcDay),
    npvProject: xnpv(inputs.macro.waccNominal, post, ctx.fcDay),
    lcoeRealCt: lcoe(inputs.macro.waccReal, true),
    lcoeNominalCt: lcoe(inputs.macro.waccNominal, false),
    minDscr,
    minDscrYear,
    avgDscr: repaying.length ? repaying.reduce((a, b) => a + b, 0) / repaying.length : null,
    llcr,
    paybackYears: payback(eq, ctx.codDay),
    debt,
    equity: cons.equity,
    totalUses: cons.uses,
    gearing: cons.uses > 0 ? debt / cons.uses : 0,
    capex: cons.capexNet,
    capexPerKw: cons.capexNet / ctx.capacityKw,
    awCt: ctx.aw * 100,
    correctionFactor: ctx.kf,
    fullLoadHoursP50: ctx.hoursP50,
    capacityMw: ctx.capacityKw / 1000,
  };
}

/** Years from COD until the cumulative equity cash flow turns non-negative (linear between dates). */
function payback(flows: DatedFlow[], codDay: number): number | null {
  const sorted = [...flows].sort((a, b) => a.day - b.day);
  let cum = 0;
  let prevDay = sorted[0]?.day ?? codDay;
  for (const f of sorted) {
    const before = cum;
    cum += f.amount;
    if (before < 0 && cum >= 0 && f.amount > 0) {
      const day = prevDay + ((f.day - prevDay) * -before) / f.amount;
      return Math.max(0, (day - codDay) / 365.25);
    }
    prevDay = f.day;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Checks and validity
// ---------------------------------------------------------------------------------------------

/** KfW 270 term variants (Merkblatt 05/2025): [loan term up to (years), grace years at most]. */
export const KFW_VARIANTS: readonly (readonly [number, number])[] = [
  [5, 1],
  [10, 2],
  [20, 3],
  [30, 5],
];
/** KfW 270 drawdown period in months, and the longest it can be extended to (12 + 24). */
export const KFW_DRAWDOWN_MONTHS = 12;
export const KFW_DRAWDOWN_MAX_MONTHS = 36;

/** The variant is the first whose term is not shorter than the loan's; a longer loan has none. */
function kfwVariantOk(tenor: number, grace: number): boolean {
  const variant = KFW_VARIANTS.find(([term]) => tenor <= term);
  return variant !== undefined && grace <= variant[1];
}

function runChecks(
  ctx: Context,
  cons: ConstructionResult,
  annual: AnnualRow[],
  kpis: Kpis,
  sizing: Sizing,
  info: SizingInfo,
  schedule: DebtSchedule,
  lockUpYears: number[],
): Check[] {
  const { inputs } = ctx;
  const f = inputs.financing;
  const checks: Check[] = [];
  const add = (
    id: string,
    group: CheckGroup,
    ok: boolean,
    severity: Check["severity"],
    value: number | string | null,
    detail: string,
  ) => checks.push({ id, group, ok, severity, value, detail });

  // Integrity: the calculation itself.
  const su = cons.uses - (cons.debtDrawn + cons.equity);
  add("sourcesEqualUses", "integrity", Math.abs(su) < TOLERANCE, "error", su, "Sources minus uses of funds (€)");
  add(
    "constructionBalance",
    "integrity",
    Math.abs(cons.balanceDifference) < TOLERANCE,
    "error",
    cons.balanceDifference,
    "Balance sheet at COD: assets minus liabilities and equity (€)",
  );
  const lastYear = ctx.years[ctx.years.length - 1]!.year;
  const outstanding = schedule.years.get(Math.min(ctx.loan.maturityYear, lastYear))?.close ?? 0;
  add("loanRepaid", "integrity", Math.abs(outstanding) < TOLERANCE, "error", outstanding, "Loan balance after the last instalment (€)");
  add(
    "loanWithinLifetime",
    "integrity",
    ctx.loan.maturityDay < ctx.endDay,
    "error",
    toIso(ctx.loan.maturityDay),
    "Loan matures before the end of the operating life",
  );
  const bsMax = Math.max(0, ...annual.map((a) => Math.abs(a.balanceDifference)));
  add("balanceSheet", "integrity", bsMax < TOLERANCE, "error", bsMax, "Largest balance-sheet difference at a year end (€)");
  add("converged", "integrity", sizing.converged, "error", sizing.iterations, "Debt sizing iteration converged");
  if (!sizing.locked) {
    const ok50 = info.minBankDscrP50 === null || info.minBankDscrP50 >= f.targetDscrP50 - 1e-6;
    const ok90 = info.minBankDscrP90 === null || info.minBankDscrP90 >= f.targetDscrP90 - 1e-6;
    add(
      "lenderTargets",
      "integrity",
      ok50 && ok90,
      "error",
      info.minBankDscrP90,
      "The final loan meets both DSCR targets in the lender's case",
    );
  }
  if (!sizing.locked) {
    add("gearing", "integrity", kpis.gearing <= f.maxGearing + 1e-9, "error", kpis.gearing, "Debt / total uses against the maximum");
  }
  const eqIrr = xirr(equityFlows({ construction: cons.months, annual }));
  add(
    "equityIrrDefined",
    "integrity",
    eqIrr.rate !== null && eqIrr.roots.length <= 1,
    "warning",
    eqIrr.roots.length,
    "Equity IRR exists and is unique between −95 % and +150 %",
  );

  // Funding: can the company pay its obligations?
  const minCash = Math.min(0, ...annual.map((a) => a.cashDeficit));
  add("noNegativeCash", "funding", minCash > -TOLERANCE, "error", minCash, "Lowest cash balance after the waterfall (€)");
  const lastDeficit = annual[annual.length - 1]!.cashDeficit;
  add(
    "closureFunded",
    "funding",
    lastDeficit > -TOLERANCE,
    "error",
    lastDeficit,
    "The final year's cash covers decommissioning; payments by the owners are not modelled (€)",
  );

  // Covenant.
  add(
    "dscrCovenant",
    "covenant",
    kpis.minDscr === null || kpis.minDscr >= f.covenantDscr - 1e-9,
    "error",
    kpis.minDscr,
    `Minimum DSCR against the covenant of ${f.covenantDscr.toFixed(2)}`,
  );
  add("noLockUp", "covenant", lockUpYears.length === 0, "warning", lockUpYears.length, "Years with distributions held back");

  // Inputs: plausibility.
  const fc = ctx.fcDay;
  const notice = toDay(inputs.revenue.awardNoticeDate);
  add(
    "awardWithinCeiling",
    "inputs",
    inputs.revenue.awardPriceCt <= inputs.revenue.ceilingPriceCt + 1e-9,
    "warning",
    inputs.revenue.awardPriceCt,
    `Award price against the ceiling of ${inputs.revenue.ceilingPriceCt} ct/kWh`,
  );
  add(
    "awardBeforeClose",
    "inputs",
    notice <= fc,
    "warning",
    inputs.revenue.awardNoticeDate,
    "The award is announced before financial close",
  );
  const needsMinimum = ctx.years.some((s) => s.year >= 2027);
  add(
    "hebesatzMinimum",
    "inputs",
    !needsMinimum || inputs.tax.hebesatz >= TAX.minHebesatzFrom2027 - 1e-9,
    "warning",
    inputs.tax.hebesatz,
    "Trade-tax multiplier at or above the statutory minimum of 280 % (from 2027)",
  );
  add(
    "degressiveEligible",
    "inputs",
    !inputs.tax.degressive || degressiveAllowed(ctx),
    "warning",
    toIso(ctx.codDay),
    "Declining-balance depreciation needs completion between 1 Jul 2025 and 31 Dec 2027",
  );
  add(
    "kfwTerms",
    "inputs",
    kfwVariantOk(f.tenorYearsFromClose, f.graceYears),
    "warning",
    `${f.tenorYearsFromClose}/${f.graceYears}`,
    "Loan term and grace years match a KfW 270 variant",
  );
  add(
    "kfwDrawdown",
    "inputs",
    inputs.project.constructionMonths <= KFW_DRAWDOWN_MONTHS,
    inputs.project.constructionMonths > KFW_DRAWDOWN_MAX_MONTHS ? "warning" : "info",
    inputs.project.constructionMonths,
    "Drawdown within the KfW period of 12 months (extendable by up to 24 months)",
  );

  // Scope: cases the model covers only partly.
  add(
    "awardValid",
    "scope",
    ctx.codDay <= addMonths(notice, AWARD_LAPSE_MONTHS),
    "error",
    toIso(ctx.codDay),
    `Commissioning before the award lapses, 36 months after its announcement (§ 36e EEG): ${toIso(addMonths(notice, AWARD_LAPSE_MONTHS))}`,
  );
  add(
    "noPenalty",
    "scope",
    ctx.codDay <= addMonths(notice, AWARD_PENALTY_MONTHS),
    "warning",
    toIso(ctx.codDay),
    `Commissioning within 30 months of the award announcement; later, a § 55 EEG penalty applies (not modelled)`,
  );
  add(
    "tenorWithinSupport",
    "scope",
    ctx.loan.maturityDay < ctx.eegEndDay,
    "warning",
    toIso(ctx.loan.maturityDay),
    `Loan matures before the EEG support ends (${toIso(ctx.eegEndDay)})`,
  );
  const maxInterest = Math.max(0, ...annual.map((a) => a.interest));
  add(
    "interestBarrier",
    "scope",
    maxInterest < TAX.interestBarrierThreshold,
    "warning",
    maxInterest,
    "Interest below the € 3 m threshold of the interest barrier (§ 4h EStG is not modelled)",
  );
  const minBook = Math.min(...annual.map((a) => a.bookEquity));
  add(
    "bookEquity",
    "scope",
    minBook > -TOLERANCE,
    "warning",
    minBook,
    "Book equity stays positive; otherwise distributions may be restricted (§ 30 GmbHG, § 172 (4) HGB)",
  );
  add(
    "oneSidedPremium",
    "scope",
    !inputs.revenue.twoSidedPremium,
    "info",
    inputs.revenue.twoSidedPremium ? "two-sided" : "one-sided",
    "Two-sided premium is a simplified stress, not the EEG 2027 draft calculation",
  );
  return checks;
}

function validityOf(checks: Check[], annual: AnnualRow[], kpis: Kpis, covenant: number, lockUpYears: number[]): Validity {
  const level = (g: CheckGroup): ValidityLevel => {
    const failed = checks.filter((c) => c.group === g && !c.ok);
    if (failed.some((c) => c.severity === "error")) return "error";
    if (failed.some((c) => c.severity === "warning")) return "warning";
    return "ok";
  };
  const deficits = annual.filter((a) => a.cashDeficit < -TOLERANCE);
  const integrity = level("integrity");
  const funding = level("funding");
  return {
    inputs: level("inputs"),
    integrity,
    funding,
    covenant: level("covenant"),
    scope: level("scope"),
    returnsMeaningful: integrity !== "error" && funding !== "error",
    shortfall: deficits.length
      ? { year: deficits[0]!.year, amount: -Math.min(...deficits.map((a) => a.cashDeficit)) }
      : null,
    covenantBreach:
      kpis.minDscr !== null && kpis.minDscrYear !== null && kpis.minDscr < covenant - 1e-9
        ? { year: kpis.minDscrYear, dscr: kpis.minDscr }
        : null,
    lockUpYears,
  };
}
