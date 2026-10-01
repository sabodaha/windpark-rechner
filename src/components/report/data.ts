// Everything the report says, computed from one set of results: action titles, key messages, lifetime totals and
// source numbers. Pure, so the wording can be tested without a browser.
import { DATA_AS_OF, ENGINE_VERSION, hashInputs, SCENARIOS, SOURCES, type Inputs, type ModelResult, type ScenarioName } from "@/engine";
import type { ModelExtras } from "@/lib/extras";
import { FIELD_BY_ID } from "@/lib/fields";
import { ct, dateLabel, meur, num, pct, ratio } from "@/lib/format";
import { VERIFIED_VARIANTS } from "@/lib/workbook/verification";
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

/** The inputs on slide 4, by column and group. "futures" stands for the futures table. */
export const ASSUMPTION_GROUPS: [string, string[]][][] = [
  [
    ["Project", ["turbines", "turbineMw", "lifetime", "fc", "construction"]],
    ["Energy yield", ["refYield", "siteQuality", "availability", "degradation", "sigma1", "negOutput"]],
  ],
  [
    ["Revenue", ["award", "ceiling", "futures", "ltPrice", "capture", "dv", "municipal", "trueUpLag"]],
    ["Costs", ["capexTotal", "contingency", "opexTotal", "lease", "decomCost", "gridFee"]],
  ],
  [
    ["Financing", ["rate", "tenor", "grace", "repayment", "dscrP50", "dscrP90", "maxGearing", "bankBasis", "dsra"]],
    ["Tax and valuation", ["legalForm", "hebesatz", "depYears", "coe", "infLR", "waccReal"]],
  ],
];

/** Slide 17: risks the calculator can test — a bold lead and the rest — and what the model leaves out. */
export function risksTested(i: Inputs): [string, string][] {
  return [
    ["Power price after the futures.", "The long-term price is the strongest assumption; the tornado shows its weight."],
    ["Wind resource.", "One-year and ten-year P90; a weaker site also re-sets the AW in the § 36h (2) reviews."],
    ["Negative prices.", "No premium in those periods (§ 51 EEG); more of them also lower the capture factor."],
    ["EEG 2027 draft.", "A two-sided premium is a switch — a simplified stress, not the draft’s calculation; 18 banks warned of financing risks (Sep 2026)."],
    ["Interest rate and loan terms.", `KfW 270 at ${pct(i.financing.interestRate, 2)}; DSCR targets, gearing and the revenue the bank counts on are inputs.`],
    ["Timing.", "The award lapses 36 months after its announcement (§ 36e); a penalty applies after 30 months (§ 55). The checks flag late commissioning."],
    ["Generator grid fees.", "Proposed in the regulator’s AgNes process (4–7 €/kW a year); 0 in the base case, an input."],
    ["Distributions.", "Cash to equity is before § 30 GmbHG and § 172 (4) HGB; negative book equity is flagged."],
  ];
}

export const LEFT_OUT = [
  "Operations are annual; output is spread evenly over the year (winter is in fact windier).",
  "The farm’s capture price equals the market value of all onshore wind.",
  "The partners’ income tax of a KG is not modelled; taxes are paid in the year they arise.",
  "One senior loan: no tranches, shareholder loans, refinancing or cash sweep; instalments during construction are not supported.",
  "Not modelled: the § 55 penalty for late commissioning, interest on § 36h paybacks, the interest barrier, and payments by the owners to cure a shortfall.",
  "Uncompensated grid curtailment (a draft of the grid package) and generator grid fees are not in the base case; the fee is available as an input.",
  "In the Excel workbook the loan, the total uses and the sculpted principal are solved on the website; the tornado and the bid calculator are included as values.",
  "The wind farm is fictional and the results are illustrative.",
];

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Rounds parts so that they add up to the rounded total (largest remainder): a table's lines then sum as printed.
 * The total defaults to the sum of the parts.
 */
export function roundToTotal(parts: number[], decimals: number, total = parts.reduce((s, x) => s + x, 0)): number[] {
  const f = 10 ** decimals;
  const scaled = parts.map((p) => p * f);
  const rounded = scaled.map((x) => Math.round(x));
  let diff = Math.round(total * f) - rounded.reduce((s, x) => s + x, 0);
  // One unit at a time to the parts whose rounding went furthest the other way.
  const order = scaled.map((x, n) => ({ n, err: x - rounded[n]! })).sort((a, b) => (diff > 0 ? b.err - a.err : a.err - b.err));
  for (let j = 0; diff !== 0 && j < order.length; j++) {
    rounded[order[j]!.n]! += Math.sign(diff);
    diff -= Math.sign(diff);
  }
  return rounded.map((x) => x / f);
}

