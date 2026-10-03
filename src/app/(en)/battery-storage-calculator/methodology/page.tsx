import Link from "next/link";
import type { ReactNode } from "react";
import { BESS_CASE_NAME, BESS_DATA_AS_OF, BESS_PUBLISHED, BESS_SPEC_REVISION, BESS_UPDATED } from "@/bess/data";
import { BESS_BASE, runBess } from "@/bess/engine";
import { buildCapex } from "@/bess/engine/capex";
import {
  CAPEX, CASE, CONTRACT_DEFAULTS, CONTRACT_PRESET_MW, FINANCE, MACRO, OPEX, PRICE_LEVEL_EUR, RESERVE, REVENUE, SPREAD_PATHS, TAX, TECH, WAR,
} from "@/bess/engine/registry";
import { bessEn } from "@/bess/messages";
import { bessBase, loadLibrary } from "@/bess/server";
import { JsonLd } from "@/components/site/JsonLd";
import { ProseTable as Table } from "@/components/site/ProseTable";
import { dateLabel, meur, num, pct, ratio } from "@/lib/format";
import { BESS_OG_IMAGE, pageMetadata } from "@/lib/metadata";
import { absoluteUrl, BESS_ID, breadcrumbJsonLd, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";

const TITLE = "How the battery storage model works";
const DESCRIPTION =
  "Methodology of the Battery Storage Investment Calculator for Ukraine: perfect-foresight day-ahead dispatch on derived " +
  "price data, spread paths, degradation, war risk, network tariffs, a euro loan sculpted on a lender's case, Ukrainian " +
  "tax and currency rules, an optional Ukrenergo reserve contract, KPIs and checks — with formulas.";

export const metadata = pageMetadata({ title: "Battery storage model methodology", description: DESCRIPTION, path: PATHS.bessMethodology, type: "article", image: BESS_OG_IMAGE });

const SECTIONS = [
  ["principles", "Principles"],
  ["revenue", "Revenue"],
  ["battery", "Battery"],
  ["investment", "Investment"],
  ["costs", "Operating costs and grid"],
  ["war", "War risk"],
  ["financing", "Financing"],
  ["taxes", "Taxes"],
  ["currency", "Currency and cash out"],
  ["contract", "Reserve contract (option)"],
  ["results", "Results"],
  ["sensitivity", "Sensitivity and break-even"],
  ["checks", "Checks and verification"],
  ["limitations", "Limitations"],
] as const;

function H2({ id, children }: { id: (typeof SECTIONS)[number][0]; children: ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

const eur = (v: number, d = 0) => `€${num(v, d)}`;

export default function BessMethodologyPage() {
  const { core, extras, pstar } = bessBase();
  const r = core.result;
  const k = r.kpis;
  const inp = core.inputs;
  const lib = loadLibrary().manifest;
  const gate = (lib as unknown as { releaseGate?: { annualHours: number; monthlyHours: number; annualFee: number; monthlyFee: number } }).releaseGate;
  const capex = ([1, 2, 4] as const).map((h) => ({ h, c: buildCapex(CASE.powerMW, h, "dso110kV", 1) }));
  const nodes = lib.nodes;
  const be = extras.breakEven;
  const y29 = r.annual.find((a) => a.year === 2029)!;
  const P = inp.powerMW;
  const paths = (["reference", "low", "high"] as const).map((id) => [id, SPREAD_PATHS[id]] as const);
  // the base battery with the default reserve contract (v1.1a): the numbers of section 10 come from this run
  const cd = CONTRACT_DEFAULTS;
  const withAward = runBess({ ...BESS_BASE, contract: { ...cd } }, loadLibrary());
  const award = withAward.contract!;
  const ak = withAward.kpis;
  const pBe = pstar.breakEven;
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "TechArticle",
            "@id": `${absoluteUrl(PATHS.bessMethodology)}#article`,
            headline: TITLE,
            description: DESCRIPTION,
            url: absoluteUrl(PATHS.bessMethodology),
            inLanguage: "en",
            author: { "@id": PERSON_ID },
            about: { "@id": BESS_ID },
            datePublished: BESS_PUBLISHED,
            dateModified: BESS_UPDATED,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: bessEn.meta.breadcrumb, path: PATHS.bess },
            { name: "Methodology", path: PATHS.bessMethodology },
          ]),
        )}
      />
      <div className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 pb-4 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="prose-page min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            <Link href={PATHS.bess} className="!text-muted-foreground !no-underline hover:!underline">
              {bessEn.meta.title}
            </Link>{" "}
            · Methodology
          </p>
          <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p className="text-lg">
            This page documents what the calculator computes, in which order and with which formulas (methodology
            revision {BESS_SPEC_REVISION}). The battery is fictional; every input comes from a public source or is a
            documented assumption — both are listed on the <Link href={PATHS.bessSources}>sources page</Link>. Prices run
            to {dateLabel(BESS_DATA_AS_OF)}. The numbers below come from the same engine that runs in the calculator.
          </p>
          <p className="text-sm text-muted-foreground">{bessEn.header.disclaimer}</p>

          <h2 id="glance">The base case at a glance</h2>
          <dl>
            <dt>Battery</dt>
            <dd>
              “{BESS_CASE_NAME}”: {P} MW / {P * inp.durationH} MWh of usable AC energy at the start of life ({inp.durationH} h),
              one site in the Kyiv region, connected to the 110 kV distribution network
            </dd>
            <dt>Revenue</dt>
            <dd>
              Day-ahead trading only: buying in cheap hours, selling in dear ones. A multi-year reserve contract with
              Ukrenergo is an option, off in the base case (section 10)
            </dd>
            <dt>Timeline</dt>
            <dd>
              Financial close {dateLabel(CASE.financialClose)} → {CASE.constructionMonths} months of construction → commercial
              operation 1 Feb 2028 → {CASE.operatingLifeYears} years of operation, the last month January 2043 → three months
              of settlement
            </dd>
            <dt>Company</dt>
            <dd>A Ukrainian limited company owned 100% by a German GmbH through share capital</dd>
            <dt>Investment</dt>
            <dd>
              {meur(r.capexAllInEur, 1)} without VAT ({eur(r.capexAllInEur / (P * inp.durationH * 1000))} per kWh of usable
              energy)
            </dd>
            <dt>Debt</dt>
            <dd>
              A euro loan from an international development bank at {pct(FINANCE.interestRate, 1)} fixed, sized on the
              lender’s case: {meur(k.debtEur?.value ?? 0, 1)} ({pct(k.gearing?.value ?? 0, 0)} of the investment)
            </dd>
            <dt>Result</dt>
            <dd>
              Investor IRR {k.investorIrr?.value != null ? pct(k.investorIrr.value, 1) : "n/a"} in euros; NPV at{" "}
              {pct(inp.equityHurdle, 0)} {meur(k.investorNpv?.value ?? null, 1)}
              {be.status === "found" && be.value !== null && <>; break-even at spreads {num(be.value, 2)} times the reference path</>}
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
              <strong>Monthly and dated.</strong> The model runs month by month from financial close to the end of
              settlement. Cash flows fall at month ends; debt service on 1 February and 1 August. IRR and NPV use exact
              dates with an Actual/365 day count, like XIRR and XNPV.
            </li>
            <li>
              <strong>Two currencies.</strong> The company keeps its books in hryvnias. Euro items — the equipment, the
              loan, the reserve account, euro costs — are converted at the month’s exchange rate. The investor is measured
              in euros.
            </li>
            <li>
              <strong>Honest about what is missing.</strong> The base case values day-ahead trading only, and the result is
              shown as it is: the first screen of the calculator says what it would take to break even. A special-auction
              reserve contract with Ukrenergo can be added; daily reserve auctions, the balancing market and the intraday
              market are not in the model.
            </li>
            <li>
              <strong>No raw prices on the site.</strong> The revenue comes from a library computed in advance on the
              Market Operator’s hourly prices. The site publishes only results derived from them.
            </li>
            <li>
              <strong>Checks, not hidden fixes.</strong> A failed check is shown, never smoothed over; what the model does
              not cover is marked as outside its scope, never as passed.
            </li>
          </ul>

          <H2 id="revenue">2. Revenue</H2>
          <h3>The revenue library</h3>
          <p>
            For every day of a price year, an optimiser finds the best charge and discharge schedule with perfect
            foresight — a mixed-integer program per day and per MW:
          </p>
          <pre>{`maximise   Σ_t  p[t]·d[t] − p[t]·c[t] − fee·c[t]
subject to x[t+1] = x[t] + RTE·c[t] − d[t]        all losses on charging
           0 ≤ c[t] ≤ P·u[t],  0 ≤ d[t] ≤ P·(1 − u[t])   no charging and discharging at once
           0 ≤ x[t] ≤ usable hours · P;  x = 0 at the start and the end of each day
           Σ_t d[t] ≤ cycle limit · duration · P`}</pre>
          <p>
            Ties are broken towards less discharge, so the battery does not wear itself out for nothing. The library holds
            monthly sums of sales, purchases and energy for {num(nodes, 0)} combinations: two price years (2025 and the 12
            months to September 2026), durations of 1, 2 and 4 hours, usable energy on a fine grid as the battery fades,
            efficiency nodes of 85, 88 and 90%, cycle limits of 1.0 and 1.5 a day, and an effective fee per MWh bought of 0
            to 4,000 UAH. The calculator interpolates between nodes and never extrapolates: an input outside the grid is
            reported, not clamped.
          </p>
          {gate && (
            <p>
              Before release, every midpoint between nodes is solved exactly and compared with the interpolation: the
              largest error is {pct(gate.annualHours, 2)} of a year’s value along the usable-energy axis and{" "}
              {pct(gate.annualFee, 2)} along the fee axis ({pct(gate.monthlyHours, 2)} and {pct(gate.monthlyFee, 2)} for a
              single month), within the release limits of 0.5% and 1.5%.
            </p>
          )}

          <h3>From history to the future</h3>
          <p>Future prices are the historical ones, shifted to a future price level and with their spreads scaled:</p>
          <pre>{`p_future = L(y) + m(y) · (p_hist − L̄)        L̄ = average price of the chosen price year`}</pre>
          <p>
            The price level L falls from {eur(PRICE_LEVEL_EUR[2028], 1)} per MWh in 2028 to {eur(PRICE_LEVEL_EUR[2031], 1)} in
            2031 (2025 euros), from Ukraine’s 2025 average towards that of its EU neighbours. The spread multiplier m(y)
            follows one of three paths:
          </p>
          <Table
            head={["Path", "2028", "2029", "2030", "2031 on"]}
            num={[1, 2, 3, 4]}
            rows={paths.map(([id, p]) => [bessEn.options.scn?.[id] ?? id, num(p[2028], 3), num(p[2029], 3), num(p[2030], 3), num(p[2031], 3)])}
          />
          <p>
            The reference path converges by 2031 to where Hungary, Romania, Slovakia and Poland were in 2025: their average
            daily top-two-hour spread was {eur(REVENUE.neighbourTb2Eur2025, 2)} per MWh against {eur(REVENUE.anchorTb2Eur, 2)} in
            Ukraine. The low path — the lender’s view — has 1.4 GW of batteries in the pipeline flatten spreads to 60% of
            2025. The high path starts 2028 at the level of 2026 and comes down to that of 2025 by 2031. No
            probabilities are attached.
          </p>
          <p>
            For a given schedule, the transformation is linear in the library’s sums, so a month’s sales and purchases
            follow without solving again: <code>S = m·S_hist + (L − m·L̄)·O</code> and <code>P = m·P_hist + (L − m·L̄)·I</code>,
            with O and I the energy delivered and drawn.
          </p>
          <h3>Tariffs and fees inside the dispatch</h3>
          <p>
            Network tariffs on net withdrawal, the Market Operator’s fee per MWh bought and sold, and the shift of the price
            level all change which schedule is best. In a day that starts and ends empty, the energy delivered equals the
            efficiency times the energy bought, so each of them is exactly a fee per MWh bought:
          </p>
          <pre>{`fee = (1 − RTE) · (tariff on net withdrawal + level shift)
    + (1 + RTE) · market fee per MWh
    + tariff on all withdrawal                     from May 2037, or if the legacy treatment is lost`}</pre>
          <p>
            Each is converted to the library’s base-year hryvnias, and the library is read at that fee: the battery cycles
            less when it costs more. The tariffs and fees are then charged in cash on the actual volumes.
          </p>
          <h3>From the optimum to cash</h3>
          <pre>{`captured   = ${num(REVENUE.captureFactor, 2)} · max(margin, 0) + min(margin, 0)
fee        = ${pct(REVENUE.optimiserFeeRate, 0)} · max(captured, 0)
energy     × availability (${pct(TECH.availabilityYear1, 0)} in the first year, ${pct(TECH.availability, 0)} after) × (1 − expected war downtime)`}</pre>
          <p>
            The realism factor stands for what perfect foresight overstates: bids are placed before prices are known, a
            50 MW battery moves the evening price, and the state of charge has to be managed. In 2029 the base case earns{" "}
            {eur(y29.pfMarginEur / P / 1000, 0)}k per MW with perfect foresight and {eur(y29.netRevenueEur / P / 1000, 0)}k after
            the realism factor and the fee.
          </p>

          <H2 id="battery">3. Battery</H2>
          <p>
            The usable AC energy of {P * inp.durationH} MWh at the start needs {num(TECH.nameplateFactor, 5)} times as much DC
            nameplate capacity: a state-of-charge window of 90% and the discharge losses. The battery fades with age and use
            (NREL BLAST-Lite, lithium iron phosphate at 25 °C):
          </p>
          <pre>{`state of health = 1 − ${TECH.calendarFade.coefficient} · years^${TECH.calendarFade.exponent} − ${TECH.cycleFade.coefficient.toExponential(2)} · EFC^${TECH.cycleFade.exponent}
EFC = ${TECH.efcPerAcCycle} · energy delivered / usable energy at the start`}</pre>
          <ul>
            <li>
              Modules are added once, in the 121st month of operation: {pct(TECH.augmentation.dcShareOfInitial, 0)} of the
              original DC capacity at €{TECH.augmentation.priceEurPerKwhDc2026} per kWh (2026 prices, indexed). They age on
              their own curve; the old modules are not restored.
            </li>
            <li>The power conversion system is overhauled after 144 months for €{num(TECH.pcsOverhaul.eurPerMW2026 / 1000, 0)}k per MW.</li>
            <li>A group of modules below {pct(TECH.minimumOperatingSoH, 0)} state of health is taken out of service.</li>
            <li>
              Decommissioning costs €{TECH.decommissioningEurPerKwhUsable2026} per kWh of usable energy, paid at the end; the
              battery has no residual value.
            </li>
          </ul>

          <H2 id="investment">4. Investment</H2>
          <p>
            The investment is built from drivers rather than taken as one price: battery blocks per DC kWh, power conversion
            and the substation per MW, shares for balance of plant, the energy management system and the contractor’s
            margin, then the grid connection, a 110 kV line, protection against attacks, development, owner’s costs and a
            contingency. Without VAT, in 2026 prices:
          </p>
          <Table
            head={["", "1 h", "2 h", "4 h"]}
            num={[1, 2, 3]}
            rows={[
              ["DC nameplate, MWh", ...capex.map(({ c }) => num(c.nameplateDcMWh, 1))],
              ["EPC (turnkey)", ...capex.map(({ c }) => meur(c.epcEur, 2))],
              ["All-in", ...capex.map(({ c }) => meur(c.allInEur, 2))],
              ["Per kWh of usable energy", ...capex.map(({ h, c }) => eur(c.allInEur / (CASE.powerMW * h * 1000)))],
            ]}
          />
          <ul>
            <li>
              Inputs: battery blocks €{CAPEX.dcBlockEurPerKwhDc} per DC kWh; power conversion and MV €
              {num(CAPEX.pcsMvEurPerMW / 1000, 0)}k and the 110 kV substation €{num(CAPEX.hvSubstationEurPerMW / 1000, 0)}k per
              MW; balance of plant {pct(CAPEX.bopCivilFireShare, 1)}, controls {pct(CAPEX.emsShare, 1)}, margin{" "}
              {pct(CAPEX.epcMarginShare, 1)}; protection {meur(CAPEX.physicalProtectionEur, 1)}; owner’s costs{" "}
              {pct(CAPEX.ownersCostShareOfEpc, 0)} and contingency {pct(CAPEX.contingencyShareOfEpc, 0)} of the EPC.
            </li>
            <li>
              The connection fee ({num(CAPEX.connectionFeeUahPerKw, 0)} UAH per kW) and the line ({CAPEX.line110kVKm} km) are
              priced in hryvnias; the rest in euros. Payments follow the construction schedule and the month’s exchange rate.
            </li>
            <li>
              Lithium-ion batteries and inverters are imported free of VAT and duty until 1 January 2029; transformers and
              everything else pay {pct(CAPEX.vatRate, 0)} VAT, refunded after {CAPEX.vatRefundLagMonths} months.
            </li>
            <li>A bay in Ukrenergo’s substation instead of the distribution network adds {meur(CAPEX.ukrenergoBayExtraEur, 2)}.</li>
          </ul>

          <H2 id="costs">5. Operating costs and grid</H2>
          <ul>
            <li>
              Maintenance €{OPEX.omEurPerKwYear} per kW a year; property insurance {pct(OPEX.propertyInsuranceRate, 1)} of the
              replacement value; a guard post {num(OPEX.securityUahPerMonth, 0)} UAH a month; company, accounting and asset
              management €{num(OPEX.spvAdminEurPerYear / 1000, 0)}k a year; metering; land lease. Euro items rise with euro
              inflation, hryvnia items with Ukrainian inflation.
            </li>
            <li>
              Market Operator fee {num(OPEX.marketOperatorFeeUahPerMWh, 2)} UAH per MWh bought and sold plus a monthly charge;
              the regulator’s levy of {pct(OPEX.neurcFeeRate, 3)} of sales.
            </li>
            <li>
              Network tariffs: transmission and dispatch 1,047.09 UAH per MWh in 2027 plus the class 1 distribution tariff of
              628.37 UAH, both indexed. A storage plant in operation by 30 April 2028 pays them on its net withdrawal until 30
              April 2037; afterwards the model charges them on everything it draws, until the regulator sets the method. A
              later start loses this treatment from the first day.
            </li>
            <li>Public service surcharges announced from 2030 are not quantified: the checks mark them as outside the model.</li>
          </ul>

          <H2 id="war">6. War risk</H2>
          <p>The base case carries war risk as an expected loss rather than insurance, because cover for energy assets is scarce:</p>
          <pre>{`expected loss   = ${pct(WAR.marketPremium, 0)} market premium × ${num(WAR.lossRatio, 2)} = ${pct(WAR.marketPremium * WAR.lossRatio, 1)} of the replacement value a year
chance of a hit = ${pct(WAR.marketPremium * WAR.lossRatio, 1)} / ${pct(WAR.severity, 0)} damage = ${pct((WAR.marketPremium * WAR.lossRatio) / WAR.severity, 0)} a year
downtime        = ${pct((WAR.marketPremium * WAR.lossRatio) / WAR.severity, 0)} × ${WAR.downtimeMonths} months / 12 = ${pct(((WAR.marketPremium * WAR.lossRatio) / WAR.severity) * (WAR.downtimeMonths / 12), 1)} of revenue`}</pre>
          <p>
            The expected loss is a monthly cost, deducted for tax. It is an estimate of average repair costs, not a forecast
            of a strike: the NPV of the expected cash flow is meaningful, but the IRR of the expected cash flow is not the
            expected IRR. With insurance switched on, a hypothetical policy replaces it: a premium of{" "}
            {pct(WAR.insurancePremiumRate, 0)} a year, claims after a deductible of {pct(WAR.deductibleShare, 0)} (at least{" "}
            {meur(WAR.deductibleMinEur, 2)}) paid nine months later, and the state refund of the premium above 1% up to 5
            million UAH a year.
          </p>

          <H2 id="financing">7. Financing</H2>
          <ul>
            <li>
              <strong>Sources and uses.</strong> Investment, construction VAT, interest during construction, fees, the debt
              service reserve and a liquidity reserve are funded by equity first, then the loan; VAT refunds reduce the
              need. Construction follows the contract dates even if operation starts late.
            </li>
            <li>
              <strong>Loan.</strong> Euros, {pct(FINANCE.interestRate, 1)} fixed all-in, an upfront fee of{" "}
              {pct(FINANCE.upfrontFeeRate, 0)} and a commitment fee of {pct(FINANCE.commitmentFeeRate, 1)} a year; 18 half-yearly
              instalments from {dateLabel(FINANCE.firstRepayment)} to {dateLabel(FINANCE.maturity)}.
            </li>
            <li>
              <strong>Sizing.</strong> The lender looks at the low spread path with the lower library node and sculpts the
              repayments so that cash covers each instalment {ratio(FINANCE.targetDscrMerchant)}; the loan never exceeds{" "}
              {pct(FINANCE.maxGearing, 0)} of the investment and its balance never rises. Because the loan changes interest,
              fees, reserves and tax, sizing iterates until it moves by less than one cent. Stresses and the sensitivity keep
              the loan as signed.
            </li>
            <li>
              <strong>Reserves and covenants.</strong> The reserve account holds the next instalment and is topped up from
              cash every month. Dividends need two full
              periods of debt service, a cover of at least {ratio(FINANCE.lockupDscr)} in the last two, a full reserve and no
              arrears; below {ratio(FINANCE.defaultDscr)} the loan is in default. A shortfall stays owed with interest.
            </li>
            <li>
              <strong>Liquidity.</strong> Day-ahead buyers pay in advance; a reserve of three peak days of purchases plus the
              balance-responsibility guarantee covers that.
            </li>
          </ul>

          <H2 id="taxes">8. Taxes</H2>
          <ul>
            <li>
              Corporate income tax {pct(TAX.citRate, 0)} on the result in hryvnias, after depreciation, interest and exchange
              differences on the euro loan and reserve; losses carried forward without limit.
            </li>
            <li>
              Straight-line depreciation over the operating life, the same in the books and for tax; later additions over the
              rest of the life but not faster than five years. The optional two-year depreciation is left for a later version.
            </li>
            <li>
              Annual returns for 2027 and 2028, quarterly from 2029, with the final payment for a year in March of the next.
            </li>
            <li>
              Dividends are paid only from the taxed profit of closed years, so the advance tax on dividends never arises;
              {` ${pct(TAX.dividendWht, 0)}`} withholding tax applies under the German–Ukrainian treaty. Interest to the
              development bank is free of withholding tax.
            </li>
          </ul>

          <H2 id="currency">9. Currency and cash out</H2>
          <ul>
            <li>
              EUR/UAH annual averages of 51.5 (2026), 54.6, 57.0 and {num(MACRO.fxEurUah[2029]!, 1)} (2029), then{" "}
              {pct(MACRO.fxGrowthAfter, 1)} weaker a year; the stress adds {pct(MACRO.fxStress, 0)} from 2028.
            </li>
            <li>
              The National Bank lets a company transfer dividends of up to €
              {num(MACRO.repatriationCapEurPerMonth / 1e6, 0)} million a month abroad. The model keeps this limit for the whole
              life and applies it to the return of capital when the company is wound up, paying out month by month after the
              model ends. A stress blocks that final transfer altogether.
            </li>
          </ul>

          <H2 id="contract">10. Reserve contract (option)</H2>
          <p>
            Ukrenergo buys reserve capacity in special auctions: an award of 13 months to five years, paid for availability
            at a euro price per MW and hour. The price is fixed at the National Bank’s average rate of the auction month and
            paid in hryvnias at each month’s rate. Rounds for symmetric aFRR — automatic frequency restoration reserve, up
            and down — cleared at about €17–29 in 2024–2025; none was held in 2026. The calculator can add one award and,
            as a hypothesis, a second one after it. It is off in the base case. By default: {cd.acceptedMW} MW for the
            2-hour battery ({CONTRACT_PRESET_MW[1]} and {CONTRACT_PRESET_MW[4]} MW for 1 and 4 hours),{" "}
            {eur(cd.eurPerMWHour)} per MW-hour, {cd.tenorMonths} months from March 2028. This is a screen of expected cash
            flows, not a simulation of hourly operation.
          </p>
          <h3>What the award takes from the battery</h3>
          <pre>{`σ_P = C · (1 + ρ + λ) / P                power: the command, the recovery margin, the standing load
σ_E = C · (h_up + h_down) / (u · P)         energy: full activation held h hours each way; u = usable hours
σ*  = max(σ_P, σ_E)                         the share of the battery the award takes
σ_a = 1 − σ* · Z − τ                        the share left for day-ahead trading`}</pre>
          <p>
            C is the award and P the battery’s power; ρ = {pct(cd.recoveryPowerShare, 0)} is power kept free to restore the
            energy stock, and h = {num(cd.sustainHours, 0)} hour is the minimum full activation for aFRR. Z is the share of
            the award still in force: a hit ends the contract for the share hit (an option suspends it instead), and that
            share trades again after its repair. τ withholds one day in the months the stock is filled and sold. The
            revenue library is scaled by σ_a. With the default award the contract takes {pct(award.summary.sigmaStarMax, 0)}{" "}
            of the battery; in 2029 {pct(award.summary.daShare2029, 0)} is left for trading.
          </p>
          <p>The award must fit on every day of service and on the days the stock is filled and sold, on the selected path and on the lender’s:</p>
          <ul>
            <li>
              on the busiest day — activation {num(cd.peakDayFactor, 0)} times the month’s average over a 25-hour day — the
              energy the reserve delivers and exports stays within its share of the daily warranty quota;
            </li>
            <li>on that day, the energy bought or exported to keep the stock constant fits through the recovery margin;</li>
            <li>the stock is bought on the last day before service and sold on the first day after it, within C · (1 + ρ) over a 23-hour day.</li>
          </ul>
          <p>
            A failed check rejects the case instead of shrinking the award, and the calculator shows the largest award that
            passes every check: {num(pstar.cMax, 0)} MW for the base battery. After a full command, restoring the stock
            takes h / (RTE · ρ) = {num(award.summary.recoveryHoursUp, 1)} hours up and RTE · h / ρ ={" "}
            {num(award.summary.recoveryHoursDown, 1)} hours down; repeated commands beyond the stock are not modelled.
          </p>
          <h3>Money</h3>
          <ul>
            <li>
              <strong>Availability fee:</strong> price × the month’s exchange rate × awarded MW × hours × the share in
              service; invoiced with VAT and paid the next month.
            </li>
            <li>
              <strong>Activation energy:</strong> {pct(cd.activationUp, 0)} of the award per hour each way, of which{" "}
              {pct(cd.nettingShare, 0)} is left after up and down commands in the same hour cancel out. It is paid at the
              month’s day-ahead price level, because balanced hours are settled at the day-ahead price; an option uses the
              balancing prices of 2025. Claims on and debts to Ukrenergo offset within a month; a remaining claim is paid
              after {cd.balancingLagMonths} months.
            </li>
            <li>
              <strong>Energy stock:</strong> bought before service, kept topped up at day-ahead prices with network
              charges and market fees, sold when the contract ends.
            </li>
            <li>
              <strong>Security and cash:</strong> €{num(RESERVE.collateralEurPerMW, 0)} per MW in escrow from the auction to
              the end of service, paid in by the owner; a liquidity reserve of {cd.liquidityDays} days of reserve purchases
              and balancing payables. A start up to {RESERVE.deferralMaxMonths} months late costs a{" "}
              {pct(RESERVE.deferralTopUpShare, 0)} top-up, of which a quarter is kept each month; a later start cancels the
              award and the security is kept.
            </li>
            <li>
              <strong>Penalties:</strong> {cd.failureEvents} failures a year without wartime relief, each charged at{" "}
              {RESERVE.penaltyFactorAfrr} times the fee over {cd.penaltyHours} hour — an expected cost, not the rules’
              look-back window. The certificate is renewed every {RESERVE.certificateMonths} months for €
              {num(RESERVE.certificateCostEur2026, 0)} (2026 prices).
            </li>
            <li>
              <strong>VAT and tax:</strong> the contract’s VAT is tracked by source; penalties, the security kept and
              written-off claims reduce taxable profit — an assumption the calculator can switch off.
            </li>
          </ul>
          <h3>The loan</h3>
          <p>
            The lender splits the cash available for debt service into the contract’s share and the trading share. Each
            instalment may not exceed the contract’s cash divided by {num(FINANCE.targetDscrContracted, 2)} plus the trading
            cash divided by {num(FINANCE.targetDscrMerchant, 2)}, on the lender’s low case — without a second contract and
            with activation energy at day-ahead prices. The security is equity and does not count towards the debt share.
            With the default award the loan is {meur(ak.debtEur?.value ?? null, 1)} and the investor IRR{" "}
            {ak.investorIrr?.status === "valid" && ak.investorIrr.value !== null ? pct(ak.investorIrr.value, 1) : "n/a"}, NPV{" "}
            {meur(ak.investorNpv?.value ?? null, 1)}.
          </p>
          <h3>Break-even contract price</h3>
          <p>
            p* is the contract price at which the investor NPV at the hurdle is zero, with the loan sized again at every
            price. Every whole euro from €0 to €{RESERVE.pStarDomain[1]} per MW-hour is calculated; between neighbouring
            prices whose NPVs have opposite signs, bisection narrows the price until the NPV is within €1 and the bracket
            within {RESERVE.pStarBracket}, and every root is checked by a fresh run. The price is then compared with the
            auction cap: {num(RESERVE.auctionCapUah, 2)} UAH per MW-hour for 2027, {eur(pBe.capEur, 2)} at the auction
            month’s rate.
            {pBe.outcome === "found" && pBe.value !== null && (
              <>
                {" "}For the base battery with the default award p* = {eur(pBe.value, 2)}:{" "}
                {pBe.admissibility === "aboveAuctionCap" ? "above the cap, so no bid could win it" : "within the cap"}.
              </>
            )}{" "}
            The search runs on a grid of €1, so another crossing between grid points cannot be ruled out.
          </p>

          <H2 id="results">11. Results</H2>
          <ul>
            <li>
              <strong>Investor IRR and NPV</strong> in euros: share capital paid in against the dividends and capital
              actually transferred, after withholding tax; the NPV at the {pct(inp.equityHurdle, 0)} hurdle on the day of
              financial close is the main measure. An IRR can be valid, ambiguous (several roots), not defined, or not shown
              because the company runs out of cash.
            </li>
            <li>
              <strong>Project IRR and NPV</strong> before financing, with construction VAT and the liquidity reserve; the NPV
              at {pct(inp.projectDiscountRate, 0)}.
            </li>
            <li>
              <strong>Cover ratios:</strong> minimum and average DSCR on the selected path and on the lender’s case; LLCR at
              the start of operation.
            </li>
            <li>
              <strong>LCOS:</strong> the present value of all costs including charging power, the optimiser’s fee and the
              expected war loss, divided by the present value of the energy delivered, at {pct(inp.projectDiscountRate, 0)}.
            </li>
            <li>
              <strong>Cash held in the company</strong> at each year end beyond the reserves.
            </li>
            <li>
              <strong>With a contract:</strong> its lines in 2029 per MW, its share of the cash for debt service, the
              escrow and the liquidity reserve; LCOS counts the energy delivered on command. A case whose contract inputs
              lie outside the model, or which the battery cannot hold, shows its status and no figures.
            </li>
          </ul>

          <H2 id="sensitivity">12. Sensitivity and break-even</H2>
          <p>
            The tornado moves one driver at a time with the loan as signed: spreads ±20%, the realism factor 0.65 / 0.85,
            investment −10% / +11%, the expected war loss 1.6% / 4.0%, the interest rate ±1.5 points, a weaker hryvnia,
            the efficiency nodes, faster wear, own consumption and the tariff on all withdrawal from the start. The
            alternative cases change the battery or the market before investing and size the loan again.
          </p>
          <p>
            With a contract, the tornado adds its own drivers: the price ±20%, activation 0 and 10%, netting 0 and 100%,
            1.5 hours of full activation, a recovery margin of 25%, a peak day three times the average, 0 and 12 failures a
            year, a 720-hour penalty window, other loss of the contract 5% a year, a 2% balancing fee, the fee paid after
            four months, 90% of balancing claims collected, penalties not deductible and a standing load of 0.5%. A setting
            the battery cannot hold is reported as such, not as a number.
          </p>
          <p>
            Break-even is the multiplier k on the spread path at which the investor NPV at the hurdle is zero, with the loan
            fixed: a scan from 0.5 to 3.0 in steps of 0.1, then bisection in the first bracket the library supports.
          </p>

          <H2 id="checks">13. Checks and verification</H2>
          <p>
            Every run checks that the balance sheet balances each month, loan draws equal the loan, cash never turns negative,
            the loan is repaid with no arrears, the debt share holds, and the reserve account is topped up; it reports
            lock-ups, the transfer limit, thin capitalisation, written-off receivables and inputs outside the library. What the
            model does not cover — the tariff method after 2037, the public service surcharges, the final wording of the tax
            deadlines — is marked as such.
          </p>
          <p>
            The library build reproduces six reference values of the optimiser to the hryvnia, among them{" "}
            {num(753228, 0)} UAH per MW for a 2-hour battery in September 2026.
          </p>
          <p>
            A second implementation of this methodology, written separately in Python from the written specification
            without the calculator’s code, was frozen before the two were compared. Across nine cases — the base case, the
            lender’s case, no loan, a three-month delay, insurance, the last 12 months’ prices, four hours, blocked transfers
            at the end and the high path — all 144 comparisons agree within the acceptance tolerances: the status and every
            root of each IRR, the NPVs, the loan, the cover ratios, LCOS, payback, break-even and the cash in the company at
            each year end. The investor’s cash flows agree date by date to within €51.
          </p>
          <p>
            The contract was checked the same way: a separate implementation, written from the specification without the
            calculator’s code, on 54 cases — the default award, the late starts, both strike scenarios, the second
            contract, the cases the model must reject, and the break-even searches. Each difference was traced to its cause
            and corrected on the side that was wrong, in the calculator or in the second implementation, and recorded.
            Every field of every case was then compared, about one million values: the statuses, dates and events exactly, the contract’s own monthly flows to the cent or
            kopiyka, flows read from the revenue library within 0.1%, the loans within €35, the investor NPVs within €69
            and the break-even prices within €0.0001 per MW-hour. With the
            contract on, each run also checks that activation energy balances, the energy stock and its cost close, the
            escrow and the claims settle, VAT reconciles, and the contract and trading cash add up.
          </p>

          <H2 id="limitations">14. Limitations</H2>
          <ul>
            <li>
              Day-ahead trading and, as an option, one special-auction contract for symmetric aFRR: no daily reserve
              auctions, balancing market, FCR, upward-only aFRR or intraday trading (next version).
            </li>
            <li>
              The contract’s activation, netting, balancing prices and peak day are assumptions, not yet calibrated to
              Ukrenergo’s minute data; the 30% failure threshold and the certificate rules are not modelled.
            </li>
            <li>Perfect foresight scaled by one realism factor; the schedule is historical, not a forecast of hourly trades.</li>
            <li>One site; no portfolio effects, no correlation between sites.</li>
            <li>War risk as an expected loss; no dated scenario of a strike.</li>
            <li>
              No early closure: the battery runs its full life even where operation turns loss-making, as after the tariff
              change of 2037 on the low path; the owner does not inject cash, so such a case shows a cash shortfall.
            </li>
            <li>The network tariff after April 2037 and the surcharges from 2030 are assumptions.</li>
            <li>Currency restrictions are kept for the whole life; their end is not assumed.</li>
            <li>Germany and the comparison of the two markets follow in the next version.</li>
            <li>The battery is fictional and the results are illustrative.</li>
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
