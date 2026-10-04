// What the German battery calculator shows for one set of inputs (spec v1.2 R2.2 §9, §11, §15; R3.1 §8 for the revenue
// stack). The same functions run at build time (the static page shows the base case) and in the browser's worker, so both
// always agree. The view is a slim copy of the run: years, debt periods and payout dates, not the monthly ledgers.
import { toIso } from "@/engine/dates";
import { xnpv } from "@/engine/finance";
import { BESS_BASE, runBess, withDuration, type Library as UaLibrary, type Metric } from "../engine";
import { buildCalendar as buildUaCalendar } from "../engine/calendar";
import type { Duration } from "../engine/library";
import { bucketBudget } from "./funding";
import { contractualFunding, deInputChecks, kOfCase, runDe, tStarOfCase, tStarSolve, type DeMarketBasis, type KResult, type NpvAt, type TStarResult } from "./index";
import type { DeLibrary } from "./library";
import { DE_VARIANTS } from "./registry";
import { deTornado, deVariants, type DeTornado, type DeVariant } from "./sensitivity";
import type { DeCheck, DeInputs, DeLockedFunding, DeMetric, DeReservePath, DeStatus } from "./types";

const ym = (i: number) => `${2027 + Math.floor((1 + i) / 12)}-${String(((1 + i) % 12) + 1).padStart(2, "0")}`;

/** One calendar year of the case, summed from its months (money in nominal €, energy in AC MWh). */
export interface DeYear {
  year: number;
  /** Toll fee earned (accrued), the market slice after capture and the optimiser's fee, their sum. */
  tollEur: number;
  marketEur: number;
  revenueEur: number;
  /** The market revenue's parts (spec R3.1 §5): the captured day-ahead margin, the intraday uplift, aFRR capacity and
   *  the one fee on the positive parts; dayAhead + intraday + afrr − fee = market. Without the stack only the first and
   *  the fee are non-zero. */
  dayAheadEur: number;
  intradayEur: number;
  afrrEur: number;
  feeEur: number;
  /** aFRR held this year under the annual opportunity rule (spec R3.1 §2); null without the stack. */
  reserveHeld: boolean | null;
  opexEur: number;
  agnesEur: number;
  ebitdaEur: number;
  capexEur: number;
  /** Augmentation, PCS overhaul and decommissioning, net of VAT. */
  lifecycleEur: number;
  afaEur: number;
  interestEur: number;
  taxEur: number;
  netIncomeEur: number;
  cfadsEur: number;
  debtServicePaidEur: number;
  equityEur: number;
  distributionsEur: number;
  /** Balances at the year's last model month. */
  cashEndEur: number;
  reservesEndEur: number;
  debtEndEur: number;
  /** Physics over the year's operating months: average usable energy, average contracted energy (toll months),
   *  discharge, the lowest capacity factor of the toll. */
  usableMWh: number | null;
  contractMWh: number | null;
  dischargeMWh: number;
  capacityFactorMin: number | null;
  /** The year's spread multiplier M(y) and effective fee (spec §2.2–§2.3). */
  spreadM: number | null;
  importFee: number | null;
}

export interface DePeriodView {
  date: string;
  cfadsEur: number;
  debtServiceEur: number;
  dscr: number | null;
  /** The lender case of a sized loan: its DSCR and its bucket budget (spec §7.3). */
  lenderDscr: number | null;
  lenderBudgetEur: number | null;
  closingEur: number;
}

export interface DePayoutView {
  date: string;
  paidEur: number;
  freeCashEur: number;
  forecastHoldbackEur: number;
  cappedBy: string;
}

/** The 2029 revenue of one MW, from the market slice's gross trades to the company's revenue (spec §9.1). */
export interface DeBridge2029 {
  salesEur: number;
  purchasesEur: number;
  marginEur: number;
  captureEur: number;
  /** Spec R3.1: the intraday uplift and aFRR capacity revenue (0 without the stack). */
  intradayEur: number;
  afrrEur: number;
  optimiserFeeEur: number;
  marketEur: number;
  tollEur: number;
  revenueEur: number;
}

