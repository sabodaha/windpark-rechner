// Everything the report says, computed from one set of results: action titles, key messages, lifetime totals and
// source numbers. Pure, so the wording can be tested without a browser.
import { DATA_AS_OF, ENGINE_VERSION, hashInputs, SCENARIOS, SOURCES, type Inputs, type ModelResult, type ScenarioName } from "@/engine";
import type { ModelExtras } from "@/lib/extras";
import { ct, dateLabel, meur, num, pct, ratio } from "@/lib/format";
import { en } from "@/messages/en";

export const SLIDE_COUNT = 18;

/** Short names of the slides: the headings, the PDF outline and the contents on the title slide. */
export const SLIDE_NAMES: [SlideId | "title", string][] = [
  ["title", "Title"],
  ["summary", "Summary and status"],
  ["timeline", "Project and timeline"],
  ["assumptions", "Key assumptions"],
  ["energy", "Energy yield"],
  ["eeg", "EEG market premium"],
  ["prices", "Power prices and capture"],
  ["construction", "Construction and funding"],
  ["opex", "Operating costs and decommissioning"],
  ["financing", "Financing and loan size"],
  ["dscr", "Debt service cover and liquidity"],
  ["waterfall", "Taxes and cash waterfall"],
  ["returns", "Returns"],
  ["scenarios", "Scenarios"],
  ["sensitivity", "Sensitivity"],
  ["bid", "Bid price"],
  ["risks", "Risks and limitations"],
  ["methodology", "Methodology and sources"],
];

/**
 * Keeps short units together on a line: "31 Dec 2046", "4.79 ct/kWh", "§ 36h" and "(§ 6 EEG)" never break after the
 * number or the section sign.
 */
export function keep(text: string): string {
  return text
    .replace(/(\d) (?=(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|ct\/kWh|€\/MWh|MW|h|years|months|days|GWh)\b)/g, "$1\u00a0")
    .replace(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec) (?=\d{4})/g, "$1\u00a0")
    .replace(/§ /g, "§\u00a0")
    .replace(/ (EEG|EStG|GewStG|HGB|GmbHG|KStG|EnWG)\b/g, "\u00a0$1");
}

export interface Lifetime {
  revenue: number;
  opex: number;
  municipalRefund: number;
  ebitda: number;
  taxes: number;
  deltaWorkingCapital: number;
  cfads: number;
  interest: number;
  principal: number;
  decommissioning: number;
  /** Reserve accounts funded from the uses and released over the life (DSRA, cash held back), net. */
  reservesReleased: number;
  distribution: number;
  equityInvested: number;
}

export interface ReportData {
  inputs: Inputs;
  results: Record<ScenarioName, ModelResult>;
  extras: ModelExtras;
  meta: { dataAsOf: string; engine: string; inputHash: string; isBase: boolean };
  /** Source keys in a fixed order: S1, S2, … on every slide and in the list on the last slide. */
  sourceKeys: string[];
  cite: (...keys: string[]) => string;
  titles: Record<SlideId, string>;
  summary: string[];
  facts: {
    premiumYears: Record<ScenarioName, number>;
    premiumTotal: Record<ScenarioName, number>;
    supportYears: number;
    firstTaxYear: number | null;
    financingCosts: number;
    negativeLeverage: boolean;
    bindingLabel: string;
    /** Days added to the 20 support years for negative-price periods (§ 51a EEG). */
    extensionDays: number;
    firstFullYear: number;
    negativeBookYears: number[];
    equityByYear: { year: number; flow: number; cumulative: number }[];
    lifetime: Lifetime;
  };
}

export type SlideId =
  | "summary"
  | "timeline"
  | "assumptions"
  | "energy"
  | "eeg"
  | "prices"
  | "construction"
  | "opex"
  | "financing"
  | "dscr"
  | "waterfall"
  | "returns"
  | "scenarios"
  | "sensitivity"
  | "bid"
  | "risks"
  | "methodology";

