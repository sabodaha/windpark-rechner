// The model: monthly construction, annual operations, taxes, debt sizing, cash waterfall, KPIs, checks.
// Pure and deterministic: runModel(inputs) always returns the same result for the same inputs.
import { addMonths, addYears, daysInYear, overlap, parts, toDay, toIso, yearStart } from "./dates";
import { anzulegenderWert, correctionFactor, marketPremium, SUPPORT_YEARS } from "./eeg";
import { annuityFactor, xirr, xnpv, type DatedFlow } from "./finance";
import { computeTaxes, depreciation, TAX } from "./tax";
import type {
  AnnualRow,
  Check,
  ConstructionMonth,
  Inputs,
  Kpis,
  LockedDebt,
  ModelResult,
  PaymentProfile,
  ScenarioAdjustments,
  SizingInfo,
  SourcesUses,
} from "./types";

/** Anlage 2 Nr. 7 EEG: up to 2 % unavailability is already part of the Standortertrag. */
const AVAILABILITY_IN_SITE_YIELD = 0.98;
/** z-value of the 90 % one-sided quantile of a normal distribution. */
export const P90_Z = 1.2816;
const TOLERANCE = 1; // € — accounting checks
const DEBT_TOLERANCE = 0.5; // € — convergence of the debt size

export const NEUTRAL_SCENARIO: ScenarioAdjustments = { energyScale: 1, priceScale: 1, opexScale: 1, capexScale: 1 };

export interface RunOptions {
  scenario?: Partial<ScenarioAdjustments>;
  /** Keep the loan of another run (P90 / downside after financial close). */
  lockedDebt?: LockedDebt;
}

interface YearSlot {
  year: number;
  fraction: number;
  eegShare: number;
  cfDay: number;
  operatingYear: number;
  isLast: boolean;
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
  repayStart: number;
  maturityYear: number;
  maturityDay: number;
  kf: number;
  aw: number;
  hoursP50: number;
  basePrice: Map<number, number>;
  marketValue: Map<number, number>;
  index: (year: number, base: number) => number;
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

function buildContext(inputs: Inputs, adj: ScenarioAdjustments): Context {
  const p = inputs.project;
  const capacityKw = p.turbines * p.turbineMw * 1000;
  const fcDay = toDay(p.financialClose);
  const codDay = addMonths(fcDay, p.constructionMonths);
  const endDay = addYears(codDay, p.lifetimeYears);
  const supportEnd = addYears(codDay, SUPPORT_YEARS);
  // § 51a EEG: support extended by the number of negative-price periods, rounded up to full days.
  const eegEndDay = supportEnd + Math.ceil(inputs.energy.negativePriceTimeShare * (supportEnd - codDay));
  const codYear = parts(codDay).year;
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
    const s = Math.max(codDay, yearStart(y));
    const e = Math.min(endDay, yearStart(y + 1));
    const opDays = e - s;
    years.push({
      year: y,
      fraction: opDays / daysInYear(y),
      eegShare: opDays > 0 ? overlap(s, e, codDay, eegEndDay) / opDays : 0,
      cfDay: e - 1,
      operatingYear: y - codYear,
      isLast: y === lastYear,
    });
  }

  const fcYear = parts(fcDay).year;
  const repayStart = Math.max(fcYear + inputs.financing.graceYears, codYear);
  const maturityYear = fcYear + inputs.financing.tenorYearsFromClose - 1;

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
    repayStart,
    maturityYear,
    maturityDay: yearStart(maturityYear + 1) - 1,
    kf,
    aw,
    hoursP50,
    basePrice,
    marketValue,
    index,
  };
}

// ---------------------------------------------------------------------------------------------
// Operations: energy, revenue, opex, EBITDA per calendar year
// ---------------------------------------------------------------------------------------------

type PriceMode = "base" | "bankFloor";