export interface DeCore {
  inputs: DeInputs;
  status: DeStatus;
  checks: DeCheck[];
  kpis: Record<string, DeMetric> | null;
  funding: DeLockedFunding | null;
  market: DeMarketBasis | null;
  calendar: {
    actualCod: string;
    tollFirst: string | null;
    tollLast: string | null;
    augmentation: string;
    pcsOverhaul: string;
    lastOperating: string;
    liquidation: string;
  } | null;
  capex: { totalEur: number; perKw: number; usesExVatEur: number } | null;
  years: DeYear[];
  periods: DePeriodView[];
  payouts: DePayoutView[];
  liquidationPayoutEur: number | null;
  bridge2029: DeBridge2029 | null;
  /** The lowest month-end cash and the first month below zero (an unfunded case, spec §8). */
  minCashEur: number | null;
  firstDeficit: string | null;
  /** With a loan: the same project without one — what the asset earns before leverage. */
  noDebt: { investorIrr: DeMetric; investorNpv: number | null } | null;
  /** The revenue stack of the case (spec R3.1): the first aFRR month and the years aFRR is held; null without it. */
  stack: { reserveStart: string; heldYears: number[] } | null;
}

export function computeDeCore(inputs: DeInputs, lib: DeLibrary): DeCore {
  const r = runDe(inputs, lib, { funding: contractualFunding(inputs, lib) });
  const plain = inputs.debt && r.status.primary === "ok" ? runDe({ ...inputs, debt: false }, lib) : null;
  const noDebt = plain?.kpis ? { investorIrr: plain.kpis.investorIrr!, investorNpv: plain.kpis.investorNpvEur!.value } : null;
  const stack = r.stack && r.cal
    ? { reserveStart: ym(r.stack.reserveStartIndex), heldYears: r.stack.years.filter((y) => y.held).map((y) => y.year) }
    : null;
  const base = { inputs, status: r.status, checks: r.checks, kpis: r.kpis, funding: r.funding, market: r.market ?? null, noDebt, stack };
  if (!r.cal || !r.ops || !r.ledger || !r.capex) {
    return { ...base, calendar: null, capex: null, years: [], periods: [], payouts: [], liquidationPayoutEur: null, bridge2029: null, minCashEur: null, firstDeficit: null };
  }
  const cal = r.cal;
  const om = r.ops.months;
  const led = r.ledger;
  const lm = led.months;
  const byYear = new Map<number, number[]>();
  cal.months.forEach((m, i) => byYear.set(m.year, [...(byYear.get(m.year) ?? []), i]));
  const years: DeYear[] = [...byYear.entries()].map(([year, idx]) => {
    const sum = (f: (i: number) => number) => idx.reduce((s, i) => s + f(i), 0);
    const ops = idx.filter((i) => om[i]!.usableMWhOpen !== null);
    const toll = idx.filter((i) => om[i]!.s > 0);
    const avg = (list: number[], f: (i: number) => number) => (list.length ? list.reduce((s, i) => s + f(i), 0) / list.length : null);
    const end = lm[idx[idx.length - 1]!]!;
    const y = led.years.find((x) => x.year === year);
    const rule = r.stack?.years.find((x) => x.year === year);
    return {
      year,
      tollEur: sum((i) => om[i]!.tollFeeAccruedEur),
      marketEur: sum((i) => om[i]!.marketNetEur),
      revenueEur: sum((i) => lm[i]!.revenueEur),
      dayAheadEur: sum((i) => om[i]!.capturedEur),
      intradayEur: sum((i) => om[i]!.intradayUpliftEur),
      afrrEur: sum((i) => om[i]!.capRevAfrrEur),
      feeEur: sum((i) => om[i]!.optimiserFeeEur),
      reserveHeld: rule ? rule.held : null,
      opexEur: sum((i) => om[i]!.opexTotalEur),
      agnesEur: sum((i) => om[i]!.agnesEur),
      ebitdaEur: sum((i) => lm[i]!.ebitdaEur),
      capexEur: sum((i) => lm[i]!.capexTotalEur),
      lifecycleEur: sum((i) => om[i]!.augmentationEur + om[i]!.pcsOverhaulEur + om[i]!.decommissioningEur),
      afaEur: sum((i) => lm[i]!.afaEur),
      interestEur: sum((i) => lm[i]!.interestExpenseEur),
      taxEur: y?.taxTotalEur ?? 0,
      netIncomeEur: sum((i) => lm[i]!.netIncomeEur),
      cfadsEur: sum((i) => lm[i]!.cfadsEur),
      debtServicePaidEur: sum((i) => lm[i]!.interestPaidEur + lm[i]!.principalPaidEur + lm[i]!.finalInterestPaidEur + lm[i]!.finalPrincipalPaidEur),
      equityEur: sum((i) => lm[i]!.equityEur),
      distributionsEur: sum((i) => lm[i]!.distributionEur),
      cashEndEur: end.cashCloseEur,
      reservesEndEur: end.dsraCloseEur + end.liquidityCloseEur,
      debtEndEur: end.debtCloseEur,
      usableMWh: avg(ops, (i) => om[i]!.usableMWhOpen ?? 0),
      contractMWh: avg(toll, (i) => om[i]!.contractUsableMWh ?? 0),
      dischargeMWh: sum((i) => om[i]!.dischargeMWh),
      capacityFactorMin: toll.length ? Math.min(...toll.map((i) => om[i]!.capacityFactor ?? 1)) : null,
      spreadM: ops.length ? om[ops[0]!]!.spreadM : null,
      importFee: ops.length ? om[ops[0]!]!.importFee : null,
    };
  });
  const sized = r.lender?.ledger.periods ?? null;
  const periods: DePeriodView[] = (r.funding?.debtEur ?? 0) > 0
    ? led.periods.map((p, k) => {
        const l = sized?.[k];
        return {
          date: toIso(p.day),
          cfadsEur: p.cfadsEur,
          debtServiceEur: p.debtServiceEur,
          dscr: p.dscr,
          lenderDscr: l ? l.dscr : null,
          lenderBudgetEur: l ? bucketBudget(l.cfadsCEur, l.cfadsMEur, inputs.targetDscrContracted, inputs.targetDscrMerchant) : null,
          closingEur: p.closingEur,
        };
      })
    : [];
  const payouts = led.distributions.map((d) => ({
    date: toIso(d.day), paidEur: d.paidEur, freeCashEur: d.freeCashEur, forecastHoldbackEur: d.forecastHoldbackEur, cappedBy: d.cappedBy,
  }));
  const in2029 = byYear.get(2029) ?? [];
  const per = (f: (i: number) => number) => in2029.reduce((s, i) => s + f(i), 0) / inputs.powerMW;
  const bridge2029: DeBridge2029 | null = in2029.length
    ? {
        salesEur: per((i) => om[i]!.salesEur),
        purchasesEur: per((i) => om[i]!.purchasesEur),
        marginEur: per((i) => om[i]!.marginEur),
        captureEur: per((i) => om[i]!.capturedEur - om[i]!.marginEur),
        intradayEur: per((i) => om[i]!.intradayUpliftEur),
        afrrEur: per((i) => om[i]!.capRevAfrrEur),
        optimiserFeeEur: per((i) => om[i]!.optimiserFeeEur),
        marketEur: per((i) => om[i]!.marketNetEur),
        tollEur: per((i) => om[i]!.tollFeeAccruedEur),
        revenueEur: per((i) => om[i]!.tollFeeAccruedEur + om[i]!.marketNetEur),
      }
    : null;
  const deficit = lm.findIndex((m) => m.cashCloseEur < -0.01);
  const capexTotal = r.capex.lines.reduce((s, l) => s + l.amount, 0);
  return {
    ...base,
    calendar: {
      actualCod: ym(cal.codIndex),
      tollFirst: cal.tollFirst === null ? null : ym(cal.tollFirst),
      tollLast: cal.tollLast === null ? null : ym(cal.tollLast),
      augmentation: ym(cal.augmentationIndex),
      pcsOverhaul: ym(cal.pcsOverhaulIndex),
      lastOperating: ym(cal.eolIndex - 1),
      liquidation: toIso(cal.liquidationDay),
    },
    capex: { totalEur: capexTotal, perKw: capexTotal / (inputs.powerMW * 1000), usesExVatEur: led.usesExVatEur },
    years,
    periods,
    payouts,
    liquidationPayoutEur: led.liquidationPayoutEur,
    bridge2029,
    minCashEur: led.minCashEur,
    firstDeficit: deficit < 0 ? null : ym(deficit),
  };
}