/** Why the owners' returns are not shown, as a clause: a failed calculation check, or the year cash runs out. */
export function notMeaningfulReason(r: ModelResult): string {
  if (r.validity.integrity === "error") return "a calculation check fails";
  return `the company runs out of cash${r.validity.shortfall ? ` in ${r.validity.shortfall.year}` : ""}`;
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
    /** Years in which a two-sided premium is paid back (market value above the AW). */
    paidBackYears: Record<ScenarioName, number>;
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
  if (v.scope === "error") {
    const lapsed = r.checks.some((c) => c.id === "awardValid" && !c.ok);
    return { level: "error", text: lapsed ? "Award lapsed (§ 36e)" : "Outside the model’s scope" };
  }
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
  const paidBackYears = Object.fromEntries(
    SCENARIOS.map((s) => [s, results[s].annual.filter((a) => a.revenuePremium < -0.5).length]),
  ) as Record<ScenarioName, number>;
  const twoSided = inputs.revenue.twoSidedPremium;
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
        : binding === "cashflow"
          ? "lender’s cash flow: a year without cash for debt service"
          : binding === "locked"
            ? "loan of the base case"
            : "loan terms: no DSCR target binds exactly";
  const hasLoan = k.debt > 0;
  const noLoanReason =
    binding === "gearing"
      ? `the gearing cap is ${pct(i.financing.maxGearing, 0)}`
      : binding === "cashflow"
        ? "the lender’s case has a year without cash for debt service"
        : "no loan fits the lender’s targets";
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

  // Slide 4 counts its inputs: from a public source, or a documented assumption only.
  const shownInputs = ASSUMPTION_GROUPS.flat().flatMap(([, ids]) => ids);
  const fromSources = shownInputs.filter((id) => id === "futures" || (FIELD_BY_ID.get(id)?.sources ?? []).some((key) => key !== "assumption")).length;
  // Slide 8: capex, financing costs and reserves add up to the total uses as printed.
  const reserves = su.dsraInitial + su.workingCapitalInitial;
  const [capexM, financingM, reservesM] = roundToTotal([su.capex, financingCosts, reserves].map((v) => v / 1e6), 1, su.totalUses / 1e6);
  const [debtM, equityM] = roundToTotal([su.debt, su.equity].map((v) => v / 1e6), 1, su.totalSources / 1e6);
  const eurM = (v: number) => `€${num(v, 1)}m`;
  const awardText = `${num(i.revenue.awardPriceCt, 2)} ct/kWh`;
  const risks = risksTested(i).length;

  const titles: Record<SlideId, string> = {
    summary: b.validity.returnsMeaningful
      ? `At ${awardText} the owners earn ${pct(irr, 1)} a year — ${irr !== null && irr < coe ? "below" : "above"} ${withArticle(pct(coe, 0))} cost of equity`
      : b.validity.integrity === "error"
        ? `At ${awardText} a calculation check fails: the results cannot be relied on`
        : `At ${awardText} ${notMeaningfulReason(b)}: returns are not meaningful`,
    timeline: `Commissioning on ${dateLabel(tl.cod)}, ${i.project.constructionMonths} months after financial close; ${hasLoan ? `the loan is repaid by ${dateLabel(tl.loanMaturity)}` : "the case has no loan"}`,
    assumptions: `${shownInputs.length} inputs drive the answer: ${fromSources} from public sources, ${shownInputs.length - fromSources} documented assumptions`,
    energy: `${num(k.fullLoadHoursP50, 0)} full-load hours at P50; in a bad year (one-year P90) the farm produces ${pct(p90Share, 0)} of that`,
    eeg: twoSided
      ? `With the two-sided premium the farm earns the AW of ${ct(k.awCt)}: it pays back the difference in ${paidBackYears.base} of ${supportYears} support years${
          premiumYears.base > 0 ? ` and receives a top-up in ${premiumYears.base}` : ""
        }`
      : premiumYears.base === 0
        ? `The AW of ${ct(k.awCt)} stays below the expected market value in every year: ${isBase ? "the base case" : "this case"} earns no premium`
        : `The AW of ${ct(k.awCt)} is above the expected market value in ${premiumYears.base} of ${supportYears} support years, when the premium is paid`,
    prices: `Futures fall from ${num(f0?.value ?? lt, 0)} €/MWh (${f0?.year ?? ""}) to a long-term ${num(lt, 0)} €/MWh in 2026 money; wind earns ${num(i.revenue.captureFactor, 2)} of the baseload price`,
    construction: `Total uses of ${meur(su.totalUses)} — ${eurM(capexM!)} capex, ${eurM(financingM!)} financing costs, ${eurM(reservesM!)} reserves — ${
      hasLoan ? `funded with ${eurM(debtM!)} of debt and ${eurM(equityM!)} of equity` : "funded entirely by the owners"
    }`,
    opex: `Operating costs of ${meur(opexYear.opex)} in ${opexYear.year}, rising with inflation; decommissioning costs ${meur(lifetime.decommissioning)} at the end of life`,
    financing: hasLoan
      ? `Debt of ${meur(k.debt)} (${pct(k.gearing, 0)} of uses) is limited by the ${bindingLabel}`
      : `No loan: ${noLoanReason}, so the owners fund all ${meur(su.totalUses)} of uses`,
    dscr:
      k.minDscr === null
        ? "No loan, so no debt service to cover: the DSCR, the covenant and the lock-up do not apply"
        : b.validity.covenantBreach
          ? `The DSCR falls to ${ratio(k.minDscr)} in ${k.minDscrYear} — below the covenant of ${ratio(i.financing.covenantDscr)}`
          : `Lowest DSCR ${ratio(k.minDscr)} in ${k.minDscrYear} against a covenant of ${ratio(i.financing.covenantDscr)}; ${ratio(results.p90.kpis.minDscr)} in a one-year P90 stress`,
    waterfall:
      firstTaxYear !== null
        ? `Tax is first due in ${firstTaxYear}; over the life the owners receive ${meur(lifetime.distribution)} for ${meur(lifetime.equityInvested)} invested`
        : `No tax is due; over the life the owners receive ${meur(lifetime.distribution)} for ${meur(lifetime.equityInvested)} invested`,
    returns: b.validity.returnsMeaningful
      ? `Equity IRR ${pct(irr, 1)} and NPV ${meur(k.npvEquity)} at ${pct(coe, 0)}; ${
          k.paybackYears === null ? "the owners are not paid back within the life" : `the owners are paid back after ${num(k.paybackYears, 1)} years`
        }`
      : `${capital(notMeaningfulReason(b))}: the owners’ returns are not meaningful`,
    scenarios: down.validity.returnsMeaningful
      ? `In the downside the equity IRR falls to ${pct(down.kpis.equityIrr, 1)}; ${
          down.kpis.minDscr === null ? "there is no loan to cover" : `the lowest DSCR is ${ratio(down.kpis.minDscr)}`
        }`
      : `In the downside ${notMeaningfulReason(down)}: the owners’ returns are not meaningful`,
    sensitivity:
      tornadoTop && tornadoTop.base !== null && tornadoTop.low !== null && tornadoTop.high !== null
        ? `${en.sensitivity.drivers[tornadoTop.id] ?? tornadoTop.id} moves the equity IRR most: from ${pct(tornadoTop.low, 1)} to ${pct(tornadoTop.high, 1)}`
        : tornadoTop && tornadoTop.base === null
          ? "The equity IRR is not meaningful in this case, so the tornado has no bars"
          : "What moves the equity IRR",
    bid: bidText.charAt(0).toUpperCase() + bidText.slice(1),
    risks: `${risks} risks you can test in the calculator, and ${LEFT_OUT.length} simplifications of the model to keep in mind`,
    methodology: `${b.checks.length} checks on every run, ${sourceKeys.length} public sources, a formula workbook checked in ${VERIFIED_VARIANTS} variants`,
  };

  const summary = [
    twoSided
      ? `With the two-sided premium (a simplified stress of the EEG 2027 draft) the farm earns the AW of ${ct(k.awCt)} during support: it pays back the difference to the market value in ${paidBackYears.base} of ${supportYears} years${
          premiumYears.base > 0 ? ` and receives a top-up in ${premiumYears.base}` : ""
        }.`
      : premiumYears.base === 0
        ? `The EEG floor (AW ${ct(k.awCt)}) stays below the expected market value, so revenue comes from the market; the premium works as insurance and is paid in ${premiumYears.downside} years of the downside.`
        : `The market premium is paid in ${premiumYears.base} of ${supportYears} support years, when the market value falls below the AW of ${ct(k.awCt)}.`,
    hasLoan
      ? `The bank lends ${meur(k.debt)} (${pct(k.gearing, 0)} of uses), limited by the ${bindingLabel}; the owners fund ${meur(k.equity)}.`
      : `No loan: ${noLoanReason}; the owners fund all ${meur(k.equity)}.`,
    !b.validity.returnsMeaningful
      ? `${capital(notMeaningfulReason(b))}, so the owners’ return — and what debt does to it — is not meaningful.`
      : !hasLoan
        ? `Without a loan the owners earn the project’s return: ${pct(irr, 1)} (project IRR after tax ${pct(k.projectIrrPostTax, 1)}).`
        : negativeLeverage
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
      paidBackYears,
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
