import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/site/JsonLd";
import { BASE, BASE_CASE, BID_AT_COST_OF_EQUITY, premiumYears, TENDER_FACTS } from "@/content/baseCase";
import { CORRECTION_FACTOR_TABLE, DATA_AS_OF, P90_Z, TORNADO_DRIVERS } from "@/engine";
import { ct, dateLabel, meur, num, pct, ratio } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, CALCULATOR_ID, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";
import { en } from "@/messages/en";

const TITLE = "How the wind farm model works";
const DESCRIPTION =
  "Methodology of the Wind Farm Investment Calculator: energy yield, EEG 2023 market premium, costs, KfW debt sized " +
  "on DSCR, German trade and corporate tax, cash waterfall, KPIs, scenarios and checks — with formulas.";

export const metadata = pageMetadata({ title: "Wind farm model methodology", description: DESCRIPTION, path: PATHS.methodology, type: "article" });

const SECTIONS = [
  ["principles", "Principles"],
  ["timeline", "Timeline"],
  ["energy", "Energy yield"],
  ["revenue", "Revenue"],
  ["opex", "Operating costs"],
  ["investment", "Investment and funding"],
  ["debt", "Debt sizing"],
  ["taxes", "Taxes"],
  ["waterfall", "Cash waterfall"],
  ["results", "Results"],
  ["scenarios", "Scenarios, sensitivity and bid calculator"],
  ["checks", "Checks"],
  ["verification", "Verification"],
  ["limitations", "Limitations"],
] as const;