/** One saturation path of the revenue stack on the first screen (spec R3.1 §8, H03): the investor's result and the
 *  break-even toll price (or, without a toll, the spread multiplier) on that path. */
export interface DePathResult {
  path: DeReservePath;
  investorIrr: DeMetric | null;
  investorNpv: number | null;
  tStar: TStarResult | null;
  k: KResult | null;
}

/** The first screen's answer (spec §9.3): the break-even toll price T* with a toll, the break-even spread multiplier k
 *  without one. Slow (about forty full runs each); it follows the main run. With the revenue stack (spec R3.1 §8): the
 *  same for the three saturation paths, and the 2030 market revenue per MW of the whole battery without a toll — the
 *  number set beside the public forecasts. */
export interface DeExtras {
  tStar: TStarResult | null;
  k: KResult | null;
  paths: DePathResult[] | null;
  market2030PerMwEur: number | null;
}

const PATH_ORDER: DeReservePath[] = ["central", "fast", "slow"];

function breakEven(inputs: DeInputs, lib: DeLibrary): { tStar: TStarResult | null; k: KResult | null } {
  const toll = inputs.tollEnabled && inputs.tollShare > 0;
  const delayedLoan = inputs.debt && inputs.codDelayMonths > 0;
  return { tStar: toll ? (delayedLoan ? tStarDelayed(inputs, lib) : tStarOfCase(inputs, lib)) : null, k: toll ? null : kOfCase(inputs, lib) };
}

