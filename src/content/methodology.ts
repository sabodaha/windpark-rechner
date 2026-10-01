// The base-case figures the methodology pages quote, computed once from the engine for both languages, so the
// English and the German page can never show different numbers.
import { P90_Z } from "@/engine";
import { BASE, BASE_CASE, BID_AT_COST_OF_EQUITY, premiumYears } from "./baseCase";

export function methodologyFacts() {
  const b = BASE.base;
  const k = b.kpis;
  const i = BASE_CASE;
  const f = i.financing;
  const su = b.sourcesUses;
  return {
    b,
    k,
    tl: b.timeline,
    i,
    f,
    su,
    /** P90 output as a share of P50: one year, ten-year average. */
    p90share: 1 - P90_Z * i.energy.sigma1y,
    p90share10: 1 - P90_Z * i.energy.sigma10y,
    siteYield: i.energy.siteQuality * i.energy.referenceYieldHours,
    /** Market value in €/MWh of a year. */
    mv: (year: number) => (b.annual.find((a) => a.year === year)?.marketValueEurKwh ?? NaN) * 1000,
    instalments: 4 * (f.tenorYearsFromClose - f.graceYears),
    firstRepaymentYear: b.annual.find((a) => a.principal > 0)?.year,
    financing: su.upfrontFee + su.commitmentFee + su.interestDuringConstruction + su.vatInterest,
    bid: BID_AT_COST_OF_EQUITY,
    basePremium: premiumYears("base"),
    downsidePremium: premiumYears("downside"),
    reviewed: BASE.resource.awPeriods[1],
    negativeBook: b.annual.filter((a) => a.bookEquity < -1).map((a) => a.year),
    codMonths: Math.round((Date.parse(b.timeline.cod) - Date.parse(i.revenue.awardNoticeDate)) / (1000 * 60 * 60 * 24 * 30.4375)),
    /** The applicable value before rounding, in ct/kWh. */
    unrounded: i.revenue.awardPriceCt * k.correctionFactor,
    itemsTotal: i.capex.items.reduce((s, it) => s + it.eurPerKw, 0),
    checkGroups: (["integrity", "funding", "covenant", "inputs", "scope"] as const).map((g) => [g, b.checks.filter((c) => c.group === g)] as const),
  };
}

/** "2043–2050" for a run of years, "2044" for one. */
export function yearSpan(years: number[]): string {
  if (years.length === 0) return "";
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`;
}