function H2({ id, children }: { id: (typeof SECTIONS)[number][0]; children: ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

function Table({ head, rows, num: numeric = [] }: { head: string[]; rows: ReactNode[][]; num?: number[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={numeric.includes(i) ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={numeric.includes(j) ? "num" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MethodologyPage() {
  const b = BASE.base;
  const k = b.kpis;
  const tl = b.timeline;
  const i = BASE_CASE;
  const su = b.sourcesUses;
  const p90share = 1 - P90_Z * i.energy.sigma1y;
  const p90share10 = 1 - P90_Z * i.energy.sigma10y;
  const siteYield = i.energy.siteQuality * i.energy.referenceYieldHours;
  const mv = (year: number) => (b.annual.find((a) => a.year === year)?.marketValueEurKwh ?? NaN) * 1000;
  const firstRepayment = b.annual.find((a) => a.principal > 0)?.year;
  const lastRepayment = [...b.annual].reverse().find((a) => a.principal > 0)?.year;
  const financing = su.upfrontFee + su.commitmentFee + su.interestDuringConstruction + su.vatInterest;
  const bid = BID_AT_COST_OF_EQUITY;
  const basePremium = premiumYears("base");
  const downsidePremium = premiumYears("downside");
  const capexItems = i.capex.items;
  const itemsTotal = capexItems.reduce((s, it) => s + it.eurPerKw, 0);
  const capexLabel: Record<string, string> = {
    turbine: "Turbine incl. transport and installation",
    foundation: "Foundation",
    infrastructure: "Roads and crane pads",
    gridConnection: "Grid connection",
    development: "Development and permits",
    compensation: "Compensation measures",
    other: "Other",
  };
  const profileLabel: Record<string, string> = {
    turbine: "10% at close, 70% on delivery (4–2 months before COD), 20% at commissioning",
    thirds: "40 / 40 / 20% over the thirds of construction",
    atStart: "at financial close",
    linear: "evenly over construction",
  };

  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "TechArticle",
            "@id": `${absoluteUrl(PATHS.methodology)}#article`,
            headline: TITLE,
            description: DESCRIPTION,
            url: absoluteUrl(PATHS.methodology),
            inLanguage: "en",
            author: { "@id": PERSON_ID },
            about: { "@id": CALCULATOR_ID },
            datePublished: SITE.updated,
            dateModified: SITE.updated,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: en.meta.title, path: PATHS.calculator },
            { name: "Methodology", path: PATHS.methodology },
          ]),
        )}
      />
      <div className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 pb-4 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="prose-page min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            <Link href={PATHS.calculator} className="!text-muted-foreground !no-underline hover:!underline">
              {en.meta.title}
            </Link>{" "}
            · Methodology
          </p>
          <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p className="text-lg">
            This page documents what the calculator computes, in which order and with which formulas. The wind farm is
            fictional; every input comes from a public source listed on the <Link href={PATHS.sources}>sources page</Link>,
            checked on {dateLabel(DATA_AS_OF)}. The numbers below come from the same engine that runs in the calculator.
          </p>
          <p className="text-sm text-muted-foreground">{en.header.disclaimer}</p>

          <h2 id="glance">The base case at a glance</h2>
          <dl>
            <dt>Wind farm</dt>
            <dd>
              {i.project.turbines} × {num(i.project.turbineMw, 1)} MW = {num(k.capacityMw, 1)} MW in Hesse, outside the
              Südregion
            </dd>
            <dt>Energy yield</dt>
            <dd>
              Site quality (Gütefaktor) {pct(i.energy.siteQuality, 0)} → {num(k.fullLoadHoursP50, 0)} full-load hours
              (P50, net) → {num((k.capacityMw * k.fullLoadHoursP50) / 1000, 1)} GWh a year
            </dd>
            <dt>Tender</dt>
            <dd>
              Award price (Zuschlagswert) {ct(i.revenue.awardPriceCt)}, average of the round of{" "}
              {dateLabel(TENDER_FACTS.lastRoundDate)} → reference value (anzulegender Wert) {ct(k.awCt)}
            </dd>
            <dt>Timeline</dt>
            <dd>
              Financial close {dateLabel(tl.financialClose)} → {i.project.constructionMonths} months of construction →
              commercial operation {dateLabel(tl.cod)} → end of life {dateLabel(tl.endOfLife)} ({i.project.lifetimeYears}{" "}
              years)
            </dd>
            <dt>Investment</dt>
            <dd>
              {num(k.capexPerKw, 0)} €/kW net of VAT, {meur(k.capex)}; total uses including financing costs{" "}
              {meur(k.totalUses)}
            </dd>
            <dt>Debt</dt>
            <dd>
              KfW programme 270, {pct(i.financing.interestRate, 2)} fixed, {i.financing.tenorYearsFromClose} years from
              close with {i.financing.graceYears} grace years, linear repayment {firstRepayment}–{lastRepayment};{" "}
              {meur(k.debt)} ({pct(k.gearing, 0)} of uses)
            </dd>
            <dt>Tax</dt>
            <dd>
              GmbH & Co. KG (a GmbH as a switch), trade-tax multiplier (Hebesatz) {pct(i.tax.hebesatz, 0)}
            </dd>
          </dl>

          <nav aria-labelledby="toc-inline" className="rounded-xl border border-border bg-card p-4 lg:hidden">
            <p id="toc-inline" className="!mt-0 font-semibold">
              Contents
            </p>
            <ol className="!mt-2 columns-2 text-sm">
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`}>{label}</a>
                </li>
              ))}
            </ol>
          </nav>

          <H2 id="principles">1. Principles</H2>
          <ul>
            <li>
              <strong>Deterministic and nominal.</strong> The same inputs always give the same result. Amounts are
              nominal euros; unit prices are entered in 2025 or 2026 money and indexed with inflation. Two exceptions
              are nominal by nature: the reference value (fixed by law for 20 years) and power futures.
            </li>
            <li>
              <strong>Dated cash flows.</strong> Construction runs monthly with cash flows at month end; operations run
              by calendar year with cash flows at 31 December. The first and the last year count only the days in
              operation.
            </li>
            <li>
              <strong>Returns from dates.</strong> IRR and NPV use the exact dates with an Actual/365 day count, like
              XIRR and XNPV in Excel, so a half first year and monthly construction are weighted correctly.
            </li>
            <li>
              <strong>Two views.</strong> The project view (unlevered) shows what the wind farm earns; the owners’ view
              (levered) shows what reaches the equity after debt service and reserves.
            </li>
          </ul>

          <H2 id="timeline">2. Timeline</H2>
          <ul>
            <li>
              Financial close on {dateLabel(tl.financialClose)} is also the valuation date. After{" "}
              {i.project.constructionMonths} months the farm starts commercial operation on {dateLabel(tl.cod)}, so the
              first operating year has six months.
            </li>
            <li>
              EEG support lasts 20 years from commissioning (§ 25 EEG; for tendered plants it is not extended to the end
              of the year). It is extended by the time with negative prices (§ 51a EEG):{" "}
              {pct(i.energy.negativePriceTimeShare, 1)} of the hours in the base case, so support ends on{" "}
              {dateLabel(tl.eegEnd)}.
            </li>
            <li>
              The operating life is {i.project.lifetimeYears} years (30 as a variant); the farm is dismantled at the end,
              on {dateLabel(tl.endOfLife)}.
            </li>
            <li>
              The KfW loan runs {i.financing.tenorYearsFromClose} years from the commitment, which the model sets at
              financial close. The first {i.financing.graceYears} years are interest-only, then the loan is repaid in
              equal instalments ({firstRepayment}–{lastRepayment}). KfW collects quarterly; the model uses annual
              payments.
            </li>
          </ul>

          <H2 id="energy">3. Energy yield</H2>
          <pre>{`Capacity          P       = turbines × turbine rating
Site yield        h_site  = site quality × reference yield           (Anlage 2 Nr. 7 EEG)
P50, net          h_P50   = h_site × min(1, availability / 98%) × (1 − other losses)
Output            E_y     = P × h_P50 × f_y × (1 − degradation)^n_y
Output sold       E_sold  = E_y × (1 − share of output at negative prices)
P90               E_P90   = E_P50 × (1 − ${P90_Z} × σ)`}</pre>
          <ul>
            <li>
              The reference yield of the 6 MW class is {num(i.energy.referenceYieldHours, 0)} full-load hours at the 100%
              reference site (Deutsche WindGuard, 2025). At a site quality of {pct(i.energy.siteQuality, 0)} the site
              yield is {num(siteYield, 0)} hours.
            </li>
            <li>
              Site quality is an input, not a result: it sets both the output and the correction factor, as the law
              does. A better site produces more energy but receives a lower reference value.
            </li>
            <li>
              By law the site yield already excludes wake losses, up to 2% unavailability, electrical losses and
              curtailment required by the permit. The model deducts only the availability below 98% (
              {pct(i.energy.availability, 0)} in the base case) and optional other losses: {num(k.fullLoadHoursP50, 0)}{" "}
              hours.
            </li>
            <li>
              f<sub>y</sub> is the share of the year in operation, n<sub>y</sub> the full years since commissioning;
              degradation is {pct(i.energy.degradationPerYear, 1)} a year.
            </li>
            <li>
              In periods with negative prices the direct marketer curtails the farm and no premium is paid (§ 51 EEG).{" "}
              {pct(i.energy.negativePriceOutputShare, 0)} of the output falls into such periods in the base case.
            </li>
            <li>
              Grid curtailment under Redispatch 2.0 is compensated (§ 13a EnWG) and is not deducted.
            </li>
            <li>
              P90 uses the standard deviation of the yield: σ = {pct(i.energy.sigma1y, 1)} for a single year (P90 ={" "}
              {pct(p90share, 1)} of P50) and {pct(i.energy.sigma10y, 1)} for a ten-year average (
              {pct(p90share10, 1)}).
            </li>
          </ul>

          <H2 id="revenue">4. Revenue</H2>
          <pre>{`Correction factor  KF      = table of § 36h EEG, linear in between
Reference value    AW      = award price × KF                  (fixed in nominal terms)
Base price         B_y     = power futures 2027–2029, then the long-term price (2026 money) × price index
Market value       JW_y    = B_y × wind capture factor         (annual market value of onshore wind)
Market premium     MP_y    = max(0, AW − JW_y)                 (Anlage 1 Nr. 4 EEG)
Market revenue             = E_y × JW_y × support share of the year
Premium revenue            = E_sold × MP_y × support share of the year
After support              = E_y × (JW_y or PPA price) × rest of the year`}</pre>
          <Table
            head={["Site quality", "Correction factor"]}
            num={[0, 1]}
            rows={CORRECTION_FACTOR_TABLE.map(([g, f]) => [`${g}%${g === 50 ? " *" : ""}`, num(f, 2)])}
          />
          <p className="text-sm text-muted-foreground">
            * 50% applies only in the Südregion; elsewhere the factor stays at 1.42 below 60%. At{" "}
            {pct(i.energy.siteQuality, 0)} the factor is {num(k.correctionFactor, 3)}, so the reference value is{" "}
            {num(i.revenue.awardPriceCt, 2)} × {num(k.correctionFactor, 3)} = {ct(k.awCt)}.
          </p>
          <ul>
            <li>
              <strong>Why the two revenue parts use different volumes.</strong> The annual market value averages the
              price over all wind output, including hours with negative prices. A curtailed farm only gives up zero or
              negative prices, so output × market value is a cautious estimate of its market revenue. The premium, by
              law, is zero in negative-price periods, so it applies only to the output sold.
            </li>
            <li>
              <strong>Annual market value.</strong> For awards after 1 January 2023 the premium is based on the annual,
              not the monthly, market value. The one simplification: the farm’s own capture price equals the market
              value of all onshore wind.
            </li>
            <li>
              <strong>Base-case prices.</strong> Futures of{" "}
              {i.revenue.futuresEurMwh.map((f) => `${num(f.value, 2)}`).join(" / ")} €/MWh for{" "}
              {i.revenue.futuresEurMwh[0]!.year}–{i.revenue.futuresEurMwh.at(-1)!.year}, then{" "}
              {num(i.revenue.longTermBaseEurMwh2026, 0)} €/MWh in 2026 money plus inflation, times a capture factor of{" "}
              {num(i.revenue.captureFactor, 2)}: a market value of {num(mv(2029), 1)} €/MWh in 2029 and{" "}
              {num(mv(2035), 1)} €/MWh in 2035. The long-term price is the model’s strongest assumption; the tornado
              shows its weight.
            </li>
            <li>
              <strong>The EEG as a floor.</strong>{" "}
              {basePremium === 0 ? (
                <>
                  The reference value ({num(k.awCt * 10, 1)} €/MWh) stays below the expected market value in every
                  year, so the base case receives no premium.
                </>
              ) : (
                <>
                  The reference value ({num(k.awCt * 10, 1)} €/MWh) is above the expected market value in{" "}
                  {basePremium} years, when the premium is paid.
                </>
              )}{" "}
              In the downside case, with prices 20% lower, the premium is paid in {downsidePremium} years — the floor
              then works as insurance.
            </li>
            <li>
              <strong>Two-sided premium (switch).</strong> Under the EEG 2027 draft the premium can turn negative: when
              the market value exceeds the reference value, the farm pays the difference back. It is off by default —
              a 2026 award falls under EEG 2023, and whether the draft will apply to it is not settled.
            </li>
            <li>
              <strong>Payment timing.</strong> The grid operator pays monthly advances based on the previous year’s
              market value and settles in the following year (§ 26 EEG): the model receives the advance in the year and
              the rest a year later. Market sales are collected after {i.revenue.receivableDays} days.
            </li>
            <li>
              <strong>After support</strong> the farm sells at the market value or, as a switch, under a PPA at a fixed
              price in 2026 money.
            </li>
          </ul>

          <H2 id="opex">5. Operating costs</H2>
          <pre>{`Fixed items        = €/kW a year (2025 money) × capacity × price index × f_y
Land lease         = max(${pct(i.opex.leaseShareOfRevenue, 0)} of revenue, €${num(i.opex.leaseMinPerTurbine2026, 0)} per turbine in 2026 money)
Direct marketing   = ${num(i.revenue.directMarketingCtKwh2026, 2)} ct/kWh × output sold            (2026 money, indexed)
Municipal payment  = ${num(i.revenue.municipalCtKwh, 1)} ct/kWh × output                    (§ 6 EEG)
Guarantee fee      = ${pct(i.opex.guaranteeFeeRate, 2)} a year × decommissioning security
Generator grid fee = €/kW a year                              (${num(i.opex.gridFeePerKw2026, 0)} in the base case)`}</pre>
          <Table
            head={["€/kW a year, 2025 money", "Years 1–10", "11–20", "21+"]}
            num={[1, 2, 3]}
            rows={(
              [
                ["Maintenance (full service)", i.opex.maintenancePerKw],
                ["Technical and commercial management", i.opex.managementPerKw],
                ["Insurance", i.opex.insurancePerKw],
                ["Other", i.opex.otherPerKw],
              ] as const
            ).map(([label, v]) => [label, ...v.map((x) => num(x, x % 1 ? 1 : 0))])}
          />
          <ul>
            <li>
              The municipal payment is voluntary under § 6 EEG and is refunded by the grid operator in the next year’s
              settlement for quantities that received support — in the model, in years with a positive premium. After
              support it continues as a plain cost (switch).
            </li>
            <li>
              The decommissioning security follows the Hessian rule — hub height × €
              {num(i.opex.decommissioningBondPerMeterHub, 0)} per turbine — and is provided by a bank guarantee.
            </li>
            <li>
              Decommissioning costs {num(i.opex.decommissioningCostPerKw2026, 0)} €/kW in 2026 money at the end of
              life. The cash is set aside in equal instalments over the last {i.opex.decommissioningReserveYears} years.
            </li>
            <li>
              Inflation follows the Bundesbank projection for {i.macro.inflation[0]!.year}–
              {i.macro.inflation.at(-1)!.year} ({i.macro.inflation.map((x) => pct(x.value, 1)).join(" / ")}) and then
              the ECB target of {pct(i.macro.longRunInflation, 0)}.
            </li>
          </ul>

          <H2 id="investment">6. Investment and funding</H2>
          <Table
            head={["Capex item (net of VAT)", "€/kW", "Payment profile"]}
            num={[1]}
            rows={[
              ...capexItems.map((it) => [capexLabel[it.key] ?? it.key, num(it.eurPerKw, 0), profileLabel[it.profile]]),
              [`Contingency (${pct(i.capex.contingencyPct, 0)})`, num(itemsTotal * i.capex.contingencyPct, 0), profileLabel.linear],
              [<strong key="t">Total</strong>, <strong key="v">{num(k.capexPerKw, 0)}</strong>, meur(k.capex)],
            ]}
          />
          <ul>
            <li>
              Costs are Deutsche WindGuard’s 2025 levels for projects commissioned in 2025–2028, without escalation to
              financial close; turbine prices were stable in 2026.
            </li>
            <li>
              VAT of {pct(i.capex.vatRate, 0)} is paid with each invoice and refunded {i.capex.vatRefundLagMonths} months
              later. A VAT bridge loan at the senior rate plus {num(i.financing.vatFacilitySpread * 100, 2)} percentage
              points funds the gap; its interest, including the months after commissioning, is part of the uses.
            </li>
            <li>
              Financing costs during construction: an upfront fee of {pct(i.financing.upfrontFeePct, 0)} of the loan at
              close; a commitment fee of {pct(i.financing.commitmentFeePerMonth, 2)} a month on the undrawn amount from
              month {i.financing.commitmentFeeStartMonth} (the KfW rule); interest on drawn debt. KfW charges only
              interest in the grace years, so this interest is paid in cash and funded like capex rather than added to
              the loan.
            </li>
            <li>
              The debt service reserve account (DSRA) is funded at commissioning with {i.financing.dsraMonths} months of
              the next year’s debt service.
            </li>
            <li>Debt and equity are drawn pro rata each month (equity first as a switch).</li>
          </ul>
          <pre>{`Uses    = capex + upfront fee + commitment fee + interest during construction
          + VAT-loan interest + initial DSRA
Sources = senior debt + equity                                   check: sources − uses = 0`}</pre>
          <p>
            In the base case the uses of {meur(su.totalUses)} are capex {meur(su.capex)}, financing costs{" "}
            {meur(financing)} and the initial DSRA {meur(su.dsraInitial)}; they are funded by debt of {meur(su.debt)} and
            equity of {meur(su.equity)}.
          </p>

          <H2 id="debt">7. Debt sizing</H2>
          <p>
            German lenders size a wind-farm loan on the revenue they can plan with. In the <strong>bank case</strong>{" "}
            only the guaranteed floor counts during support — output sold × reference value — and base prices after it
            (a switch sizes on base prices throughout). Cash flow available for debt service (CFADS) is after tax.
          </p>
          <pre>{`Debt service per euro of loan   a_y   (known in advance for linear or annuity repayment)
Loan from the DSCR targets      D_DSCR = min over y of  min( CFADS_y[bank, P50] / (${num(i.financing.targetDscrP50, 2)} × a_y),
                                                           CFADS_y[bank, P90 1-year] / (${num(i.financing.targetDscrP90, 2)} × a_y) )
Loan                            D      = min( D_DSCR, ${pct(i.financing.maxGearing, 0)} × uses )`}</pre>
          <ul>
            <li>
              <strong>Circularity.</strong> Taxes depend on the interest, and the uses depend on the loan through fees,
              interest during construction and the DSRA. The model iterates until the loan changes by less than €0.50.
            </li>
            <li>
              <strong>Variants.</strong> Annuity repayment uses the same formula with annuity instalments. Sculpted
              repayment sets each year’s debt service to the lower of CFADS / target DSCR for P50 and P90 and sizes the
              loan as its present value at the loan rate.
            </li>
            <li>
              <strong>Base case.</strong> The binding constraint is the {en.overview.binding[b.sizing.binding]}: debt of{" "}
              {meur(k.debt)}, {pct(k.gearing, 0)} of uses. Community wind farms financed at lower rates and higher award
              prices show 79–90% debt in their prospectuses; at {pct(i.financing.interestRate, 2)} and a floor of{" "}
              {ct(k.awCt)} the debt capacity is far lower. In September 2026 a group of 18 banks warned of rising equity
              requirements for wind projects.
            </li>
          </ul>

          <H2 id="taxes">8. Taxes</H2>
          <pre>{`EBT           = EBITDA − depreciation − interest − increase of the decommissioning provision
Add-back      = 25% × max(0, interest + 50% × land lease − €200,000)           § 8 Nr. 1 GewStG
Trade income  = EBT + add-back − loss carry-forward (€1m in full, 60% above)     § 10a GewStG
                rounded down to €100, less €24,500 for a partnership              § 11 GewStG
Trade tax     = 3.5% × trade income × multiplier (Hebesatz)
Corporate tax = rate_y × (EBT − loss carry-forward: €1m in full, above it
                70% to 2027, 60% from 2028)            GmbH only; § 23 KStG, § 10d EStG
                rate_y: 15% to 2027; 14 / 13 / 12 / 11% in 2028–2031; 10% from 2032
Solidarity    = 5.5% × corporate tax`}</pre>
          <ul>
            <li>
              <strong>Depreciation.</strong> The base is capex plus the capitalised financing costs. All wind-farm assets
              are depreciated straight-line over {i.tax.depreciationYears} years (the German depreciation table; BFH IV R
              46/09); the first year counts from the month of commissioning. Declining-balance depreciation (3 ×
              straight-line, at most 30%: 18.75%) is a switch that applies only to assets commissioned between 1 July
              2025 and 31 December 2027 — not to the base case — and changes to straight-line once that is higher.
            </li>
            <li>
              <strong>Decommissioning provision.</strong> For tax, the obligation is accrued pro rata over the operating
              life at today’s prices and discounted at 5.5% (§ 6 EStG); its increase reduces taxable profit. The cash
              reserve is separate.
            </li>
            <li>
              Taxes are not deductible (§ 4 (5b) EStG), so the tax calculation itself has no circularity. Taxes are paid
              in the year they arise.
            </li>
            <li>
              <strong>Legal form.</strong> A GmbH & Co. KG pays only trade tax; income tax falls on its partners and is
              not modelled. The equity IRR of the KG is therefore before the partners’ taxes and is not directly
              comparable with the GmbH, which also pays corporate tax and the solidarity surcharge.
            </li>
            <li>
              Trade tax goes to the municipality where the turbines stand (§ 29 GewStG), so one multiplier applies. The
              checks flag a multiplier below the legal minimum of 280% from 2027 and interest above the €3m threshold of
              the interest barrier (§ 4h EStG).
            </li>
          </ul>

          <H2 id="waterfall">9. Cash waterfall</H2>
          <pre>{`CFADS           = EBITDA − change in working capital − taxes
− interest − principal
± DSRA          top up to ${i.financing.dsraMonths} months of next year’s debt service, release the excess, draw on a shortfall
− reserve       equal instalments for decommissioning in the last ${i.opex.decommissioningReserveYears} years
  lock-up       if DSCR < ${num(i.financing.lockupDscr, 2)} during the loan term, the year’s cash stays in the company
                until the DSCR is back above the threshold
= distribution to the owners`}</pre>
          <p>
            In the final year the DSRA, any trapped cash and the reserve are released and decommissioning is paid. If
            cash falls short, the owners fund the gap (a negative distribution). The cash balance may never be negative —
            one of the checks.
          </p>

          <H2 id="results">10. Results</H2>
          <Table
            head={["Measure", "Definition", "Base case"]}
            num={[2]}
            rows={[
              [
                "Equity IRR",
                "XIRR of the owners’ monthly contributions during construction and their annual distributions",
                pct(k.equityIrr, 2),
              ],
              [
                "Project IRR",
                "XIRR of capex (net of VAT and financing costs) and EBITDA − change in working capital − decommissioning; after tax, taxes are recomputed without interest",
                `${pct(k.projectIrrPreTax, 2)} pre-tax, ${pct(k.projectIrrPostTax, 2)} after tax`,
              ],
              [
                "Equity NPV",
                `XNPV of the owners’ flows at the cost of equity (${pct(i.macro.costOfEquity, 0)}), discounted to financial close`,
                meur(k.npvEquity),
              ],
              [
                "LCOE",
                `Fraunhofer ISE method: (PV capex + PV opex net of the § 6 refund + PV decommissioning) ÷ PV output sold; real 2026 money at a real WACC of ${pct(i.macro.waccReal, 1)} (nominal: ${pct(i.macro.waccNominal, 1)}), without taxes and financing costs`,
                `${ct(k.lcoeRealCt)} (nominal ${num(k.lcoeNominalCt, 2)})`,
              ],
              ["DSCR", "CFADS ÷ (interest + principal) in each year of the loan", `${ratio(k.minDscr)} min, ${ratio(k.avgDscr)} average`],
              ["LLCR", "PV of CFADS over the loan term at the loan rate ÷ loan", ratio(k.llcr)],
              ["Payback", "Years from commissioning until the owners’ cumulative cash flow turns positive", `${num(k.paybackYears, 1)} years`],
              ["Gearing", "Loan ÷ total uses", pct(k.gearing, 1)],
            ]}
          />

          <H2 id="scenarios">11. Scenarios, sensitivity and bid calculator</H2>
          <p>
            The base case sizes the loan. P90 and Downside keep that loan and its repayment schedule — the lender’s view
            after financial close.
          </p>
          <Table
            head={["Scenario", "Changes against the base case", "Equity IRR", "Min DSCR", "Equity NPV"]}
            num={[2, 3, 4]}
            rows={[
              ["Base", "P50 output, base prices and costs", pct(k.equityIrr, 2), ratio(k.minDscr), meur(k.npvEquity)],
              [
                "P90",
                `One-year P90 output in every year (${pct(p90share, 1)} of P50)`,
                pct(BASE.p90.kpis.equityIrr, 2),
                ratio(BASE.p90.kpis.minDscr),
                meur(BASE.p90.kpis.npvEquity),
              ],
              [
                "Downside",
                `Ten-year P90 output (${pct(p90share10, 1)}), market prices −20%, opex +10%, capex +5% paid by the owners`,
                pct(BASE.downside.kpis.equityIrr, 2),
                ratio(BASE.downside.kpis.minDscr),
                meur(BASE.downside.kpis.npvEquity),
              ],
            ]}
          />
          <p>
            <strong>Tornado.</strong> Each driver is moved to its low and high value with the loan re-sized — the view
            before financial close — and the drivers are sorted by the swing of the chosen measure.
          </p>
          <Table
            head={["Driver", "Low", "High"]}
            rows={TORNADO_DRIVERS.map((d) => [en.sensitivity.drivers[d.id] ?? d.id, d.lowLabel, d.highLabel])}
          />
          <p>
            <strong>Bid calculator.</strong> It finds the lowest award price at which the equity IRR reaches a target,
            re-sizing the loan at every step. The IRR is not monotonic in the award price: a higher floor allows more
            debt at {pct(i.financing.interestRate, 2)}, which can lower the equity return. So the search scans a 0.25 ct
            grid for the first crossing and then bisects within that step.
            {bid.awardPriceCt !== null && (
              <>
                {" "}
                In the base case, an equity IRR of {pct(i.macro.costOfEquity, 0)} needs {ct(bid.awardPriceCt)} (reference
                value {ct(bid.awCt)}) — above the 2026 ceiling of {ct(TENDER_FACTS.ceiling2026Ct)}.
              </>
            )}
          </p>

          <H2 id="checks">12. Checks</H2>
          <p>Every recalculation runs {Object.keys(en.checks.ids).length} checks; the calculator shows their status.</p>
          <ul className="columns-1 sm:columns-2">
            {Object.values(en.checks.ids).map((label) => (
              <li key={label} className="break-inside-avoid">
                {label}
              </li>
            ))}
          </ul>

          <H2 id="verification">13. Verification</H2>
          <ul>
            <li>
              Automated tests cover the financial maths (against Microsoft’s published XIRR and XNPV examples), the § 36h
              table, taxes and depreciation, the model and its scenarios, the bid calculator and the Excel export.
            </li>
            <li>
              A spreadsheet built from the written specification — not from the code — recomputes the base case in
              Microsoft Excel. All 20 key figures and twelve annual lines agree to the cent, and the workbook finds both
              convergence points (uses and loan) on its own. A negative control with a different trade-tax multiplier
              moves exactly the tax-dependent lines.
            </li>
            <li>
              The source code, including the tests, is public on <a href={SITE.repository}>GitHub</a>.
            </li>
          </ul>

          <H2 id="limitations">14. Limitations</H2>
          <ul>
            <li>Operations are annual; output is spread evenly over the year (winter is in fact windier).</li>
            <li>The farm’s capture price equals the market value of all onshore wind.</li>
            <li>The partners’ income tax of a KG is not modelled; taxes are paid in the year they arise.</li>
            <li>One senior loan: no tranches, shareholder loans, refinancing or cash sweep.</li>
            <li>
              Uncompensated grid curtailment (a draft of the grid package) and generator grid fees (the regulator’s
              AgNes process) are not in the base case; the fee is available as an input.
            </li>
            <li>The Excel export contains values, not formulas.</li>
            <li>The wind farm is fictional and the results are illustrative.</li>
          </ul>
        </article>

        <aside className="hidden lg:block" aria-labelledby="toc">
          <nav className="sticky top-6 rounded-xl border border-border bg-card p-4 text-sm">
            <p id="toc" className="font-semibold">
              Contents
            </p>
            <ol className="mt-2 space-y-1">
              {SECTIONS.map(([id, label], n) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                    {n + 1}. {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
    </>
  );
}