interface OperatingYear {
  energy: number;
  sold: number;
  base: number;
  marketValue: number;
  premiumRate: number;
  revenueMarket: number;
  revenuePremium: number;
  revenuePostEeg: number;
  revenue: number;
  premiumAdvance: number;
  maintenance: number;
  management: number;
  insurance: number;
  other: number;
  lease: number;
  directMarketing: number;
  municipal: number;
  guaranteeFee: number;
  gridFee: number;
  opex: number;
  municipalRefund: number;
  ebitda: number;
  receivables: number;
}

function operatingYears(ctx: Context, mode: PriceMode, energyScale: number): OperatingYear[] {
  const { inputs, adj, capacityKw } = ctx;
  const r = inputs.revenue;
  const o = inputs.opex;
  const bond = inputs.project.hubHeightM * o.decommissioningBondPerMeterHub * inputs.project.turbines;
  return ctx.years.map((s) => {
    const y = s.year;
    const energy =
      capacityKw * ctx.hoursP50 * s.fraction * Math.pow(1 - inputs.energy.degradationPerYear, s.operatingYear) * energyScale;
    const sold = energy * (1 - inputs.energy.negativePriceOutputShare);
    const mv = ctx.marketValue.get(y)!;
    const mvPrev = ctx.marketValue.get(y - 1) ?? mv;
    const premiumRate = marketPremium(ctx.aw, mv, r.twoSidedPremium);
    const i26 = ctx.index(y, 2026);
    const postPrice = r.postEeg === "ppa" ? (r.ppaEurMwh2026 * i26 * adj.priceScale) / 1000 : mv;

    let revenueMarket: number;
    let revenuePremium: number;
    let premiumPositive: boolean;
    if (mode === "bankFloor") {
      // Lender view: only the guaranteed floor counts in the support period.
      revenueMarket = 0;
      revenuePremium = sold * ctx.aw * s.eegShare;
      premiumPositive = ctx.aw > 0;
    } else {
      // The market part is earned on all output: in negative-price periods the plant is curtailed and
      // loses only non-positive prices, which JW already contains. The premium is zero there (§ 51 EEG).
      revenueMarket = energy * mv * s.eegShare;
      revenuePremium = sold * premiumRate * s.eegShare;
      premiumPositive = premiumRate > 0;
    }
    const revenuePostEeg = energy * postPrice * (1 - s.eegShare);
    const revenue = revenueMarket + revenuePremium + revenuePostEeg;
    const premiumAdvance = sold * s.eegShare * marketPremium(ctx.aw, mvPrev, r.twoSidedPremium);

    const decade = s.operatingYear < 10 ? 0 : s.operatingYear < 20 ? 1 : 2;
    const fixed = capacityKw * ctx.index(y, 2025) * s.fraction * adj.opexScale;
    const maintenance = o.maintenancePerKw[decade] * fixed;
    const management = o.managementPerKw[decade] * fixed;
    const insurance = o.insurancePerKw[decade] * fixed;
    const other = o.otherPerKw[decade] * fixed;
    const lease = Math.max(
      o.leaseShareOfRevenue * revenue,
      o.leaseMinPerTurbine2026 * inputs.project.turbines * i26 * s.fraction,
    );
    const directMarketing = ((r.directMarketingCtKwh2026 * i26) / 100) * sold;
    const municipalShare = s.eegShare + (r.municipalAfterEeg ? 1 - s.eegShare : 0);
    const municipal = (r.municipalCtKwh / 100) * energy * municipalShare;
    const guaranteeFee = bond * o.guaranteeFeeRate * s.fraction;
    const gridFee = o.gridFeePerKw2026 * capacityKw * i26 * s.fraction * adj.opexScale;
    const opex =
      maintenance + management + insurance + other + lease + directMarketing + municipal + guaranteeFee + gridFee;
    // § 6 (5) EEG: refunded in the following year's final settlement for supported quantities.
    const municipalRefund = premiumPositive ? (r.municipalCtKwh / 100) * sold * s.eegShare : 0;
    const ebitda = revenue + municipalRefund - opex;
    const receivables = s.isLast
      ? 0
      : ((revenueMarket + revenuePostEeg) * r.receivableDays) / 365 + (revenuePremium - premiumAdvance) + municipalRefund;

    return {
      energy,
      sold,
      base: ctx.basePrice.get(y)!,
      marketValue: mv,
      premiumRate: mode === "bankFloor" ? ctx.aw : premiumRate,
      revenueMarket,
      revenuePremium,
      revenuePostEeg,
      revenue,
      premiumAdvance,
      maintenance,
      management,
      insurance,
      other,
      lease,
      directMarketing,
      municipal,
      guaranteeFee,
      gridFee,
      opex,
      municipalRefund,
      ebitda,
      receivables,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Senior debt
// ---------------------------------------------------------------------------------------------

interface DebtYear {
  open: number;
  interest: number;
  principal: number;
  close: number;
}

function debtSchedule(ctx: Context, amount: number, principalByYear?: Record<number, number>): Map<number, DebtYear> {
  const f = ctx.inputs.financing;
  const nRep = Math.max(1, ctx.maturityYear - ctx.repayStart + 1);
  const annuity = amount * annuityFactor(f.interestRate, nRep);
  const out = new Map<number, DebtYear>();
  let balance = amount;
  for (const s of ctx.years) {
    const open = balance;
    const inLife = s.year <= ctx.maturityYear;
    const interest = inLife ? open * f.interestRate * (s.year === ctx.codYear ? s.fraction : 1) : 0;
    let principal = 0;
    if (inLife && s.year >= ctx.repayStart) {
      if (principalByYear) principal = principalByYear[s.year] ?? 0;
      else if (f.repayment === "annuity") principal = annuity - interest;
      else principal = amount / nRep;
    }
    principal = Math.max(0, Math.min(principal, open));
    if (s.year === ctx.maturityYear && !principalByYear) principal = open;
    balance = open - principal;
    out.set(s.year, { open, interest, principal, close: balance });
  }
  return out;
}

function debtServiceOf(schedule: Map<number, DebtYear>, year: number): number {
  const d = schedule.get(year);
  return d ? d.interest + d.principal : 0;
}

/** DSRA target: the given months of next year's debt service. Initial funding at COD. */
function dsraTarget(ctx: Context, schedule: Map<number, DebtYear>, year: number): number {
  return (ctx.inputs.financing.dsraMonths / 12) * debtServiceOf(schedule, year + 1);
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
  equity: number;
  debtDrawn: number;
  balanceDifference: number;
}

function construction(ctx: Context, amount: number, dsra: number): ConstructionResult {
  const f = ctx.inputs.financing;
  const M = ctx.capexMonthly.length;
  const capexNet = ctx.capexMonthly.reduce((a, b) => a + b, 0);
  let uses = capexNet * 1.05 + dsra;
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
      const monthNeed = capex + upfront + commitment + idc + vatInterest + dsraFunding;
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
  const capitalized = uses - dsra;
  const balanceDifference = capitalized + dsra - (totals.drawn + totals.equity);
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
    equity: totals.equity,
    debtDrawn: totals.drawn,
    balanceDifference,
  };
}

// ---------------------------------------------------------------------------------------------
// Taxes and provisions
// ---------------------------------------------------------------------------------------------

function degressiveAllowed(ctx: Context): boolean {
  return ctx.inputs.tax.degressive && ctx.codDay <= toDay(TAX.degressiveWindowEnd);
}

/** Tax provision for decommissioning: accumulated pro rata, discounted at 5.5 %, today's prices. */
function provisionPath(ctx: Context): number[] {
  const cost2026 = ctx.inputs.opex.decommissioningCostPerKw2026 * ctx.capacityKw;
  const life = ctx.endDay - ctx.codDay;
  return ctx.years.map((s) => {
    const dayAfter = s.cfDay + 1;
    const elapsed = Math.min(1, (dayAfter - ctx.codDay) / life);
    const remainingYears = Math.max(0, (ctx.endDay - dayAfter) / 365);
    const cost = cost2026 * ctx.index(s.year, 2026);
    return (cost * elapsed) / Math.pow(1 + TAX.provisionDiscountRate, remainingYears);
  });
}

interface TaxPass {
  depreciation: number[];
  provisionChange: number[];
  ebt: number[];
  tradeTax: number[];
  corporateTax: number[];
  soli: number[];
  taxes: number[];
}

function taxPass(
  ctx: Context,
  ops: OperatingYear[],
  depreciationBase: number,
  interest: number[],
): TaxPass {
  const yearsList = ctx.years.map((s) => s.year);
  const dep = depreciation(
    depreciationBase,
    parts(ctx.codDay).month,
    ctx.inputs.tax.depreciationYears,
    degressiveAllowed(ctx),
    yearsList,
  );
  const prov = provisionPath(ctx);
  const provisionChange = prov.map((p, i) => p - (i > 0 ? prov[i - 1]! : 0));
  const ebt = ops.map((o, i) => o.ebitda - dep[i]! - interest[i]! - provisionChange[i]!);
  const t = computeTaxes(
    yearsList.map((year, i) => ({ year, ebt: ebt[i]!, interest: interest[i]!, lease: ops[i]!.lease })),
    ctx.inputs.tax.legalForm,
    ctx.inputs.tax.hebesatz,
  );
  const taxes = t.tradeTax.map((g, i) => g + t.corporateTax[i]! + t.soli[i]!);
  return { depreciation: dep, provisionChange, ebt, ...t, taxes };
}

// ---------------------------------------------------------------------------------------------
// Debt sizing
// ---------------------------------------------------------------------------------------------

interface Sizing {
  amount: number;
  principalByYear?: Record<number, number>;
  iterations: number;
  converged: boolean;
  gearingBound?: boolean;
  locked?: boolean;
}

/** DSCRs in the lender's case for a given loan: shows which target binds. */
function sizingInfo(ctx: Context, sizing: Sizing, schedule: Map<number, DebtYear>, capitalized: number): SizingInfo {
  const f = ctx.inputs.financing;
  const mode: PriceMode = ctx.inputs.revenue.bankPriceBasis === "floor" ? "bankFloor" : "base";
  const p90 = 1 - P90_Z * ctx.inputs.energy.sigma1y;
  const interest = ctx.years.map((s) => schedule.get(s.year)!.interest);
  const cf50 = cfadsForSizing(ctx, operatingYears(ctx, mode, ctx.adj.energyScale), capitalized, interest);
  const cf90 = cfadsForSizing(ctx, operatingYears(ctx, mode, ctx.adj.energyScale * p90), capitalized, interest);
  let min50: number | null = null;
  let min90: number | null = null;
  ctx.years.forEach((s, i) => {
    const ds = debtServiceOf(schedule, s.year);
    if (ds > 1e-9) {
      min50 = Math.min(min50 ?? Infinity, cf50[i]! / ds);
      min90 = Math.min(min90 ?? Infinity, cf90[i]! / ds);
    }
  });
  let binding: SizingInfo["binding"] = "none";
  if (sizing.locked) binding = "locked";
  else if (sizing.gearingBound) binding = "gearing";
  else if (min90 !== null && Math.abs(min90 - f.targetDscrP90) < 1e-4) binding = "dscrP90";
  else if (min50 !== null && Math.abs(min50 - f.targetDscrP50) < 1e-4) binding = "dscrP50";
  return { bankPriceBasis: ctx.inputs.revenue.bankPriceBasis, minBankDscrP50: min50, minBankDscrP90: min90, binding };
}

function sizeDebt(ctx: Context): Sizing {
  const f = ctx.inputs.financing;
  const mode: PriceMode = ctx.inputs.revenue.bankPriceBasis === "floor" ? "bankFloor" : "base";
  const p90 = 1 - P90_Z * ctx.inputs.energy.sigma1y;
  const bank50 = operatingYears(ctx, mode, ctx.adj.energyScale);
  const bank90 = operatingYears(ctx, mode, ctx.adj.energyScale * p90);
  const unit = debtSchedule(ctx, 1);
  const capexNet = ctx.capexMonthly.reduce((a, b) => a + b, 0);

  let amount = 0.6 * capexNet;
  let principalByYear: Record<number, number> | undefined;
  let converged = false;
  let iterations = 0;
  let gearingBound = false;
  for (let iter = 1; iter <= 200; iter++) {
    iterations = iter;
    const schedule = debtSchedule(ctx, amount, principalByYear);
    const cons = construction(ctx, amount, dsraTarget(ctx, schedule, ctx.codYear));
    const interest = ctx.years.map((s) => schedule.get(s.year)!.interest);
    const cf50 = cfadsForSizing(ctx, bank50, cons.capitalized, interest);
    const cf90 = cfadsForSizing(ctx, bank90, cons.capitalized, interest);

    let candidate = Infinity;
    let nextPrincipal: Record<number, number> | undefined;
    if (f.repayment === "sculpted") {
      const r = f.interestRate;
      let pv = 0;
      const targets: Record<number, number> = {};
      ctx.years.forEach((s, i) => {
        if (s.year >= ctx.repayStart && s.year <= ctx.maturityYear) {
          const ds = Math.max(0, Math.min(cf50[i]! / f.targetDscrP50, cf90[i]! / f.targetDscrP90));
          targets[s.year] = ds;
          pv += ds / Math.pow(1 + r, s.year - ctx.repayStart + 1);
        }
      });
      candidate = pv;
      // Interest-only years before the first repayment must also meet the targets.
      ctx.years.forEach((s, i) => {
        if (s.year < ctx.repayStart && s.year <= ctx.maturityYear) {
          const perUnit = r * (s.year === ctx.codYear ? s.fraction : 1);
          if (perUnit > 0) {
            candidate = Math.min(candidate, cf50[i]! / (f.targetDscrP50 * perUnit), cf90[i]! / (f.targetDscrP90 * perUnit));
          }
        }
      });
      candidate = Math.max(0, candidate);
      const scale = pv > 0 ? Math.min(1, candidate / pv) : 0;
      nextPrincipal = sculptedPrincipal(ctx, candidate, targets, scale);
    } else {
      ctx.years.forEach((s, i) => {
        const a = debtServiceOf(unit, s.year);
        if (a > 0) {
          candidate = Math.min(candidate, cf50[i]! / (f.targetDscrP50 * a), cf90[i]! / (f.targetDscrP90 * a));
        }
      });
      candidate = Number.isFinite(candidate) ? Math.max(0, candidate) : 0;
    }

    // Gearing cap: debt ≤ max gearing × total uses, where uses depend on the debt (fees, interest).
    let capped = candidate;
    for (let k = 0; k < 50; k++) {
      const sch = debtSchedule(ctx, capped, rescale(nextPrincipal, candidate, capped));
      const limit = f.maxGearing * construction(ctx, capped, dsraTarget(ctx, sch, ctx.codYear)).uses;
      if (capped <= limit + 1e-6) break;
      capped = limit;
    }
    nextPrincipal = rescale(nextPrincipal, candidate, capped);
    gearingBound = capped < candidate - DEBT_TOLERANCE;

    const done = Math.abs(capped - amount) < DEBT_TOLERANCE;
    amount = iter > 50 ? (amount + capped) / 2 : capped;
    principalByYear = nextPrincipal;
    if (done) {
      amount = capped;
      converged = true;
      break;
    }
  }
  return { amount, principalByYear, iterations, converged, gearingBound };
}

function rescale(
  principal: Record<number, number> | undefined,
  from: number,
  to: number,
): Record<number, number> | undefined {
  if (!principal || from <= 0 || from === to) return principal;
  const k = to / from;
  return Object.fromEntries(Object.entries(principal).map(([y, v]) => [y, v * k]));
}

function sculptedPrincipal(
  ctx: Context,
  amount: number,
  targets: Record<number, number>,
  scale: number,
): Record<number, number> {
  const r = ctx.inputs.financing.interestRate;
  const out: Record<number, number> = {};
  let balance = amount;
  for (let y = ctx.repayStart; y <= ctx.maturityYear; y++) {
    const interest = balance * r;
    const p = y === ctx.maturityYear ? balance : Math.min(balance, Math.max(0, (targets[y] ?? 0) * scale - interest));
    out[y] = p;
    balance -= p;
  }
  return out;
}

function cfadsForSizing(ctx: Context, ops: OperatingYear[], capitalized: number, interest: number[]): number[] {
  const t = taxPass(ctx, ops, capitalized, interest);
  return ops.map((o, i) => o.ebitda - t.taxes[i]!);
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

export function runModel(inputs: Inputs, options: RunOptions = {}): ModelResult {
  const adj: ScenarioAdjustments = { ...NEUTRAL_SCENARIO, ...options.scenario };
  const ctx = buildContext(inputs, adj);
  let sizing: Sizing;
  if (options.lockedDebt) {
    sizing = {
      amount: options.lockedDebt.amount,
      principalByYear: options.lockedDebt.principalByYear,
      iterations: 0,
      converged: true,
      locked: true,
    };
  } else sizing = sizeDebt(ctx);
  return assemble(ctx, sizing);
}

function assemble(ctx: Context, sizing: Sizing): ModelResult {
  const { inputs } = ctx;
  const f = inputs.financing;
  const ops = operatingYears(ctx, "base", ctx.adj.energyScale);
  const schedule = debtSchedule(ctx, sizing.amount, sizing.principalByYear);
  const dsra0 = dsraTarget(ctx, schedule, ctx.codYear);
  const cons = construction(ctx, sizing.amount, dsra0);
  const interest = ctx.years.map((s) => schedule.get(s.year)!.interest);
  const levered = taxPass(ctx, ops, cons.capitalized, interest);
  const unlevered = taxPass(ctx, ops, cons.capexNet, interest.map(() => 0));
  const provision = provisionPath(ctx);
  const decomCost = inputs.opex.decommissioningCostPerKw2026 * ctx.capacityKw * ctx.index(parts(ctx.endDay - 1).year, 2026);
  const reserveYears = ctx.years.filter((s) => ctx.endDay - (s.cfDay + 1) < inputs.opex.decommissioningReserveYears * 365).length;

  const annual: AnnualRow[] = [];
  let receivablesPrev = 0;
  let dsra = dsra0;
  let reserve = 0;
  let trapped = 0;
  let deficit = 0;
  let cumDistribution = 0;
  let cumNetIncome = 0;
  let cumDepreciation = 0;
  let contributionsLeft = reserveYears;

  ctx.years.forEach((s, i) => {
    const o = ops[i]!;
    const d = schedule.get(s.year)!;
    const taxes = levered.taxes[i]!;
    const deltaWc = o.receivables - receivablesPrev;
    receivablesPrev = o.receivables;
    const cfads = o.ebitda - deltaWc - taxes;
    const debtService = d.interest + d.principal;
    let cash = cfads - debtService + deficit;

    // Debt service reserve: top up to next year's target, release the excess, draw on shortfall.
    const target = s.year <= ctx.maturityYear ? dsraTarget(ctx, schedule, s.year) : 0;
    if (target > dsra) {
      const top = Math.min(target - dsra, Math.max(0, cash));
      dsra += top;
      cash -= top;
    } else {
      cash += dsra - target;
      dsra = target;
    }
    if (cash < 0) {
      const draw = Math.min(dsra, -cash);
      dsra -= draw;
      cash += draw;
    }

    // Decommissioning reserve: equal instalments in the last years, paid out at the end of life.
    let decommissioningPaid = 0;
    const inReserveWindow = ctx.endDay - (s.cfDay + 1) < inputs.opex.decommissioningReserveYears * 365;
    if (inReserveWindow && contributionsLeft > 0) {
      const planned = (decomCost - reserve) / contributionsLeft;
      const contribution = s.isLast ? decomCost - reserve : Math.min(Math.max(0, cash), planned);
      reserve += contribution;
      cash -= contribution;
      contributionsLeft -= 1;
    }
    if (s.isLast) {
      decommissioningPaid = decomCost;
      reserve -= decomCost;
    }

    // Lock-up: distributions stay in the company while the DSCR is below the threshold.
    const dscr = debtService > 1e-9 ? cfads / debtService : null;
    if (dscr !== null && dscr < f.lockupDscr && s.year <= ctx.maturityYear) {
      if (cash > 0) {
        trapped += cash;
        cash = 0;
      }
    } else if (trapped > 0) {
      cash += trapped;
      trapped = 0;
    }
    if (s.isLast) {
      cash += dsra + trapped + reserve;
      dsra = 0;
      trapped = 0;
      reserve = 0;
    }

    let distribution = 0;
    if (cash >= 0 || s.isLast) {
      distribution = cash; // negative only in the final year: shortfall funded by the owners
      deficit = 0;
    } else deficit = cash;
    cumDistribution += distribution;

    const netIncome = levered.ebt[i]! - taxes;
    cumNetIncome += netIncome;
    cumDepreciation += levered.depreciation[i]!;
    const provisionClosing = s.isLast ? 0 : provision[i]!;
    const assets = cons.capitalized - cumDepreciation + o.receivables + dsra + reserve + trapped + deficit;
    const liabilities = d.close + provisionClosing;
    const equityBook = cons.equity - cumDistribution + cumNetIncome;
    const balanceDifference = assets - liabilities - equityBook;

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
      awEurKwh: ctx.aw,
      premiumEurKwh: o.premiumRate,
      revenueMarket: o.revenueMarket,
      revenuePremium: o.revenuePremium,
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
    totalUses: cons.uses,
    debt: cons.debtDrawn,
    equity: cons.equity,
    totalSources: cons.debtDrawn + cons.equity,
  };

  const kpis = computeKpis(ctx, cons, annual, sizing.amount);
  const lockedDebt: LockedDebt = {
    amount: sizing.amount,
    principalByYear: Object.fromEntries([...schedule.entries()].map(([y, d]) => [y, d.principal])),
  };
  const checks = runChecks(ctx, cons, annual, kpis, sizing, schedule);

  return {
    sizing: sizingInfo(ctx, sizing, schedule, cons.capitalized),
    timeline: {
      financialClose: toIso(ctx.fcDay),
      cod: toIso(ctx.codDay),
      endOfLife: toIso(ctx.endDay),
      eegEnd: toIso(ctx.eegEndDay),
      loanMaturity: toIso(ctx.maturityDay),
    },
    construction: cons.months,
    annual,
    sourcesUses,
    kpis,
    checks,
    lockedDebt,
    iterations: sizing.iterations,
    converged: sizing.converged,
  };
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

function computeKpis(ctx: Context, cons: ConstructionResult, annual: AnnualRow[], debt: number): Kpis {
  const { inputs } = ctx;
  const eq = equityFlows({ construction: cons.months, annual });
  const capexFlows = cons.months.map((m) => ({ day: toDay(m.date), amount: -m.capex }));
  const pre = [...capexFlows, ...annual.map((a) => ({ day: toDay(a.cashFlowDate), amount: a.projectCashFlowPreTax }))];
  const post = [...capexFlows, ...annual.map((a) => ({ day: toDay(a.cashFlowDate), amount: a.projectCashFlowPostTax }))];

  // LCOE as in Fraunhofer ISE: capex, opex and decommissioning over electricity produced, discounted.
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

  const dscrs = annual.filter((a) => a.dscr !== null).map((a) => a.dscr!);
  let llcr: number | null = null;
  if (debt > 0) {
    const r = inputs.financing.interestRate;
    let pv = 0;
    annual.forEach((a) => {
      if (a.year <= ctx.maturityYear) pv += a.cfads / Math.pow(1 + r, (toDay(a.cashFlowDate) - ctx.codDay) / 365);
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
    minDscr: dscrs.length ? Math.min(...dscrs) : null,
    avgDscr: dscrs.length ? dscrs.reduce((a, b) => a + b, 0) / dscrs.length : null,
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
// Checks
// ---------------------------------------------------------------------------------------------

function runChecks(
  ctx: Context,
  cons: ConstructionResult,
  annual: AnnualRow[],
  kpis: Kpis,
  sizing: Sizing,
  schedule: Map<number, DebtYear>,
): Check[] {
  const { inputs } = ctx;
  const f = inputs.financing;
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, severity: Check["severity"], value: number | string | null, detail: string) =>
    checks.push({ id, ok, severity, value, detail });

  const su = cons.uses - (cons.debtDrawn + cons.equity);
  add("sourcesEqualUses", Math.abs(su) < TOLERANCE, "error", su, "Sources minus uses of funds (€)");
  add(
    "constructionBalance",
    Math.abs(cons.balanceDifference) < TOLERANCE,
    "error",
    cons.balanceDifference,
    "Balance sheet at COD: assets minus liabilities and equity (€)",
  );
  const atMaturity = schedule.get(Math.min(ctx.maturityYear, ctx.years[ctx.years.length - 1]!.year));
  const outstanding = atMaturity ? atMaturity.close : 0;
  add("loanRepaid", Math.abs(outstanding) < TOLERANCE, "error", outstanding, "Loan balance after the last instalment (€)");
  add(
    "loanWithinLifetime",
    ctx.maturityDay < ctx.endDay,
    "error",
    toIso(ctx.maturityDay),
    "Loan matures before the end of the operating life",
  );
  const minCash = Math.min(0, ...annual.map((a) => a.cashDeficit));
  add("noNegativeCash", minCash > -TOLERANCE, "error", minCash, "Lowest cash balance after the waterfall (€)");
  add(
    "dscrCovenant",
    kpis.minDscr === null || kpis.minDscr >= f.covenantDscr - 1e-9,
    "error",
    kpis.minDscr,
    `Minimum DSCR against the covenant of ${f.covenantDscr.toFixed(2)}`,
  );
  add("gearing", kpis.gearing <= f.maxGearing + 1e-9, "error", kpis.gearing, "Debt / total uses against the maximum");
  const bsMax = Math.max(0, ...annual.map((a) => Math.abs(a.balanceDifference)));
  add("balanceSheet", bsMax < TOLERANCE, "error", bsMax, "Largest balance-sheet difference at a year end (€)");
  add("converged", sizing.converged, "error", sizing.iterations, "Debt sizing iteration converged");
  const eqIrr = xirr(equityFlows({ construction: cons.months, annual }));
  add(
    "equityIrrDefined",
    eqIrr.rate !== null && eqIrr.roots.length <= 1,
    eqIrr.rate === null ? "error" : "warning",
    eqIrr.roots.length,
    "Equity IRR exists and is unique",
  );
  add(
    "awardWithinCeiling",
    inputs.revenue.awardPriceCt <= inputs.revenue.ceilingPriceCt + 1e-9,
    "warning",
    inputs.revenue.awardPriceCt,
    `Award price against the ceiling of ${inputs.revenue.ceilingPriceCt} ct/kWh`,
  );
  add(
    "tenorWithinSupport",
    ctx.maturityDay < ctx.eegEndDay,
    "warning",
    toIso(ctx.maturityDay),
    `Loan matures before the EEG support ends (${toIso(ctx.eegEndDay)})`,
  );
  const needsMinimum = ctx.years.some((s) => s.year >= 2027);
  add(
    "hebesatzMinimum",
    !needsMinimum || inputs.tax.hebesatz >= TAX.minHebesatzFrom2027 - 1e-9,
    "warning",
    inputs.tax.hebesatz,
    "Trade-tax multiplier at or above the statutory minimum of 280 % (from 2027)",
  );
  add(
    "degressiveEligible",
    !inputs.tax.degressive || degressiveAllowed(ctx),
    "warning",
    toIso(ctx.codDay),
    "Declining-balance depreciation needs completion by 31 Dec 2027",
  );
  const maxInterest = Math.max(0, ...annual.map((a) => a.interest));
  add(
    "interestBarrier",
    maxInterest < TAX.interestBarrierThreshold,
    "info",
    maxInterest,
    "Net interest below the € 3 m threshold of the interest barrier",
  );
  return checks;
}