const DAY = 86_400_000;
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const addYearsIso = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** "an 8%", "an 11.5%", "a 7%": the article for a number as it is read aloud. */
export function withArticle(text: string): string {
  return `${/^(8|1[18](?!\d))/.test(text) ? "an" : "a"} ${text}`;
}

/** Equity IRR as text, or "n.m." when the company runs out of cash. */
export function irrText(r: ModelResult, decimals = 1): string {
  return r.validity.returnsMeaningful ? pct(r.kpis.equityIrr, decimals) : en.kpis.notMeaningful;
}

export function npvText(r: ModelResult): string {
  return r.validity.returnsMeaningful ? meur(r.kpis.npvEquity) : en.kpis.notMeaningful;
}

/** Short status of a scenario for the tables. */
export function statusOf(r: ModelResult): { level: "ok" | "warning" | "error"; text: string } {
  const v = r.validity;
  if (v.integrity === "error") return { level: "error", text: "Calculation check failed" };
  if (v.shortfall) return { level: "error", text: `Not funded (${v.shortfall.year})` };
  if (v.covenantBreach) return { level: "error", text: `Covenant breached (${v.covenantBreach.year})` };
  if (v.lockUpYears.length) return { level: "warning", text: `Lock-up in ${v.lockUpYears.length} yr` };
  return { level: "ok", text: "Funded, covenant met" };
}

export function lifetimeTotals(r: ModelResult): Lifetime {
  const a = r.annual;
  const cfads = sum(a.map((x) => x.cfads));
  const interest = sum(a.map((x) => x.interest));
  const principal = sum(a.map((x) => x.principal));
  const decommissioning = sum(a.map((x) => x.decommissioningPaid));
  const distribution = sum(a.map((x) => x.distribution));
  return {
    revenue: sum(a.map((x) => x.revenue)),
    opex: sum(a.map((x) => x.opex)),
    municipalRefund: sum(a.map((x) => x.municipalRefund)),
    ebitda: sum(a.map((x) => x.ebitda)),
    taxes: sum(a.map((x) => x.taxes)),
    deltaWorkingCapital: sum(a.map((x) => x.deltaWorkingCapital)),
    cfads,
    interest,
    principal,
    decommissioning,
    reservesReleased: distribution - (cfads - interest - principal - decommissioning),
    distribution,
    equityInvested: sum(r.construction.map((m) => m.equityDraw)),
  };
}

/** The owners' cash flows by calendar year: contributions during construction, then cash available to equity. */
export function equityByYear(r: ModelResult): { year: number; flow: number; cumulative: number }[] {
  const byYear = new Map<number, number>();
  for (const m of r.construction) {
    const y = Number(m.date.slice(0, 4));
    byYear.set(y, (byYear.get(y) ?? 0) - m.equityDraw);
  }
  for (const a of r.annual) byYear.set(a.year, (byYear.get(a.year) ?? 0) + a.distribution);
  let cumulative = 0;
  return [...byYear.entries()]
    .sort(([x], [y]) => x - y)
    .map(([year, flow]) => {
      cumulative += flow;
      return { year, flow, cumulative };
    });
}