export function computeDeExtras(inputs: DeInputs, lib: DeLibrary): DeExtras {
  const own = breakEven(inputs, lib);
  if (inputs.stackEnabled !== true) return { ...own, paths: null, market2030PerMwEur: null };
  const paths = PATH_ORDER.map((path): DePathResult => {
    const at = { ...inputs, reservePath: path };
    const r = runDe(at, lib, { funding: contractualFunding(at, lib) });
    const ok = r.status.primary === "ok" && r.kpis;
    const be = path === inputs.reservePath ? own : breakEven(at, lib);
    return { path, investorIrr: ok ? r.kpis!.investorIrr! : null, investorNpv: ok ? r.kpis!.investorNpvEur!.value : null, ...be };
  });
  // the whole battery on the market (the merchant variant, no loan), 2030: toll fee 0, so revenue = market revenue
  const merchant = runDe({ ...inputs, ...DE_VARIANTS.merchant }, lib);
  const y30 = merchant.ledger?.years.find((y) => y.year === 2030);
  return { ...own, paths, market2030PerMwEur: merchant.status.primary === "ok" && y30 ? y30.revenueEur / inputs.powerMW : null };
}

/** T* of a delayed case with a loan: at each toll price the loan is sized on the contractual timing and the delay runs
 *  on it (spec §18, B03), as the main run does; otherwise the search of spec §9.2 unchanged. */
function tStarDelayed(inputs: DeInputs, lib: DeLibrary): TStarResult {
  if (deInputChecks(inputs).some((c) => c.status === "fail")) {
    return { outcome: "unsupported", value: null, coverage: null, candidates: [], roots: [], brackets: [] };
  }
  const cache = new Map<number, ReturnType<NpvAt>>();
  return tStarSolve((price, fresh) => {
    const hit = fresh ? undefined : cache.get(price);
    if (hit) return hit;
    const at = { ...inputs, tollPrice: price };
    const r = runDe(at, lib, { funding: contractualFunding(at, lib) });
    const supported = r.status.primary === "ok" && r.funding?.sizingStatus !== "failed";
    const out = { supported, funded: r.checks.find((c) => c.id === "cashNonNegative")?.status !== "fail", npv: r.kpis?.investorNpvEur?.value ?? null };
    if (!fresh) cache.set(price, out);
    return out;
  });
}

/** Sensitivity (spec §15): the tornado on the locked funding and the variants with the loan sized again. */
export interface DeSensitivity {
  tornado: DeTornado;
  variants: DeVariant[];
}