export function buildReportData(inputs: Inputs, results: Record<ScenarioName, ModelResult>, extras: ModelExtras, isBase: boolean): ReportData {
  const b = results.base;
  const k = b.kpis;
  const i = inputs;
  const tl = b.timeline;
  const sourceKeys = Object.keys(SOURCES);
  const cite = (...keys: string[]) =>
    [...new Set(keys)]
      .map((key) => sourceKeys.indexOf(key))
      .filter((n) => n >= 0)
      .sort((x, y) => x - y)
      .map((n) => `S${n + 1}`)
      .join(", ");

  const premiumYears = Object.fromEntries(
    SCENARIOS.map((s) => [s, results[s].annual.filter((a) => a.revenuePremium > 0.5).length]),
  ) as Record<ScenarioName, number>;
  const premiumTotal = Object.fromEntries(SCENARIOS.map((s) => [s, sum(results[s].annual.map((a) => a.revenuePremium))])) as Record<
    ScenarioName,
    number
  >;
  const supportYears = b.annual.filter((a) => a.eegShare > 0).length;
  const firstTaxYear = b.annual.find((a) => a.taxes > 0.5)?.year ?? null;
  const su = b.sourcesUses;
  const financingCosts = su.upfrontFee + su.commitmentFee + su.interestDuringConstruction + su.vatInterest;
  // Leverage by its effect, not by the loan rate: interest is tax-deductible, so the after-tax cost of debt is lower.
  const negativeLeverage =
    b.validity.returnsMeaningful && k.equityIrr !== null && k.projectIrrPostTax !== null && k.equityIrr < k.projectIrrPostTax;
  const basis = en.overview.basis[b.sizing.bankPriceBasis] ?? "";
  const binding = b.sizing.binding;
  const bindingLabel =
    binding === "dscrP50" || binding === "dscrP90"
      ? `${binding === "dscrP90" ? "P90 (1-year)" : "P50"} DSCR target ${basis}`
      : binding === "gearing"
        ? "gearing cap"
        : "loan terms";
  const extensionDays = Math.round(dayOf(tl.eegEnd) - dayOf(addYearsIso(tl.cod, 20)));
  const firstFullYear = (b.annual.find((a) => a.operatingFraction > 0.999) ?? b.annual[0]!).year;
  const negativeBookYears = b.annual.filter((a) => a.bookEquity < -1).map((a) => a.year);
  const lifetime = lifetimeTotals(b);

  const irr = k.equityIrr;
  const coe = i.macro.costOfEquity;
  const down = results.downside;
  const bid = extras.bid;
  const feasible = bid.feasible;
  const tornadoTop = extras.tornado.equityIrr[0];
  const p90Share = 1 - 1.2816 * i.energy.sigma1y;
  const lt = i.revenue.longTermBaseEurMwh2026;
  const f0 = i.revenue.futuresEurMwh[0];
  const opexYear = b.annual.find((a) => a.year === firstFullYear) ?? b.annual[0]!;
  const target = withArticle(pct(extras.bidTarget, 0));
  const bidText = feasible
    ? `${target} equity IRR needs an award of ${ct(feasible.awardPriceCt)} — ${bid.admissible ? "within" : "above"} the ${ct(bid.ceilingCt)} ceiling`
    : `${target} equity IRR is not financeable below ${num(bid.searchedUpToCt, 0)} ct/kWh`;

  const titles: Record<SlideId, string> = {
    summary: b.validity.returnsMeaningful
      ? `At ${num(i.revenue.awardPriceCt, 2)} ct/kWh the owners earn ${pct(irr, 1)} a year — ${irr !== null && irr < coe ? "below" : "above"} ${withArticle(pct(coe, 0))} cost of equity`
      : `At ${num(i.revenue.awardPriceCt, 2)} ct/kWh the company runs out of cash: the owners’ returns are not meaningful`,
    timeline: `Commissioning on ${dateLabel(tl.cod)}, ${i.project.constructionMonths} months after financial close; the loan is repaid by ${dateLabel(tl.loanMaturity)}`,
    assumptions: "The inputs that drive the answer — each from a public source or a documented assumption",
    energy: `${num(k.fullLoadHoursP50, 0)} full-load hours at P50; in a bad year (one-year P90) the farm produces ${pct(p90Share, 0)} of that`,
    eeg:
      premiumYears.base === 0
        ? `The AW of ${ct(k.awCt)} stays below the expected market value in every year: the base case earns no premium`
        : `The AW of ${ct(k.awCt)} is above the expected market value in ${premiumYears.base} of ${supportYears} support years, when the premium is paid`,
    prices: `Futures fall from ${num(f0?.value ?? lt, 0)} €/MWh (${f0?.year ?? ""}) to a long-term ${num(lt, 0)} €/MWh in 2026 money; wind earns ${num(i.revenue.captureFactor, 2)} of the baseload price`,
    construction: `Total uses of ${meur(su.totalUses)}: ${meur(su.capex)} of capex and ${meur(financingCosts)} of financing costs, funded with ${meur(su.debt)} of debt and ${meur(su.equity)} of equity`,
    opex: `Operating costs of ${meur(opexYear.opex)} in ${opexYear.year}, rising with inflation; decommissioning costs ${meur(lifetime.decommissioning)} at the end of life`,
    financing: `Debt of ${meur(k.debt)} (${pct(k.gearing, 0)} of uses) is limited by the ${bindingLabel}`,
    dscr: b.validity.covenantBreach
      ? `The DSCR falls to ${ratio(k.minDscr)} in ${k.minDscrYear} — below the covenant of ${ratio(i.financing.covenantDscr)}`
      : `Lowest DSCR ${ratio(k.minDscr)} in ${k.minDscrYear} against a covenant of ${ratio(i.financing.covenantDscr)}; ${ratio(results.p90.kpis.minDscr)} in a one-year P90 stress`,
    waterfall:
      firstTaxYear !== null
        ? `Tax is first due in ${firstTaxYear}; over the life the owners receive ${meur(lifetime.distribution)} for ${meur(lifetime.equityInvested)} invested`
        : `No tax is due; over the life the owners receive ${meur(lifetime.distribution)} for ${meur(lifetime.equityInvested)} invested`,
    returns: b.validity.returnsMeaningful
      ? `Equity IRR ${pct(irr, 1)} and NPV ${meur(k.npvEquity)} at ${pct(coe, 0)}; the owners are paid back after ${num(k.paybackYears, 1)} years`
      : "Not funded: the owners’ returns are not meaningful",
    scenarios: down.validity.returnsMeaningful
      ? `In the downside the equity IRR falls to ${pct(down.kpis.equityIrr, 1)}; the lowest DSCR is ${ratio(down.kpis.minDscr)}`
      : "In the downside the company runs out of cash",
    sensitivity:
      tornadoTop && tornadoTop.base !== null && tornadoTop.low !== null && tornadoTop.high !== null
        ? `${en.sensitivity.drivers[tornadoTop.id] ?? tornadoTop.id} moves the equity IRR most: from ${pct(tornadoTop.low, 1)} to ${pct(tornadoTop.high, 1)}`
        : tornadoTop && tornadoTop.base === null
          ? "The equity IRR is not meaningful in this case, so the tornado has no bars"
          : "What moves the equity IRR",
    bid: bidText.charAt(0).toUpperCase() + bidText.slice(1),
    risks: "What could change the answer — and what the model leaves out",
    methodology: "How the numbers are made, checked and sourced",
  };

  const summary = [
    premiumYears.base === 0
      ? `The EEG floor (AW ${ct(k.awCt)}) stays below the expected market value, so revenue comes from the market; the premium works as insurance and is paid in ${premiumYears.downside} years of the downside.`
      : `The market premium is paid in ${premiumYears.base} of ${supportYears} support years, when the market value falls below the AW of ${ct(k.awCt)}.`,
    `The bank lends ${meur(k.debt)} (${pct(k.gearing, 0)} of uses), limited by the ${bindingLabel}; the owners fund ${meur(k.equity)}.`,
    negativeLeverage
      ? `Debt lowers the owners’ return: ${pct(irr, 1)} against ${pct(k.projectIrrPostTax, 1)} for the project without debt, which earns less than the loan’s ${pct(i.financing.interestRate, 2)}.`
      : `Debt raises the owners’ return: ${pct(irr, 1)} against ${pct(k.projectIrrPostTax, 1)} for the project without debt.`,
    `Bid calculator: ${bidText}.`,
  ];

  return {
    inputs,
    results,
    extras,
    meta: { dataAsOf: DATA_AS_OF, engine: ENGINE_VERSION, inputHash: hashInputs(inputs), isBase },
    sourceKeys,
    cite,
    titles,
    summary,
    facts: {
      premiumYears,
      premiumTotal,
      supportYears,
      firstTaxYear,
      financingCosts,
      negativeLeverage,
      bindingLabel,
      extensionDays,
      firstFullYear,
      negativeBookYears,
      equityByYear: equityByYear(b),
      lifetime,
    },
  };
}