export function computeDeSensitivity(inputs: DeInputs, lib: DeLibrary, funding: DeLockedFunding | null): DeSensitivity {
  return { tornado: deTornado(inputs, lib, funding), variants: deVariants(inputs, lib) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The comparison with Ukraine (spec §11): fixed rows, the same battery in both markets

export type DeCompareRowId = "uaBase" | "uaNoDebt" | "deToll" | "deTollNoDebt" | "deMerchant";

export interface DeCompareRow {
  id: DeCompareRowId;
  investorIrr: DeMetric | Metric | null;
  /** Investor NPV at the common 12 % rate and at the market's own hurdle. */
  npvCommonEur: number | null;
  npvMarketEur: number | null;
  marketHurdle: number;
  lcosEurPerMWh: number | null;
  revenue2029PerMwEur: number | null;
  gearing: number | null;
  /** A row without a result: its status. */
  status?: string;
}

export interface DeCompare {
  commonRate: number;
  rows: DeCompareRow[];
}

/** The Ukrainian base case with the German case's battery: duration (with its presets), efficiency and cycle limit. */
export function uaWithBattery(inp: DeInputs) {
  const d = ([1, 2, 4].includes(inp.durationHours) ? inp.durationHours : 2) as Duration;
  return { ...withDuration(BESS_BASE, d), rte: inp.rte, cycleCap: inp.cycleCap };
}

export function computeDeCompare(inputs: DeInputs, lib: DeLibrary, uaLib: UaLibrary): DeCompare {
  const common = inputs.comparisonRate;
  const ua = (debt: boolean, id: DeCompareRowId): DeCompareRow => {
    const ui = { ...uaWithBattery(inputs), debt };
    const r = runBess(ui, uaLib);
    const fc = buildUaCalendar(ui.codDelayMonths).fcDay;
    if (r.status.primary !== "ok") {
      return { id, investorIrr: null, npvCommonEur: null, npvMarketEur: null, marketHurdle: ui.equityHurdle, lcosEurPerMWh: null, revenue2029PerMwEur: null, gearing: null, status: r.status.primary };
    }
    return {
      id,
      investorIrr: r.kpis.investorIrr!,
      npvCommonEur: xnpv(common, r.investorFlows, fc),
      npvMarketEur: r.kpis.investorNpv!.value,
      marketHurdle: ui.equityHurdle,
      lcosEurPerMWh: r.kpis.lcos?.value ?? null,
      revenue2029PerMwEur: r.kpis.netRevenue2029PerMW?.value ?? null,
      gearing: debt ? (r.kpis.gearing?.value ?? null) : null,
    };
  };
  const de = (patch: Partial<DeInputs>, id: DeCompareRowId): DeCompareRow => {
    const di = { ...inputs, ...patch };
    const r = runDe(di, lib, { funding: contractualFunding(di, lib) });
    if (r.status.primary !== "ok" || !r.kpis) {
      return { id, investorIrr: null, npvCommonEur: null, npvMarketEur: null, marketHurdle: di.equityHurdle, lcosEurPerMWh: null, revenue2029PerMwEur: null, gearing: null, status: r.status.primary };
    }
    return {
      id,
      investorIrr: r.kpis.investorIrr!,
      npvCommonEur: r.kpis.investorNpvComparisonEur!.value,
      npvMarketEur: r.kpis.investorNpvEur!.value,
      marketHurdle: di.equityHurdle,
      lcosEurPerMWh: r.kpis.lcosEurPerMWh!.value,
      revenue2029PerMwEur: r.kpis.revenue2029PerMwEur!.value,
      gearing: r.kpis.gearing!.value,
    };
  };
  // the rows follow the case; a merchant case gets the base contract and its rates back for the toll rows, a toll case
  // the merchant variant's (registry FIN: 12 % and 8 % with a toll, 15 % and 10 % without)
  const isToll = inputs.tollEnabled && inputs.tollShare > 0;
  const toll: Partial<DeInputs> = isToll ? {} : { tollEnabled: true, tollShare: 0.8, equityHurdle: 0.12, projectDiscountRate: 0.08 };
  return {
    commonRate: common,
    rows: [
      ua(true, "uaBase"),
      ua(false, "uaNoDebt"),
      de({ ...toll, debt: true }, "deToll"),
      de({ ...toll, debt: false }, "deTollNoDebt"),
      de(isToll ? DE_VARIANTS.merchant : {}, "deMerchant"),
    ],
  };
}

export type { DeTornado, DeVariant, KResult, TStarResult };
