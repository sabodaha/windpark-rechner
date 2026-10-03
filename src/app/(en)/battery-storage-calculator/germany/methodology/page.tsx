import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { withDeDuration } from "@/bess/de";
import { buildDeCapex, type DeCapexLine } from "@/bess/de/capex";
import { DE_CASE_NAME, DE_DATA_AS_OF, DE_PUBLISHED, DE_SPEC_REVISION, DE_TOLL_MARKET, DE_UPDATED } from "@/bess/de/data";
import { deEn } from "@/bess/de/messages";
import { effectiveFee, spreadM } from "@/bess/de/operations";
import {
  DE_BASE, DE_CAPEX, DE_CASE, DE_DURATION_PRESETS, DE_ENGINE, DE_FINANCE, DE_GRID, DE_MACRO, DE_REVENUE, DE_SPREAD_PATHS, DE_TAX, DE_TECH, DE_TOLL,
  DE_VARIANTS, idxDE,
} from "@/bess/de/registry";
import { deBase, loadDeLibrary } from "@/bess/de/server";
import type { DeMetric } from "@/bess/de/types";
import { computeDeExtras } from "@/bess/de/view";
import { bessEn } from "@/bess/messages";
import { JsonLd } from "@/components/site/JsonLd";
import { ProseTable as Table } from "@/components/site/ProseTable";
import { corporateLossShare, corporateTaxRate, TAX } from "@/engine/tax";
import { dateLabel, meur, num, pct, ratio } from "@/lib/format";
import { BESS_DE_OG_IMAGE, pageMetadata } from "@/lib/metadata";
import { absoluteUrl, BESS_DE_ID, breadcrumbJsonLd, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";

const TITLE = "How the German battery storage model works";
const DESCRIPTION =
  `Methodology of the Battery Storage Investment Calculator for Germany: a tolling contract for ${pct(DE_BASE.tollShare, 0)} of a ` +
  `fictional ${DE_BASE.powerMW} MW battery and perfect-foresight day-ahead trading for the rest, derived price data, degradation, ` +
  "AgNes grid fees, GmbH taxes, a bank loan sized on two cash buckets, payouts under §30 GmbHG, the break-even toll price and " +
  "the checks — with formulas.";

export const metadata = pageMetadata({
  title: "German battery storage model methodology",
  description: DESCRIPTION,
  path: PATHS.bessDeMethodology,
  type: "article",
  image: BESS_DE_OG_IMAGE,
});

const SECTIONS = [
  ["model", "What the model is"],
  ["calendar", "Calendar"],
  ["prices", "Prices and the revenue library"],
  ["market", "Revenue of the market share"],
  ["toll", "Tolling contract"],
  ["battery", "Battery"],
  ["grid", "Grid and fees"],
  ["costs", "Costs"],
  ["taxes", "Taxes of the GmbH"],
  ["financing", "Financing"],
  ["payouts", "Payouts to the owner"],
  ["results", "Results and break-even"],
  ["sensitivity", "Sensitivity and variants"],
  ["compare", "Germany against Ukraine"],
  ["checks", "Checks and acceptance"],
  ["limitations", "Limitations"],
] as const;

function H2({ id, children }: { id: (typeof SECTIONS)[number][0]; children: ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

const eur = (v: number, d = 0) => `€${num(v, d)}`;
/** Signed euros for bridges and ranges: "−€12,564". */
const seur = (v: number, d = 0) => (v < 0 ? `−€${num(-v, d)}` : eur(v, d));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const [FC_YEAR, FC_MONTH] = DE_CASE.financialClose.split("-").map(Number) as [number, number];
/** "2028-02" → "Feb 2028". */
const monthLabel = (ym: string) => dateLabel(`${ym}-01`).replace(/^\d+\s/, "");
/** Model month of "YYYY-MM": 1 is the month of financial close. */
const modelMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return (y - FC_YEAR) * 12 + (m - FC_MONTH) + 1;
};
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const andList = (xs: string[], word = "and") => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`);
const ha = (v: number) => num(v, Number.isInteger(v) ? 0 : 1);

const STATUS_TEXT: Record<DeMetric["status"], string> = {
  valid: "n/a",
  ambiguous: "several IRRs",
  notDefined: "no IRR",
  unfunded: "not shown: cash runs short",
  notApplicable: "n/a",
};
function metricText(m: { value: number | null; status: DeMetric["status"] } | null | undefined, show: (v: number) => string): string {
  if (!m) return "n/a";
  if (m.status === "valid" && m.value !== null) return show(m.value);
  return STATUS_TEXT[m.status];
}

/** An IRR with all its roots: one value, or every root of an ambiguous one ("−66.7% and 0.5%"). */
function rootsText(m: { value: number | null; status: DeMetric["status"]; roots?: number[] } | null | undefined, show: (v: number) => string): string {
  if (m && m.status === "ambiguous" && m.roots && m.roots.length > 1) return m.roots.map(show).join(" and ");
  return metricText(m, show);
}

const CAPEX_LABEL: Record<DeCapexLine["id"], string> = {
  dc: `Battery blocks: €${DE_BASE.dcBlockPerKwhDc} per kWh DC × ${num(DE_TECH.nameplateFactor, 7)} × hours`,
  pcs: "Power conversion, energy management and medium voltage",
  bop: "Balance of plant and EPC",
  substation: "110 kV substation and line",
  bkz: "Grid connection contribution (BKZ)",
  development: "Development",
  contingency: `Contingency: ${pct(DE_BASE.contingencyShare, 0)} of battery blocks, power conversion, balance of plant and substation`,
};
const AFA_LABEL: Record<DeCapexLine["afa"], string> = {
  battery: `Battery, ${DE_BASE.afaBatteryYears} years`,
  pcs: `Power conversion, ${DE_BASE.afaPcsYears} years`,
  substation: `Substation, ${DE_BASE.afaSubstationYears} years`,
  bkz: `BKZ, ${DE_BASE.afaBkzYears} years`,
  allocated: "Allocated",
};

export default function GermanBessMethodologyPage() {
  const { core, extras, sensitivity, compare } = deBase();
  const k = core.kpis!;
  const inp = core.inputs;
  const cal = core.calendar!;
  const capex = core.capex!;
  const funding = core.funding!;
  const market = core.market!;
  const bridge = core.bridge2029!;
  const lib = loadDeLibrary();
  const man = lib.manifest;
  const gate = (man as unknown as {
    releaseGate?: { annualHours: number; monthlyHours: number; annualFee: number; monthlyFee: number; gateAnnual: number; gateMonthly: number; checks: number };
  }).releaseGate;
  const golden = (man as unknown as { golden?: Record<string, { value: number }> }).golden;
  const P = inp.powerMW;
  const H = inp.durationHours;
  const s = inp.tollShare;
  const debt = k.debtEur?.value ?? null;
  const npv = k.investorNpvEur?.value ?? null;
  const y29 = core.years.find((y) => y.year === 2029)!;

  // prices and the library
  const snap = man.snapshots["DE-2025"];
  const ltm = man.snapshots["DE-LTM-2026-09"];
  const ax = man.axes;
  const fees = ax.importFeeEUR;
  const h2 = ax.usableHours["2"] ?? [];
  const h4 = ax.usableHours["4"] ?? [];
  const nSnapLtm = DE_REVENUE.tb2["DE-2025"] / DE_REVENUE.tb2["DE-LTM-2026-09"];
  const lastPathYear = 2031 as const;
  const feeLow = effectiveFee(DE_BASE, snap.avgPriceEUR, spreadM(DE_BASE, "low", lastPathYear), lastPathYear).fee;
  const feeHigh = effectiveFee(DE_BASE, snap.avgPriceEUR, spreadM(DE_BASE, "high", 2028), 2028).fee;
  const paths = (["reference", "low", "high"] as const).map((id) => [id, DE_SPREAD_PATHS[id]] as const);

  // calendar
  const contractCod = addMonths(DE_CASE.financialClose.slice(0, 7), DE_CASE.constructionMonths);
  const lastSettlement = addMonths(cal.lastOperating, DE_CASE.settlementHorizonMonths);

  // toll
  const toll4 = DE_DURATION_PRESETS[4].tollPrice ?? 0;
  const workingCapital = (s * P * inp.tollPrice) / 12;
  const tollYears = core.years.filter((y) => y.capacityFactorMin !== null);
  const fullFee = tollYears.length > 0 && tollYears.every((y) => (y.capacityFactorMin ?? 0) >= 1 - 1e-9);
  const lastInvoice = cal.tollLast ? addMonths(cal.tollLast, DE_TOLL.paymentLagMonths) : null;

  // investment
  const capex2 = buildDeCapex(DE_BASE);
  const capex4 = buildDeCapex(withDeDuration(DE_BASE, 4));
  const kw = P * 1000;
  const epc = DE_CAPEX.epcSchedule;
  const epcFirstIdx = Math.min(...epc.map(([m]) => m));
  const epcLastIdx = Math.max(...epc.map(([m]) => m));
  const epcFirst = epc.filter(([m]) => m === epcFirstIdx).reduce((a, [, w]) => a + w, 0);
  const epcLast = epc.filter(([m]) => m === epcLastIdx).reduce((a, [, w]) => a + w, 0);
  const epcMid = epc.filter(([m]) => m > epcFirstIdx && m < epcLastIdx);
  const epcMidShare = epcMid.reduce((a, [, w]) => a + w, 0);
  const epcMidFrom = Math.min(...epcMid.map(([m]) => m)) + 1;
  const epcMidTo = Math.max(...epcMid.map(([m]) => m)) + 1;
  const bkzSchedule = andList(DE_GRID.bkzSchedule.map(([m, w]) => `${pct(w, 0)} in month ${m + 1}`));
  /** The guarantee equals the decommissioning estimate on the usable energy at the start of life (2026 prices). */
  const avalAmount = inp.decommissioningPerKwh * P * H * 1000;

  // taxes
  const kstPath = andList([2027, 2028, 2029, 2030, 2031].map((y, i) => `${pct(corporateTaxRate(y), 0)} ${i === 0 ? `until ${y}` : `in ${y}`}`).concat(`${pct(corporateTaxRate(2032), 0)} from 2032`));
  const maxInterest = Number(core.checks.find((c) => c.id === "interestBarrier")?.value ?? 0);
  const roundingBound = 100 * TAX.tradeTaxBaseRate * inp.hebesatz;
  const codMonth = Number(cal.actualCod.split("-")[1]);

  // financing
  const periods = core.periods;
  const firstPay = periods[0]?.date ?? DE_CASE.firstRepayment;
  const lastPay = periods[periods.length - 1]?.date ?? null;
  const lastPrincipal = funding.principalEur.reduce((last, p, i) => (p > 0.01 ? i : last), -1);
  const repaidBy = lastPrincipal >= 0 ? (periods[lastPrincipal]?.date ?? null) : null;
  const emptyDates = lastPrincipal >= 0 ? periods.length - 1 - lastPrincipal : 0;
  const afterToll = lastInvoice ? `${addMonths(lastInvoice, 1)}-01` : null;
  const zeroBudgetAfterToll = afterToll !== null && periods.some((p) => p.date >= afterToll && p.lenderBudgetEur !== null && p.lenderBudgetEur <= 0.01);
  const term30End = `${addMonths(DE_CASE.firstRepayment.slice(0, 7), 6 * 29)}-01`;

  // payouts and results
  const payouts = core.payouts;
  const firstPayout = payouts.find((p) => p.paidEur > 0.005) ?? null;
  const heldByForecast = payouts.filter((p) => p.cappedBy === "liquidityForecast").length;
  const payoutDates = firstPayout ? payouts.filter((p) => p.date >= firstPayout.date).length : payouts.length;
  const paidIn = core.years.reduce((a, y) => a + y.equityEur, 0);
  const paidOut = core.years.reduce((a, y) => a + y.distributionsEur, 0);
  const tStar = extras.tStar;
  const tRoot = tStar?.outcome === "found" ? tStar.value : null;
  const tBracket = tRoot === null ? null : (tStar?.brackets.find((b) => b.root === tRoot) ?? null);
  const grid = DE_ENGINE.tStarGrid;
  const gridPoints = Math.round((grid.to - grid.from) / grid.step) + 1;
  const merchantHurdle = DE_VARIANTS.merchant.equityHurdle;
  const merchantK = computeDeExtras({ ...DE_BASE, ...DE_VARIANTS.merchant }, lib).k;
  const [kLo, kHi] = DE_ENGINE.kDomain;
  const termYears = inp.repaymentCount / 2;

  // sensitivity, comparison, checks
  const S = deEn.sensitivity;
  const outcomeText = (o: { npv: number | null; status?: string } | null) =>
    o === null ? "—" : o.npv === null ? (S.statusShort[o.status ?? ""] ?? "no result") : meur(o.npv, 1);
  const tornadoRows = sensitivity.tornado.bars.map((b) => {
    const d = S.drivers[b.id];
    return [d?.label ?? b.id, d?.low ?? "", d?.high ?? "", outcomeText(b.low), outcomeText(b.high)];
  });
  const variantRows: ReactNode[][] = [
    ["Base case", metricText(k.investorIrr, (v) => pct(v, 1)), meur(npv, 1), pct(inp.equityHurdle, 0), meur(debt, 1)],
    ...sensitivity.variants.map((v) =>
      v.status
        ? [S.variants[v.id] ?? v.id, S.statusShort[v.status] ?? v.status, "—", pct(v.hurdle, 0), "—"]
        : [S.variants[v.id] ?? v.id, metricText(v.investorIrr, (x) => pct(x, 1)), meur(v.investorNpv, 1), pct(v.hurdle, 0), v.debtEur === null ? "no loan" : meur(v.debtEur, 1)],
    ),
  ];
  const loan15 = sensitivity.variants.find((v) => v.id === "loan15");
  const loan15Same =
    !!loan15 && loan15.investorNpv !== null && npv !== null && Math.abs(loan15.investorNpv - npv) < 1 &&
    loan15.debtEur !== null && debt !== null && Math.abs(loan15.debtEur - debt) < 1;
  const C = deEn.compare;
  const compareRows: ReactNode[][] = compare.rows.map((r) => {
    const meta = C.rows[r.id];
    const name = (
      <>
        {meta?.name ?? r.id}
        {meta && (
          <span className="block text-sm text-muted-foreground">
            {meta.revenue}; {meta.financing.toLowerCase()}
          </span>
        )}
      </>
    );
    if (r.status) return [name, S.statusShort[r.status] ?? r.status, "", "", "", "", ""];
    return [
      name,
      metricText(r.investorIrr, (v) => pct(v, 1)),
      meur(r.npvCommonEur, 1),
      `${meur(r.npvMarketEur, 1)} at ${pct(r.marketHurdle, 0)}`,
      r.lcosEurPerMWh === null ? "n/a" : `€${num(r.lcosEurPerMWh, 0)}/MWh`,
      r.revenue2029PerMwEur === null ? "n/a" : eur(r.revenue2029PerMwEur),
      r.gearing === null ? "—" : pct(r.gearing, 0),
    ];
  });
  const checkGroups = (["input", "integrity", "scope"] as const).map((g) => ({ g, checks: core.checks.filter((c) => c.group === g) }));
  const failed = core.checks.filter((c) => c.status === "fail").length;
  const warned = core.checks.filter((c) => c.status === "warn").length;
  const notApplicable = core.checks.filter((c) => c.status === "notApplicable").map((c) => `“${deEn.checks.ids[c.id] ?? c.id}”`);

  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "TechArticle",
            "@id": `${absoluteUrl(PATHS.bessDeMethodology)}#article`,
            headline: TITLE,
            description: DESCRIPTION,
            url: absoluteUrl(PATHS.bessDeMethodology),
            inLanguage: "en",
            author: { "@id": PERSON_ID },
            about: { "@id": BESS_DE_ID },
            datePublished: DE_PUBLISHED,
            dateModified: DE_UPDATED,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: bessEn.meta.breadcrumb, path: PATHS.bess },
            { name: deEn.meta.breadcrumb, path: PATHS.bessDe },
            { name: "Methodology", path: PATHS.bessDeMethodology },
          ]),
        )}
      />
      <div className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 pb-4 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="prose-page min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            <Link href={PATHS.bessDe} className="!text-muted-foreground !no-underline hover:!underline">
              {deEn.meta.title}
            </Link>{" "}
            · Methodology
          </p>
          <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p className="text-lg">
            This page documents what the German calculator computes, in which order and with which formulas (specification
            revision {DE_SPEC_REVISION}). The battery is fictional; every input comes from a public source or is a documented
            assumption — both are listed on the <Link href={PATHS.bessDeSources}>sources page</Link>. Prices run to{" "}
            {dateLabel(DE_DATA_AS_OF)}. The numbers below come from the same engine that runs in the calculator. The Ukrainian
            model has its own <Link href={PATHS.bessMethodology}>methodology</Link>; section 14 sets the two side by side.
          </p>
          <p className="text-sm text-muted-foreground">{deEn.header.disclaimer}</p>

          <h2 id="glance">The base case at a glance</h2>
          <dl>
            <dt>Battery</dt>
            <dd>
              “{DE_CASE_NAME}”: {P} MW / {P * H} MWh of usable AC energy at the start of life ({H} h), one site in Germany,
              connected to the 110 kV distribution grid
            </dd>
            <dt>Revenue</dt>
            <dd>
              A tolling contract for {pct(s, 0)} of the battery’s power and energy, {inp.tollMonths} months at{" "}
              {eur(inp.tollPrice)} per tolled MW a year; day-ahead trading for the rest, and for the whole battery after the toll
            </dd>
            <dt>Timeline</dt>
            <dd>
              Financial close {dateLabel(DE_CASE.financialClose)} → {DE_CASE.constructionMonths} months of construction →
              commercial operation {dateLabel(`${cal.actualCod}-01`)} → {DE_CASE.operatingLifeYears} years of operation, the
              last month {monthLabel(cal.lastOperating)} → {DE_CASE.settlementHorizonMonths} months of settlement → liquidation
              payout {dateLabel(cal.liquidation)}
            </dd>
            <dt>Company</dt>
            <dd>A German GmbH; its only shareholder is a German corporation</dd>
            <dt>Investment</dt>
            <dd>
              {meur(capex.totalEur, 1)} without VAT ({eur(capex.perKw)} per kW of grid connection)
            </dd>
            <dt>Debt</dt>
            <dd>
              A commercial bank’s loan at {pct(inp.interestRate, 2)} fixed, {inp.repaymentCount} half-yearly payments, sized on
              the lender’s case: {meur(debt, 1)} ({pct(k.gearing?.value ?? null, 0)} of the uses of funds without VAT)
            </dd>
            <dt>Result</dt>
            <dd>
              Investor IRR {metricText(k.investorIrr, (v) => pct(v, 1))} in euros; NPV at {pct(inp.equityHurdle, 0)}{" "}
              {meur(npv, 1)}
            </dd>
            <dt>Break-even</dt>
            <dd>
              {tRoot !== null ? (
                <>
                  A toll of {eur(tRoot)} per tolled MW a year, against {eur(DE_TOLL_MARKET.lowEur)}–{eur(DE_TOLL_MARKET.highEur)}{" "}
                  quoted in the market for 2-hour batteries
                </>
              ) : (
                <>No break-even toll price in the searched range (section 12)</>
              )}
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

          <H2 id="model">1. What the model is</H2>
          <p>
            The calculator values one fictional battery in Germany. “{DE_CASE_NAME}” stands for no real place, and no real
            municipality is named. One project company, a GmbH, builds a {P} MW battery with {H} hours of storage, rents{" "}
            {pct(s, 0)} of it to a toll buyer for {inp.tollMonths / 12} years and trades the rest on the day-ahead market. After
            the toll the whole battery trades.
          </p>
          <p>
            It answers one question: what toll fee would the investor need? The answer is the break-even toll price T* — the
            fixed fee per MW a year at which the investor’s NPV at the hurdle rate is zero, with the loan sized again at every
            price (section 12). The first screen shows it next to the tolling offers quoted in the market for 2-hour batteries,{" "}
            {eur(DE_TOLL_MARKET.lowEur)}–{eur(DE_TOLL_MARKET.highEur)} per MW a year — a benchmark, not an offer.
          </p>
          <ul>
            <li>
              <strong>An honest result.</strong> Nothing is tuned to reach a target. The model is a scenario of the day-ahead
              market only: reserves (FCR, aFRR) and the intraday market, which gave German batteries most of their revenue in
              2026, are left out, and the first screen says so. The market share and the years after the toll earn day-ahead
              margins only.
            </li>
            <li>
              <strong>Monthly and dated.</strong> The model runs month by month from financial close to the end of settlement.
              Operating cash moves at month ends; debt service and payouts fall on 1 February and 1 August, at the start of the
              month. IRR and NPV use exact dates with an Actual/365 day count, like XIRR and XNPV, and are discounted to
              financial close.
            </li>
            <li>
              <strong>Euros, real and nominal.</strong> Market prices are in real 2025 euros and most costs in 2026 prices; both
              become nominal with idxDE, the German harmonised index of consumer prices (section 8). The toll fee, the loan, the reserves and the
              investor are in nominal euros.
            </li>
            <li>
              <strong>No raw prices on the site.</strong> The revenue comes from a library computed in advance from published
              day-ahead prices. The site publishes only results derived from them.
            </li>
            <li>
              <strong>Checks, not hidden fixes.</strong> A failed check is shown, never smoothed over; inputs outside the model
              get a status instead of a number (section 15).
            </li>
            <li>
              <strong>Its own parameter set.</strong> The German model shares the optimiser, the price transformation, the wear
              model, the debt sculpting, the IRR and the break-even solver with the Ukrainian one, and nothing else. A parameter
              the German set does not define is an error — not a zero and not a Ukrainian value.
            </li>
          </ul>

          <H2 id="calendar">2. Calendar</H2>
          <Table
            head={["Event", "Date", "Model month"]}
            num={[2]}
            rows={[
              ["Financial close", dateLabel(DE_CASE.financialClose), "1"],
              ["Commercial operation", dateLabel(`${cal.actualCod}-01`), String(modelMonth(cal.actualCod))],
              ...(cal.tollFirst && cal.tollLast
                ? [
                    [
                      `Tolling, ${inp.tollMonths} months`,
                      `${monthLabel(cal.tollFirst)} – ${monthLabel(cal.tollLast)}`,
                      `${modelMonth(cal.tollFirst)}–${modelMonth(cal.tollLast)}`,
                    ],
                  ]
                : []),
              ...(lastInvoice ? [["Last toll invoice paid", `end of ${monthLabel(lastInvoice)}`, String(modelMonth(lastInvoice))]] : []),
              ...(lastPay ? [[`Debt service, ${periods.length} half-yearly payments`, `${dateLabel(firstPay)} – ${dateLabel(lastPay)}`, "—"]] : []),
              ["Augmentation", monthLabel(cal.augmentation), String(modelMonth(cal.augmentation))],
              ["Overhaul of the power conversion system", monthLabel(cal.pcsOverhaul), String(modelMonth(cal.pcsOverhaul))],
              ["Last month of operation", monthLabel(cal.lastOperating), String(modelMonth(cal.lastOperating))],
              [
                "Settlement",
                `${monthLabel(addMonths(cal.lastOperating, 1))} – ${monthLabel(lastSettlement)}`,
                `${modelMonth(cal.lastOperating) + 1}–${modelMonth(lastSettlement)}`,
              ],
              ["Liquidation payout, outside the monthly book", dateLabel(cal.liquidation), "—"],
            ]}
          />
          <ul>
            <li>
              Construction takes {DE_CASE.constructionMonths} months and follows the contract dates. The loan draws, fees and
              reserves are tied to the contract start of operation, {dateLabel(`${contractCod}-01`)}.
            </li>
            <li>
              <strong>A delay</strong> of commercial operation (an input of 0 to 24 months) moves operation, wear, tax
              depreciation, the toll, augmentation, the overhaul, the end of life, settlement and the liquidation payout by the
              same number of months. Construction, the loan draws and the debt payment dates stay where they are. The toll runs
              from the actual start of operation — an assumption; termination of the contract and a long-stop date are outside
              the model, and so are the extra costs of a delay.
            </li>
            <li>
              A delay is a stress after financial close: the loan stays the one sized on the contract dates, and the late
              battery has to service it. Sized afresh on its own lender’s case, a late battery would get a smaller loan, or
              none — the first payment date stays {dateLabel(firstPay)}, and a half-year without operating cash cannot carry
              interest. The calculator therefore sizes the loan without the delay and runs the delay on it, for the
              break-even toll price and the alternative cases too.
            </li>
            <li>
              A start after {dateLabel(DE_CASE.grandfatheringDeadline)} ends the grid-fee exemption scenario (section 7).
            </li>
          </ul>

          <H2 id="prices">3. Prices and the revenue library</H2>
          <p>
            The battery trades on the day-ahead prices of the German–Luxembourg bidding zone, published by the
            Bundesnetzagentur on SMARD.de and served by Energy-Charts (Fraunhofer ISE) under CC BY 4.0. There are two price
            years: {dateLabel(snap.from)} to {dateLabel(snap.to)}, the anchor, and the 12 months from {dateLabel(ltm.from)} to{" "}
            {dateLabel(ltm.to)}, a sensitivity. Their average prices are {eur(snap.avgPriceEUR, 2)} and{" "}
            {eur(ltm.avgPriceEUR, 2)} per MWh.
          </p>
          <p>
            <strong>Hourly comparable prices.</strong> Since 1 October 2025 the day-ahead market trades quarter-hours. The model
            averages the four quarter-hours of each hour (by UTC) to one hourly price, so both price years compare. Days run in
            German local time and so have 23, 24 or 25 hours. The cost of this choice is disclosed: in January–September 2026
            quarter-hour prices gave a 4.8% larger daily spread than their hourly averages.
          </p>
          <h3>The revenue library</h3>
          <p>
            For every day of a price year, an optimiser finds the best charge and discharge schedule with perfect foresight — a
            mixed-integer program per day and per MW, the same as in the Ukrainian model:
          </p>
          <pre>{`maximise   Σ_t  p[t]·d[t] − p[t]·c[t] − fee·c[t]
subject to x[t+1] = x[t] + RTE·c[t] − d[t]        all losses on charging, own consumption inside RTE
           0 ≤ c[t] ≤ P·u[t],  0 ≤ d[t] ≤ P·(1 − u[t])   no charging and discharging at once
           0 ≤ x[t] ≤ usable hours · P;  x = 0 at the start and the end of each day
           Σ_t d[t] ≤ cycle limit · duration · P`}</pre>
          <p>
            Availability is applied later, in the engine. Ties are broken towards less discharge, so the battery does not wear
            itself out for nothing. The library holds monthly sums of sales, purchases, energy bought and energy sold, plus the
            peak purchases of a day — {man.doublesPerNode} numbers each — for {num(man.nodes, 0)} combinations: two price years,
            durations of {andList(ax.durationHoursBoL.map((d) => String(d)))} hours, usable energy on a grid of{" "}
            {num((h2[1] ?? 0) - (h2[0] ?? 0), 1)} hour as the battery fades ({num(h2[0] ?? 0, 1)}–{num(h2[h2.length - 1] ?? 0, 1)} hours for 2 hours,{" "}
            {num(h4[0] ?? 0, 1)}–{num(h4[h4.length - 1] ?? 0, 1)} hours for 4 hours), efficiency nodes of{" "}
            {andList(ax.rte.map((v) => num(v * 100, 0)))}%, cycle limits of {andList(ax.cycleCap.map((v) => num(v, 1)))} a day,
            and an effective fee per MWh bought from {seur(fees[0] ?? 0)} to {seur(fees[fees.length - 1] ?? 0)} in steps of{" "}
            {eur((fees[1] ?? 0) - (fees[0] ?? 0))} (section 4).
          </p>
          <p>
            The calculator interpolates linearly between usable-energy nodes. Between fee nodes it takes, month by month, the
            better of the two neighbouring schedules: the one with more sales − purchases − fee × energy bought at the actual
            fee. The lender’s case reads the usable-energy node at or below the battery’s state instead of interpolating. Nothing
            is extrapolated: an input outside the grid is reported, not clamped.
          </p>
          {gate && (
            <p>
              Before release, every midpoint between nodes is solved exactly and compared with the interpolation — the midpoints
              of the usable-energy axis at fees of {seur(fees[0] ?? 0)}, €10 and {eur(fees[fees.length - 1] ?? 0)}, and the
              midpoints of the fee axis at full energy, for every duration, cycle limit, efficiency node and price year (
              {num(gate.checks, 0)} checks). The largest error is {pct(gate.annualHours, 2)} of a year’s value along the
              usable-energy axis and {pct(gate.annualFee, 2)} along the fee axis ({pct(gate.monthlyHours, 2)} and{" "}
              {pct(gate.monthlyFee, 2)} for a single month), within the release limits of {pct(gate.gateAnnual, 1)} for a year and{" "}
              {pct(gate.gateMonthly, 1)} for a month. A month’s error is measured against the largest of its exact value, 5% of the average
              month and €1.
            </p>
          )}
          {golden?.["1"] && golden["2"] && golden["4"] && (
            <p>
              The build also reproduces the optimiser’s reference values for German 2025 prices — {eur(golden["1"].value)},{" "}
              {eur(golden["2"].value)} and {eur(golden["4"].value)} per MW a year for 1, 2 and 4 hours, at 90% efficiency and at
              most one cycle a day — which independent implementations had computed before.
            </p>
          )}

          <H2 id="market">4. Revenue of the market share</H2>
          <p>
            While the toll runs the owner trades {pct(1 - s, 0)} of the battery’s power and energy; afterwards all of it.
            Future prices are the historical ones with their spreads scaled around a level that is held:
          </p>
          <pre>{`p_future(y) = L(y) + M(y) · (p_hist − L̄)          real 2025 euros
L(y)        = L̄                                    the price year’s average, held
M(y)        = k · m(y) · n_snap`}</pre>
          <ul>
            <li>
              L̄ is the average hourly price of the price year. The model takes no view on future price levels — an assumption.
              The 12 months to September 2026 are not deflated, so with them the model trades synthetic 2025 prices.
            </li>
            <li>
              n_snap brings the later price year to the 2025 spread: 1 for 2025; for the 12 months to September 2026 the ratio of
              the two years’ TB2 — the yearly sum, per MW, of each day’s spread between its two dearest and two cheapest hours:{" "}
              {eur(DE_REVENUE.tb2["DE-2025"], 2)} / {eur(DE_REVENUE.tb2["DE-LTM-2026-09"], 2)} = {num(nSnapLtm, 7)}.
            </li>
            <li>
              k scales the spreads of every year on top of the path: {num(DE_BASE.spreadMultiplierK, 0)} in the base case; the
              tornado moves it by {S.drivers.spread?.low ?? ""} / {S.drivers.spread?.high ?? ""}, and the break-even search
              without a toll solves for it (section 12).
            </li>
            <li>m(y) follows one of three spread paths:</li>
          </ul>
          <Table
            head={["Path", "2028", "2029", "2030", "2031 on"]}
            num={[1, 2, 3, 4]}
            rows={paths.map(([id, p]) => [deEn.options.path?.[id] ?? id, num(p[2028], 3), num(p[2029], 3), num(p[2030], 3), num(p[2031], 3)])}
          />
          <p>
            The paths are declared assumptions, not forecasts: no public annual path of day-ahead spreads exists. The reference
            path holds the 2025 spreads. The low path — the lender’s view — compresses them to {pct(DE_SPREAD_PATHS.low[2031], 0)}{" "}
            by 2031 as more batteries enter the market. The high path starts 2028 at the level of January–September 2026 against
            the same months of 2025 and returns to the 2025 level by 2031. No probabilities are attached. Nominal values
            multiply by idxDE(y): {num(idxDE(2028), 3)} in 2028, {num(idxDE(2043), 3)} in 2043.
          </p>
          <h3>The effective fee</h3>
          <pre>{`a(y)      = L(y) − M(y) · L̄                                     level shift, real 2025 euros
importFee = (1 − RTE) · a(y) / M(y)  +  (1 + RTE) · fExchange / (idxDE(y) · M(y))
S = M · S_hist + a · O        P = M · P_hist + a · I                O, I: energy sold and bought`}</pre>
          <p>
            Scaling the spreads around a held level shifts every price by a. In a day that starts and ends empty the battery
            sells RTE times the energy it buys, so the shift costs (1 − RTE) · a per MWh bought: to the optimiser it is a fee,
            and divided by M it is in the units of the historical prices the library was solved on. The library is read at that
            fee — when it is positive the battery cycles less. The fee only chooses the schedule; the money is the transformed
            sales S and purchases P. The exchange fee fExchange is {num(inp.fExchange, 0)}: it is inside the optimiser’s share
            (an assumption). So importFee = (1 − RTE) · L̄ · (1 − M) / M: {eur(feeLow, 2)} per MWh on the low path from 2031
            (M = {num(DE_SPREAD_PATHS.low[2031], 2)}), zero on the reference path, and {seur(feeHigh, 2)} on the high path in
            2028. There is no floor; a fee outside the library’s axis gives the case a status, not a number.
          </p>
          <h3>From the optimum to cash</h3>
          <pre>{`margin    = (S − P) · idxDE(y) · (1 − s) · availability           nominal euros
captured  = ${num(inp.captureFactor, 2)} · max(margin, 0) + min(margin, 0)
fee       = ${pct(inp.optimiserFeeRate, 0)} · max(captured, 0)
revenue   = captured − fee`}</pre>
          <ul>
            <li>
              The realism factor of {num(inp.captureFactor, 2)} stands for what perfect foresight overstates: bids go in before
              prices are known, and forecasts miss. It is a share of the perfect-foresight value before fees; availability is
              counted separately. No study calibrates it for German day-ahead trading alone; on the continuous intraday market a
              forecast-driven strategy earned 11% less than perfect foresight. The factor and its tornado range of 0.65–0.85
              are assumptions. A loss is never scaled down.
            </li>
            <li>
              The optimiser keeps {pct(inp.optimiserFeeRate, 0)} of the positive captured margin of the market share and nothing
              on the toll share.
            </li>
            <li>
              Availability is {pct(inp.availabilityYear1, 0)} in the first 12 months of operation and {pct(inp.availability, 0)}{" "}
              after. A future month takes the sums of the same calendar month of the price year as they are, without correcting
              for the number of days — an assumption.
            </li>
            <li>
              Exchange trades settle in the same month (an assumption). Trades between energy resellers fall under the reverse
              charge (§13b UStG), so they carry no VAT in cash.
            </li>
          </ul>
          <p>In 2029, the first full year, per MW of grid connection in nominal euros:</p>
          <Table
            head={["2029", "€ per MW"]}
            num={[1]}
            rows={[
              [`${deEn.revenue.sales} (${pct(1 - s, 0)} of the battery)`, seur(bridge.salesEur)],
              [deEn.revenue.purchases, seur(-bridge.purchasesEur)],
              [deEn.revenue.margin, seur(bridge.marginEur)],
              [deEn.revenue.capture, seur(bridge.captureEur)],
              [deEn.revenue.fee, seur(-bridge.optimiserFeeEur)],
              [deEn.revenue.market, seur(bridge.marketEur)],
              [deEn.revenue.toll, seur(bridge.tollEur)],
              [<strong key="total">{deEn.revenue.total}</strong>, <strong key="totalv">{seur(bridge.revenueEur)}</strong>],
            ]}
          />

          <H2 id="toll">5. Tolling contract</H2>
          <p>
            A toll buyer rents a share s of the battery’s power and energy for a fixed fee and trades it at its own risk. Both
            shares are alike: each has the battery’s ratio of energy to power. The base contract: {pct(s, 0)} for{" "}
            {inp.tollMonths} months from the actual start of operation, at {eur(inp.tollPrice)} per tolled MW a year for a
            2-hour battery and {eur(toll4)} for 4 hours — nominal, fixed, without indexation and without VAT. Toll prices on
            this page, T* included, are per tolled MW a year. Tolling deals cover 70–100%
            of a battery. The terms are assumptions: the 2-hour price lies inside the{" "}
            {eur(DE_TOLL_MARKET.lowEur)}–{eur(DE_TOLL_MARKET.highEur)} quoted in the market, no public 4-hour deal exists, and
            no public deal discloses an indexation.
          </p>
          <pre>{`toll fee            = s · P · tollPrice / 12 · availability factor · capacity factor     accrued monthly
availability factor = min(1; availability / ${num(inp.tollAvailabilityGuarantee, 2)})
capacity factor     = min(1; usable energy / contract curve)`}</pre>
          <ul>
            <li>
              Availability at or above the guaranteed {pct(inp.tollAvailabilityGuarantee, 0)} leaves the fee whole, so
              availability is not counted twice.
            </li>
            <li>
              The contract curve is the usable energy the whole battery would keep if it were cycled{" "}
              {num(inp.tollerCyclesPerDay, 1)} times a day of its current usable energy from the actual start of operation, at the
              base availability, without faster wear and with augmentation on schedule. It is computed once, before the case.
              Below the curve the fee falls; the model checks this every month instead of assuming it.
              {fullFee && " In the base case the battery stays at or above the curve and the fee is paid in full in every month."}
            </li>
            <li>
              The toll buyer’s energy wears the battery. It cycles {num(inp.tollerCyclesPerDay, 1)} times a day of the current
              usable energy of its share — a contractual limit that does not change with the market’s cycle limit. The lender’s
              case wears the toll share the same way.
            </li>
          </ul>
          <pre>{`energy delivered = s · usable energy · ${num(inp.tollerCyclesPerDay, 1)} · days · availability      toll buyer
                 + (1 − s) · O · availability                         market share (O from the library)`}</pre>
          <ul>
            <li>
              <strong>Money.</strong> A month’s invoice is paid at the end of the next month; the last one, for{" "}
              {cal.tollLast ? monthLabel(cal.tollLast) : "the last toll month"}, arrives in{" "}
              {lastInvoice ? monthLabel(lastInvoice) : "the month after"}, when the toll no longer runs. The invoice carries{" "}
              {pct(DE_TOLL.vatRate, 0)} VAT, which the buyer pays with it and the owner passes on in the same month: no cash
              effect.
            </li>
            <li>
              <strong>Who pays what.</strong> The buyer pays the charging energy, the exchange fees and the losses of its share.
              The owner pays the AgNes grid fee on the whole connection, maintenance, insurance, the land lease, metering,
              management, the decommissioning guarantee and the charges on own consumption.
            </li>
            <li>
              <strong>Not modelled:</strong> the buyer’s credit risk, efficiency penalties, termination, a floor price and
              indexation.
            </li>
          </ul>

          <H2 id="battery">6. Battery</H2>
          <p>
            The usable AC energy of {P * H} MWh at the start needs {num(DE_TECH.nameplateFactor, 7)} times as much DC nameplate
            capacity — a state-of-charge window of {pct(DE_TECH.socWindow, 0)} and the discharge losses, computed exactly —{" "}
            {num(capex2.nameplateDcMWh, 1)} MWh DC for 2 hours. Round-trip efficiency, from AC to AC with own consumption inside,
            takes one of the library’s nodes — {andList(ax.rte.map((v) => num(v * 100, 0)), "or")}%; the base case takes{" "}
            {pct(inp.rte, 0)}. The market share may
            discharge at most {num(inp.cycleCap, 1)} times the usable energy at the start of life a day (the warranty), or{" "}
            {num(ax.cycleCap[0] ?? 1, 1)} as an option. Availability is {pct(inp.availabilityYear1, 0)} in the first year and{" "}
            {pct(inp.availability, 0)} after.
          </p>
          <p>The battery fades with age and use, after NREL’s BLAST-Lite model for lithium iron phosphate, as in Ukraine:</p>
          <pre>{`state of health = 1 − ${DE_TECH.calendarFade.coefficient} · years^${DE_TECH.calendarFade.exponent} − ${DE_TECH.cycleFade.coefficient.toExponential(2)} · EFC^${DE_TECH.cycleFade.exponent}
EFC             = ${DE_TECH.efcPerAcCycle} · energy delivered / usable energy at the start          per module group
faster wear     = both terms × ${DE_TECH.degradationStressFactor}                                        a sensitivity`}</pre>
          <ul>
            <li>
              Each month’s delivered energy — the market’s and the toll buyer’s — is shared among the module groups in proportion
              to their usable energy. A group below {pct(DE_TECH.minimumOperatingSoH, 0)} state of health is taken out of
              service.
            </li>
            <li>
              Modules are added once, in the {ordinal(DE_TECH.augmentationMonthAfterCod + 1)} month of operation (
              {monthLabel(cal.augmentation)}): {pct(inp.augmentationDcShare, 0)} of the original DC nameplate capacity at{" "}
              {eur(inp.augmentationPrice)} per kWh DC in 2026 prices, indexed. They age on their own curve; the old modules are not
              restored.
            </li>
            <li>
              The power conversion system is overhauled in the {ordinal(DE_TECH.pcsOverhaulMonthAfterCod + 1)} month (
              {monthLabel(cal.pcsOverhaul)}) for {eur(inp.pcsOverhaulPerMw)} per MW in 2026 prices, indexed.
            </li>
            <li>
              Decommissioning costs a net {eur(inp.decommissioningPerKwh)} per kWh of usable energy at the start of life in 2026
              prices, indexed; under the EU Batteries Regulation the producer takes the batteries back. It is paid in the last
              settlement month, without a provision. The battery has no value after its {DE_CASE.operatingLifeYears} years.
            </li>
          </ul>

          <H2 id="grid">7. Grid and fees</H2>
          <ul>
            <li>
              <strong>Grid fees.</strong> None in 2028 under the current law. From 1 January {DE_GRID.agnesStartYear} the model
              charges the capacity fee of AgNes, the Bundesnetzagentur’s draft determination: {eur(inp.agnesFee)} per MW a year
              on the full {P} MW connection, in {DE_GRID.agnesBaseYear} money and indexed with idxDE from{" "}
              {DE_GRID.agnesBaseYear + 1}, in equal monthly parts and not before operation starts — {eur(y29.agnesEur)} in{" "}
              {y29.year}. It does not change the dispatch. AgNes is a draft without a final decision; the tornado tests{" "}
              {S.drivers.agnes?.low ?? "0"} and {S.drivers.agnes?.high ?? ""}.
            </li>
            <li>
              <strong>Grid-fee exemption</strong> (a switch, off in the base case). Under §118(6) EnWG a storage plant keeps its
              exemption from grid fees for {DE_GRID.grandfatheringYears} years from commissioning if it starts by{" "}
              {dateLabel(DE_CASE.grandfatheringDeadline)}. Under the draft it keeps it only if the final investment decision was
              taken before AgNes is announced (planned for 1 January 2027) and binding orders for at least half of the investment
              are proven by 31 March 2027. The model’s financial close does not count as that decision. With the switch on, grid fees are zero for the
              whole life; a start after {dateLabel(DE_CASE.grandfatheringDeadline)} loses it, and a check says so. The dynamic
              grid tariffs planned for 2030–2033 are not modelled.
            </li>
            <li>
              <strong>Grid connection contribution</strong> (Baukostenzuschuss, BKZ): {eur(inp.bkzPerKw)} per kW of withdrawal
              capacity — {meur(inp.bkzPerKw * kw, 2)} for {P} MW — part of the investment, paid {bkzSchedule} of construction. It
              is an assumption within the network operators’ published 2026 prices of €91–163 per kW, until an operator makes an
              offer; the standardisation of contributions from 2027 is not considered.
            </li>
            <li>
              <strong>Electricity tax and levies on storage.</strong> No electricity tax on charging (§5(4) StromStG, when the
              law’s conditions are met). No KWKG, offshore or §19 StromNEV levy on energy stored and fed back (§21 EnFG).
            </li>
            <li>
              <strong>Charges on own consumption:</strong> {eur(inp.auxChargesPerMw)} per MW a year in 2026 prices, indexed — the
              electricity tax, the KWKG, offshore and §19 levies and the grid tariff on the auxiliary power, an estimate. The
              auxiliary energy itself is inside the efficiency.
            </li>
            <li>
              War risk, the hryvnia and the Ukrainian network tariffs and market fees do not apply in Germany.
            </li>
          </ul>

          <H2 id="costs">8. Costs</H2>
          <p>
            The investment is built from lines in 2026 prices, without VAT and without escalation to the purchase date — an
            assumption. Per kW of grid connection:
          </p>
          <Table
            head={["Line", "2 h", "4 h", "Tax depreciation"]}
            num={[1, 2]}
            rows={[
              ...capex2.lines.map((l, i) => [CAPEX_LABEL[l.id], num(l.amount / kw, 2), num((capex4.lines[i]?.amount ?? 0) / kw, 2), AFA_LABEL[l.afa]]),
              ["Total, € per kW", num(capex2.totalEur / kw, 2), num(capex4.totalEur / kw, 2), ""],
              ["Total", meur(capex2.totalEur, 2), meur(capex4.totalEur, 2), ""],
            ]}
          />
          <ul>
            <li>
              Modo Energy’s benchmark for batteries commissioned in 2026 is about €700 per kW for 2 hours and €935 for 4 hours.
              The model is not tuned to it; the tornado tests the investment at {S.drivers.capex?.low ?? ""} and{" "}
              {S.drivers.capex?.high ?? ""}, and the development line, an unverified estimate, at{" "}
              {S.drivers.development?.low ?? ""} and {S.drivers.development?.high ?? ""}.
            </li>
            <li>
              Payments: battery blocks, power conversion, balance of plant, substation and contingency {pct(epcFirst, 0)} in
              month {epcFirstIdx + 1}, {pct(epcMidShare, 0)} in equal parts over months {epcMidFrom}–{epcMidTo} and{" "}
              {pct(epcLast, 0)} in month {epcLastIdx + 1} of construction; development in month 1; the BKZ as in section 7.
            </li>
            <li>
              VAT of {pct(DE_CAPEX.vatRate, 0)} is paid on every investment line, the augmentation and the overhaul, and refunded{" "}
              {DE_CAPEX.vatRefundLagMonths} months later — an assumption, since the law sets no date. VAT on operating costs and
              decommissioning is deducted in the same month: no cash effect.
            </li>
          </ul>
          <p>Operating costs, from the actual start of operation, in 2026 prices indexed with idxDE, in equal monthly parts:</p>
          <ul>
            <li>
              Full-service maintenance {eur(DE_DURATION_PRESETS[2].omPerMw ?? 0)} per MW a year for 2 hours,{" "}
              {eur(DE_DURATION_PRESETS[4].omPerMw ?? 0)} for 4 hours.
            </li>
            <li>
              Property insurance {pct(inp.insuranceRate, 1)} a year of the insured value — battery blocks, power conversion,
              balance of plant, substation and contingency in 2026 prices ({meur(capex2.insuredValue2026, 1)} for 2 hours),
              indexed. Augmentation and the overhaul do not change it.
            </li>
            <li>
              Land lease {eur(inp.landLeasePerHa)} per hectare a year: {ha(DE_DURATION_PRESETS[2].landHa ?? 0)} ha for 2 hours,{" "}
              {ha(DE_DURATION_PRESETS[4].landHa ?? 0)} ha for 4 hours. Metering {eur(inp.meteringPerPoint)} a year for{" "}
              {DE_CAPEX.meteringPoints === 1 ? "one metering point" : `${DE_CAPEX.meteringPoints} metering points`}. Company
              management, accounting and audit {eur(inp.spvAdmin)} a year.
            </li>
            <li>
              A bank guarantee for decommissioning (Aval) at {pct(inp.avalFeeRate, 2)} a year of its amount, which equals the
              decommissioning estimate — {meur(avalAmount, 1)} in 2026 prices for 2 hours.
            </li>
            <li>The charges on own consumption and, from {DE_GRID.agnesStartYear}, the AgNes fee (section 7); the optimiser’s fee (section 4).</li>
            <li>
              Land lease and company costs during construction are part of the development line — an assumption. In{" "}
              {y29.year} the operating costs other than the optimiser’s fee come to {eur(y29.opexEur / P)} per MW.
            </li>
          </ul>
          <p>
            idxDE is German HICP inflation: {pct(DE_MACRO.hicp[2026] ?? 0, 1)} in 2026, {pct(DE_MACRO.hicp[2027] ?? 0, 1)} in
            2027 and {pct(DE_MACRO.hicp[2028] ?? 0, 1)} in 2028, as the Bundesbank projected in June 2026, then{" "}
            {pct(DE_MACRO.hicpAfter, 1)} a year — an extrapolation, not a forecast.
          </p>

          <H2 id="taxes">9. Taxes of the GmbH</H2>
          <p>
            One set of books: the accounts are the tax base — an assumption. The tax year is the calendar year from {FC_YEAR}.
            All sites and the seat are in one municipality, so the trade tax is not split between municipalities.
          </p>
          <pre>{`EBT          = EBITDA − tax depreciation − interest − decommissioning          accruals
add-back     = ${pct(TAX.addBackShare, 0)} · max(0; interest + ${pct(TAX.immovableLeaseShare, 0)} · land lease − €${num(TAX.addBackAllowance, 0)})   §8 Nr. 1 GewStG
trade income = EBT + add-back − trade-tax losses used
trade tax    = trade income · ${pct(TAX.tradeTaxBaseRate, 1)} · Hebesatz                           Hebesatz ${pct(inp.hebesatz, 0)}
corporate    = (EBT − corporate-tax losses used) · rate(y)
solidarity   = ${pct(TAX.soli, 1)} · corporate`}</pre>
          <ul>
            <li>
              The corporate income tax rate falls under §23 KStG: {kstPath}. The Hebesatz of {pct(inp.hebesatz, 0)} is an
              assumption for the fictional municipality; the legal minimum is {pct(TAX.minHebesatzFrom2027, 0)} from 2027. There
              are no movable leases to add back.
            </li>
            <li>
              Losses sit in separate pools. Corporate income tax: up to {meur(TAX.lossOffsetFull, 0)} of a year’s profit is
              offset in full, above that {pct(corporateLossShare(2027), 0)} until 2027 and {pct(corporateLossShare(2028), 0)} from
              2028 (§10d(2) EStG). Trade tax: {meur(TAX.lossOffsetFull, 0)} in full, above that{" "}
              {pct(TAX.tradeTaxLossShare, 0)} (§10a GewStG). Losses are not carried back — an assumption; a loss in the final
              year is lost.
            </li>
            <li>
              Interest barrier: the exemption of §4h(2) a) EStG holds only while the year’s net interest is below{" "}
              {meur(DE_TAX.interestBarrierThreshold, 0)}. At {meur(DE_TAX.interestBarrierThreshold, 0)} or more a check marks the
              tax as incomplete. The base case’s largest year has {meur(maxInterest, 1)}.
            </li>
            <li>
              No rounding: §11(1) GewStG rounds the trade income down to whole €100, the model does not. Rounding would move the
              tax by less than {eur(roundingBound)} a year at a Hebesatz of {pct(inp.hebesatz, 0)}, but it makes tax a step
              function of the loan and the toll price: the debt sizing could not converge to a cent, and a break-even price with
              an NPV within €1 of zero might not exist.
            </li>
          </ul>
          <h3>Tax depreciation (AfA)</h3>
          <Table
            head={["Class", "Life", "What it holds"]}
            num={[1]}
            rows={[
              [
                "Battery",
                `${inp.afaBatteryYears} years`,
                `Battery blocks and augmentation, after the energy-industry depreciation table; the general table gives ${S.drivers.afaBattery?.high ?? ""}, a contested alternative and a switch.`,
              ],
              ["Power conversion", `${inp.afaPcsYears} years`, "Power conversion, energy management, medium voltage and the overhaul; the energy-industry table for converters (19 in the general table)."],
              ["Substation and line", `${inp.afaSubstationYears} years`, "The 110 kV substation and line — an assumption."],
              ["BKZ", `${inp.afaBkzYears} years`, "The grid connection contribution, a right of use whose classification is not settled — an assumption."],
            ]}
          />
          <ul>
            <li>
              Balance of plant, contingency, development, interest during construction and the bank’s fees are allocated to the
              battery, power conversion and substation classes in proportion to their direct cost; the BKZ gets no share — an
              assumption.
            </li>
            <li>
              Straight line, month by month from the month operation starts — {13 - codMonth} twelfths of a year in{" "}
              {cal.actualCod.slice(0, 4)}; augmentation and the overhaul from their own month over their class’s life. What
              remains in every class is written off in the last month of operation, {monthLabel(cal.lastOperating)}.
            </li>
            <li>
              No declining-balance depreciation: §7(2) EStG allows it for assets acquired or completed between{" "}
              {dateLabel(TAX.degressiveWindowStart)} and {dateLabel(TAX.degressiveWindowEnd)}; for a battery that starts
              operating in {cal.actualCod.slice(0, 4)}, acquisition or completion inside that window is not shown.
            </li>
          </ul>
          <h3>When tax is paid</h3>
          <ul>
            <li>
              The year’s tax is an expense in December and a liability until paid. Prepayments are a quarter of the year’s tax
              each, with perfect foresight and no true-up — an assumption: corporate tax and solidarity surcharge in{" "}
              {andList(DE_TAX.kstPrepaymentMonths.map((m) => MONTHS[m - 1] ?? ""))} (due on the 10th), trade tax in{" "}
              {andList(DE_TAX.gewPrepaymentMonths.map((m) => MONTHS[m - 1] ?? ""))} (due on the 15th). The cash leaves at the end
              of those months, like all operating cash. A year without tax has no prepayments and no refunds.
            </li>
            <li>
              The final tax year — the year of the last settlement month, {lastSettlement.slice(0, 4)} in the base case — is
              recognised and paid in full in that month, without prepayments.
            </li>
            <li>
              For the project IRR the tax is computed again without interest, fees and capitalised interest, not taken from the
              case with a loan.
            </li>
            <li>The shareholder’s taxes are outside the model: it is a German corporation (§8b KStG).</li>
          </ul>

          <H2 id="financing">10. Financing</H2>
          <h3>Sources and uses</h3>
          <pre>{`uses    = investment + its VAT + interest during construction + arrangement fee + commitment fee
        + initial debt service reserve + liquidity reserve + working capital at the start of operation
sources = equity + loan draws + VAT refunds up to the contract start of operation`}</pre>
          <ul>
            <li>
              Equity is drawn first, then the loan. The owner pays in {eur(inp.stammkapital)} of share capital (Stammkapital) in
              the first month and the rest as capital reserve.
            </li>
            <li>
              Working capital is one month’s toll fee, s · P · tollPrice / 12 = {eur(workingCapital)}, kept as free cash: the
              first invoice is paid a month late while costs and tax prepayments already run — an assumption.
            </li>
            <li>The uses of funds without VAT come to {meur(capex.usesExVatEur, 1)} in the base case.</li>
          </ul>
          <h3>The loan</h3>
          <ul>
            <li>
              A commercial bank’s senior loan in euros, without recourse: {pct(inp.interestRate, 2)} fixed all-in — a 10-year
              swap rate of about 3.6% plus a margin of 2.00%, an assumption — on a 30/360 basis. {inp.repaymentCount} half-yearly
              payments from {dateLabel(firstPay)} to {lastPay ? dateLabel(lastPay) : "maturity"}; a variant has 30, to{" "}
              {dateLabel(term30End)}.
            </li>
            <li>
              Interest during construction accrues at the loan rate on the drawn balance at the start of each month and is
              capitalised. Interest from the contract start of operation to {dateLabel(firstPay)} is paid in cash on that date.
            </li>
            <li>
              An arrangement fee of {pct(inp.upfrontFee, 1)} of the loan at financial close and a commitment fee of{" "}
              {pct(inp.commitmentFee, 1)} a year on the undrawn amount until the contract start of operation.
            </li>
          </ul>
          <h3>Sizing on two buckets</h3>
          <p>
            The bank sizes the loan on its own case: the low spread path, the lower node of the library’s usable-energy axis, the
            toll as signed with the buyer cycling {num(inp.tollerCyclesPerDay, 1)} times a day, and the base values for
            everything else. It splits the cash available for debt service (CFADS) of each half-year j into a contracted and a
            market bucket:
          </p>
          <pre>{`C_j = Σ months of j [ toll receipts − s · shared costs − w_C(y) · taxes paid ]       contracted
M_j = CFADS_j − C_j                                                                  market
B_j = max(0; max(C_j, 0) / ${num(inp.targetDscrContracted, 2)} + max(M_j, 0) / ${num(inp.targetDscrMerchant, 1)} − max(−C_j, 0) − max(−M_j, 0))      budget
shared costs = maintenance + insurance + lease + metering + management + guarantee + own-consumption charges + AgNes
w_C(y)   = max(EBITDA_C; 0) / (max(EBITDA_C; 0) + max(EBITDA_M; 0))
EBITDA_C = toll fee accrued − s · shared costs;    EBITDA_M = EBITDA − EBITDA_C`}</pre>
          <ul>
            <li>
              CFADS is the company’s operating cash after tax and after the planned lifecycle costs, before debt service; interest
              is not deducted. Lifecycle costs and the market’s purchases sit in bucket M. The toll is covered{" "}
              {num(inp.targetDscrContracted, 2)} times, the market {num(inp.targetDscrMerchant, 1)} times, and a negative bucket is
              subtracted in full. A check confirms C + M = CFADS in every month and period.
            </li>
            <li>
              Taxes are split by the year’s weight w_C; when both EBITDA parts are zero or less, w_C is the share of toll months
              in the year times s — an assumption. After the toll ends, bucket C keeps the last invoice and the toll’s share of
              that year’s taxes; from the next year it is zero.
            </li>
            <li>
              Repayments are sculpted to the budgets. Going back from maturity, the balance a period carries is capped so that the
              period’s budget covers its interest — the balance never rises — and the loan is the largest opening balance the
              budgets repay. It is at most {pct(inp.maxGearing, 0)} of the uses without VAT; if that cap binds, the profile is
              scaled down.
            </li>
            <li>
              The loan changes interest, fees, reserves and tax, so the sizing iterates — damped by{" "}
              {pct(DE_FINANCE.sizingDamping, 0)}, up to {DE_FINANCE.sizingMaxIterations} steps — until the loan and its first
              payment move by less than {eur(DE_FINANCE.sizingTolerance, 2)}. The undamped solution is then locked.
            </li>
          </ul>
          <p>
            In the base case the loan is {meur(debt, 1)}, {pct(k.gearing?.value ?? null, 0)} of the uses without VAT. The lowest
            cover is {ratio(k.dscrMin?.value ?? null)} on the base case and {ratio(k.lenderDscrMin?.value ?? null)} on the
            lender’s case; the LLCR is {ratio(k.llcr?.value ?? null)}.
            {repaidBy && lastPay && repaidBy < lastPay && zeroBudgetAfterToll && (
              <>
                {" "}After the toll the lender’s case has half-years with no budget at all, and a balance cannot run into a
                half-year that cannot pay its interest. The loan is therefore repaid by {dateLabel(repaidBy)}, and the last{" "}
                {emptyDates} payment dates carry nothing.
              </>
            )}
          </p>
          <h3>Reserves</h3>
          <ul>
            <li>
              The debt service reserve account is funded at the contract start of operation with the amount of the first
              payment, {meur(funding.dsraInitialEur, 2)} in the base case. After each payment it holds the next contractual payment: a
              surplus is released, a shortfall topped up from free cash. It is released with the last payment. Euros, no
              interest.
            </li>
            <li>
              The exchange’s collateral and the daily liquidity of trading are covered by a liquidity reserve of{" "}
              {inp.liquidityReserveDays} days of the dearest purchases — an assumption, with the formula of the Ukrainian model
              without its currency and guarantee terms:
            </li>
          </ul>
          <pre>{`liquidity reserve = ${inp.liquidityReserveDays} · [M · peak day purchases + max(0; a) · I_max] · idxDE · (1 − s)
I_max             = cycle limit · duration · P / RTE                 the largest daily purchase of energy`}</pre>
          <p>
            Peak day purchases are the largest daily purchases of the whole battery in the library at full energy and zero fee,
            in real 2025 euros: {eur(market.peakDayPurchasesEur)} for {P} MW; I_max is {num(market.iMaxMWh, 1)} MWh. The reserve
            is funded at the contract start of operation with the values of {contractCod.slice(0, 4)} and s = {pct(s, 0)} —{" "}
            {eur(market.liquidityTargetCodEur)}{" "}
            in the base case, as only {pct(1 - s, 0)} of the battery trades. In the first month after the toll it is topped up to
            the same formula with that month’s values and s = 0
            {market.liquidityTargetPostTollEur !== null && <> — {eur(market.liquidityTargetPostTollEur)}</>} — from free cash,
            and nothing is paid out until it is full. It is released in the last settlement month.
          </p>
          <h3>Debt service and covenants</h3>
          <ul>
            <li>
              Debt service falls on 1 February and 1 August and is paid from cash first, then from the reserve account. An
              unpaid amount is capitalised, carries interest at the loan rate and is paid first; nothing is paid out while it is
              owed, and there is no acceleration.
            </li>
            <li>
              Cover (DSCR) is the cash available for debt service over the six months to a payment divided by the contractual
              payment — interest on the scheduled balance plus the scheduled principal. Interest on the actual balance is booked
              separately.
            </li>
            <li>
              Payouts need two full periods, a first payout not before {dateLabel(DE_CASE.firstDistributionWithDebt)}, a cover of
              at least {ratio(inp.lockupDscr)} in the last two periods, a full reserve account and no arrears. Below{" "}
              {ratio(inp.defaultDscr)} the loan is in default: a red check, without acceleration.
            </li>
          </ul>
          <h3>The loan as signed</h3>
          <p>
            Stresses and the tornado keep the loan sized for the case at financial close. Fixed: the amount, the scheduled
            principal on each date and with it the scheduled balance, the initial debt service reserve actually funded, and the
            liquidity reserve at the start of operation. Computed again in every run: the contractual interest and payments at
            the case’s own rate — the rate stress of {S.drivers.rate?.low ?? ""} / {S.drivers.rate?.high ?? ""} changes them —,
            the reserve targets after each payment, the monthly
            draws (equity first: when the investment rises, the draws move but the loan stays), interest during construction,
            the commitment fee, the arrangement fee ({pct(inp.upfrontFee, 1)} of the same loan), working capital from the case’s
            toll price, and the uses of funds. If the funded initial reserve is below the case’s first contractual payment, the
            difference is topped up from free cash in the month operation starts; if it is above, the excess returns to cash on
            the first payment date.
          </p>

          <H2 id="payouts">11. Payouts to the owner</H2>
          <p>
            Payouts fall on 1 February and 1 August, after debt service and the reserve account, under the conditions of section
            10 while the loan runs. Without a loan, and once it is repaid, they need none of them; without a loan they start on{" "}
            {dateLabel(DE_CASE.firstDistributionDate)}. Each payout is the smaller of two limits:
          </p>
          <pre>{`payout_t        = min( max(0; free cash at the start of the month − H_t);
                       max(0; book net assets_t − share capital) )
book net assets = share capital + capital reserve paid in + Σ net income − Σ payouts      closed months
H_t             = max(0; max over τ from t to the last settlement month of −Σ_{j=t..τ} f_j)
f_j             = CFADS_j − planned reserve top-up_j − [j > t] · DSRA target_j`}</pre>
          <ul>
            <li>
              <strong>Capital maintenance.</strong> A payout never takes the company’s net assets below its share capital (§30
              GmbHG). It reduces the capital reserve first, then retained earnings — an assumption. Book net assets count closed
              months; the year’s tax enters in December.
            </li>
            <li>
              <strong>The liquidity forecast H_t</strong> keeps the cash the company’s plan still needs. It is the smallest balance
              that keeps the planned cash at or above zero in every month to the last settlement month if nothing more is paid
              out. It counts the monthly CFADS — operations after tax, with augmentation, the overhaul, their VAT and its refund,
              and decommissioning —, the planned top-up of the liquidity reserve after the toll, and at each later payment date
              the reserve target after it — with a full reserve account, that is what the payment and the top-up of the reserve
              take from cash. Releases of reserves at the end are not counted.
            </li>
            <li>
              <strong>Why.</strong> §15b(5) InsO prohibits payments to shareholders that must lead to insolvency, where the
              managing directors could have recognised this with due care. The law prescribes neither this formula nor a horizon:
              the forecast to the end of the case is an assumption of the model, and a monthly forecast is a convention, not a
              legal assessment of solvency. The lifecycle costs are planned from the first day, so the company keeps cash for
              them; the 24-month horizon of §18(2) InsO concerns imminent insolvency. Without the forecast, payouts on 1 February
              took the cash that augmentation, the overhaul and decommissioning needed months later; horizons of 6, 12 and 24
              months still left cases short of cash.
            </li>
            <li>
              <strong>Liquidation.</strong> After settlement, all remaining cash — after taxes and decommissioning — is paid out on{" "}
              {dateLabel(cal.liquidation)}, a year after the liquidation starts (Sperrjahr, §73 GmbHG): a dated cash flow of the
              investor outside the monthly book. With a delay it moves to the last day of the month twelve months after the last
              settlement month.
            </li>
            <li>
              <strong>If obligations remain.</strong> In the last month, released reserves and cash first repay the loan and
              interest. Whatever remains — debt, interest or negative cash — stays in the book as it is: no money is created and
              no debt written off. A case is settled only if at the end there is no debt, no interest and no cash below −€0.01;
              otherwise the liquidation payout is zero. The investor IRR is then not shown, and neither when cash falls below
              −€0.01 in any month; the NPV stays, marked.
            </li>
          </ul>
          <p>
            In the base case the first payout is on {firstPayout ? dateLabel(firstPayout.date) : "no date"}. On {heldByForecast}{" "}
            of the {payoutDates} payout dates from then on, the forecast holds cash back, ahead of the augmentation in{" "}
            {cal.augmentation.slice(0, 4)}, the overhaul in {cal.pcsOverhaul.slice(0, 4)} and decommissioning in{" "}
            {lastSettlement.slice(0, 4)}. The owner pays in {meur(paidIn, 1)} and
            receives {meur(paidOut, 1)} in payouts plus {eur(core.liquidationPayoutEur ?? 0)} at liquidation.
          </p>

          <H2 id="results">12. Results and break-even</H2>
          <ul>
            <li>
              <strong>Investor IRR and NPV:</strong> capital paid in against the payouts and the liquidation payout. The NPV at the
              hurdle — {pct(DE_BASE.equityHurdle, 0)} with a toll, {pct(merchantHurdle, 0)} without one — discounted to financial
              close is the main measure: it exists even where an IRR does not. An IRR is valid, ambiguous (several roots), not
              defined, or not shown because cash runs short. Base case: {metricText(k.investorIrr, (v) => pct(v, 1))} and{" "}
              {meur(npv, 1)}; the same battery without a loan {core.noDebt ? metricText(core.noDebt.investorIrr, (v) => pct(v, 1)) : "n/a"}.
            </li>
            <li>
              <strong>Project IRR and NPV:</strong> before financing, before and after tax, with the tax computed again without
              interest, with construction VAT and its refunds and the project’s own liquidity reserve; the NPV at{" "}
              {pct(DE_BASE.projectDiscountRate, 0)} with a toll and {pct(DE_VARIANTS.merchant.projectDiscountRate, 0)} without.
              The project’s cash flow ends with decommissioning, an outflow, so it changes sign twice and can have two IRRs.
              The second lies at a deeply negative rate and means nothing economically, but the model reports both roots
              rather than choose one, and the NPV is the measure. Base case:{" "}
              {rootsText(k.projectIrrPreTax, (v) => pct(v, 1))} before tax, {rootsText(k.projectIrrPostTax, (v) => pct(v, 1))}{" "}
              after; NPV {meur(k.projectNpvPostTaxEur?.value ?? null, 1)}.
            </li>
            <li>
              <strong>Cover ratios:</strong> minimum and average DSCR on the case and on the lender’s case, over periods with a
              payment; the LLCR is the monthly CFADS from the start of operation to the last payment date, discounted at the loan
              rate, over the loan.
            </li>
            <li>
              <strong>Debt share:</strong> the loan over the uses of funds without VAT.
            </li>
            <li>
              <strong>LCOS</strong> of the whole battery as if it traded alone on the chosen path, the toll left out: the present
              value of the investment without VAT, augmentation, the overhaul, operating costs, AgNes, the charges on own
              consumption, the optimiser’s fee, charging energy and decommissioning, over the present value of the AC energy
              delivered, at the project rate from financial close. The realism factor is not a cost. Base case:{" "}
              {eur(k.lcosEurPerMWh?.value ?? 0)} per MWh.
            </li>
            <li>
              <strong>Revenue 2029 per MW:</strong> the company’s revenue in the first full year — the toll fee earned plus the
              market revenue after the realism factor and the optimiser’s fee — per MW of grid connection, nominal:{" "}
              {eur(k.revenue2029PerMwEur?.value ?? 0)}.
            </li>
            <li>
              <strong>Payback:</strong> years from financial close until the investor’s cumulative cash flow first turns positive
              {k.paybackYears?.value != null ? <>: {num(k.paybackYears.value, 1)} years in the base case.</> : <>; the base case never gets there.</>}
            </li>
          </ul>
          <h3>The break-even toll price T*</h3>
          <p>
            T* is the toll price at which the investor NPV at the hurdle is zero. Each price is a full case: the lender’s case,
            the loan sized again, taxes and payouts. A price is supported when the run completes and the NPV is defined; it is
            funded when cash never runs short — a supported price with a shortfall keeps its NPV, marked. A price at which the loan
            cannot be sized is not supported.
          </p>
          <ol>
            <li>
              A grid of {gridPoints} prices: {eur(grid.from)}, {eur(grid.from + grid.step)} … {eur(grid.to)} per MW a year.
            </li>
            <li>
              Brackets only between neighbouring supported prices: an unsupported price is never stepped over. A supported price
              with an NPV within €1 of zero is a root.
            </li>
            <li>
              Between neighbours with opposite signs, neither a root, bisection up to {DE_ENGINE.tStarMaxDivisions} times: the
              midpoint replaces the end with the same sign, an NPV of exactly zero counting as positive. It converges when the
              midpoint’s NPV is within €1 of zero and the bracket is at most €1 wide; it stops as stagnated, at an unsupported
              midpoint, or at the cap.
            </li>
            <li>
              Every root is checked by a fresh full run, and rejected if it fails. Every bracket with a change of sign is searched,
              not only the first. Coverage is complete when all {gridPoints} prices are supported.
            </li>
          </ol>
          <Table
            head={["Outcome", "When — the first that applies"]}
            rows={[
              ["Unsupported", "The inputs lie outside the model, or no price is supported"],
              ["Below the range", `${eur(grid.from)} is supported, funded and has an NPV of zero or more`],
              ["Found", "At least one verified root: the smallest is shown, with its funded flag"],
              ["Refinement failed", "No root, and a bracket stagnated, hit the cap, met an unsupported midpoint or failed verification"],
              ["Unresolved", "No root, and some prices are not supported"],
              ["Above the range", `No root, all prices supported, every NPV below zero: above ${eur(grid.to)}`],
              ["Below the range", "No root, all prices supported, every NPV zero or more"],
            ]}
          />
          {tRoot !== null && tStar && (
            <p>
              For the base case T* = {eur(tRoot)} per tolled MW a year,{" "}
              {tStar.coverage === "complete" ? `with complete coverage: all ${gridPoints} prices are supported` : "with partial coverage"}
              {tBracket && (
                <>
                  . The root lies between {eur(tBracket.lo)} and {eur(tBracket.hi)} and took {tBracket.divisions} bisections
                </>
              )}
              . Against the {eur(inp.tollPrice)} in the contract, the investor would need a toll{" "}
              {pct(tRoot / inp.tollPrice - 1, 0)} higher.
            </p>
          )}
          <h3>Without a toll: the break-even spread multiplier k</h3>
          <p>
            The day-ahead-only case has no loan and a hurdle of {pct(merchantHurdle, 0)}. Its break-even is the multiplier k on
            the spread path at which the investor NPV is zero: points k = {num(kLo, 1)}, {num(kLo + 0.1, 1)} … {num(kHi, 1)}, a
            point outside the library skipped; the first pair of neighbouring supported points whose NPVs have opposite signs or
            touch zero is bisected — at most 40 steps, until the bracket is narrower than 10⁻⁵; a midpoint outside the library
            stops it, and the value is the bracket’s midpoint. Statuses: found; not reached, when the sign never changes; below
            the library, when the first supported point lies above {num(kLo, 1)} and its NPV is already positive; unsupported. Unlike
            T*, unsupported points are stepped over, as in the Ukrainian calculator.
            {merchantK?.status === "found" && merchantK.value !== null && (
              <>
                {" "}For the base battery without a toll, k = {num(merchantK.value, 2)}: spreads would have to be{" "}
                {num(merchantK.value, 2)} times the reference path.
              </>
            )}
          </p>
          <h3>Why the break-even price is above the market</h3>
          <p>Four reasons, named rather than measured:</p>
          <ol>
            <li>
              No reserves (FCR, aFRR) and no intraday trading, which gave German batteries most of their revenue in 2026: the
              market share and the years after the toll trade day-ahead only.
            </li>
            <li>
              A loan that amortises fully over {termYears} years and is sized on the low spread path, instead of the usual 7-year
              mini-perm with 70–80% debt: the base loan is {pct(k.gearing?.value ?? null, 0)} of the uses.
            </li>
            <li>
              Investment of {eur(capex.perKw)} per kW for 2 hours, against about €700 in Modo Energy’s benchmark.
            </li>
            <li>A life of {DE_CASE.operatingLifeYears} years, with no value after it.</li>
          </ol>

          <H2 id="sensitivity">13. Sensitivity and variants</H2>
          <p>
            The tornado moves one driver at a time with the loan as signed (section 10). The measure is the investor NPV at the
            hurdle, which exists in every supported case; the base case’s is {meur(sensitivity.tornado.base.npv, 1)}. Drivers in
            order of their swing:
          </p>
          <Table head={["Driver", "Low setting", "High setting", "NPV, low", "NPV, high"]} num={[3, 4]} rows={tornadoRows} />
          <ul>
            <li>
              Spreads move the multiplier k; the investment moves every line but the BKZ; development moves its line alone.
            </li>
            <li>
              The toll price falls to 110/120 of the base — {eur((inp.tollPrice * 110) / 120)} for 2 hours, the bottom of the
              market quotes, and {eur((toll4 * 110) / 120)} for 4 hours.
            </li>
            <li>
              Faster wear lowers the toll fee through the capacity factor, and an availability of{" "}
              {S.drivers.availability?.high ?? ""} in every year, the first included, through the availability factor.
            </li>
            <li>A setting the model cannot calculate is shown as its status, not as a number.</li>
          </ul>
          <p>
            The variants change the battery or the market before investing, and the loan is sized again. A 4-hour battery brings
            its own maintenance, construction, development, land and toll price ({eur(toll4)}).
          </p>
          <Table head={["Case", "Investor IRR", "NPV at hurdle", "Hurdle", "Loan"]} num={[1, 2, 3, 4]} rows={variantRows} />
          {loan15Same && repaidBy && (
            <p>
              The 15-year loan gives the base case’s result: the lender’s case has no budget after the toll, so the loan is
              repaid by {dateLabel(repaidBy)} with either term (section 10).
            </p>
          )}

          <H2 id="compare">14. Germany against Ukraine</H2>
          <p>
            Fixed rows, without a switch. The battery is the same in all — duration, efficiency, cycle limit, augmentation — and
            so are the physical rules; operation and wear follow each market. Each market keeps its own prices, costs, taxes and
            financing. NPVs are shown at a common {pct(compare.commonRate, 0)} — an assumption, so that the rows compare — and at
            each market’s own hurdle. The Ukrainian rows are described on the{" "}
            <Link href={PATHS.bessMethodology}>Ukrainian methodology page</Link>.
          </p>
          <Table
            head={["Case", "Investor IRR", `NPV at ${pct(compare.commonRate, 0)}`, "NPV at own hurdle", "LCOS", "Revenue 2029 per MW", "Debt share"]}
            num={[1, 2, 3, 4, 5, 6]}
            rows={compareRows}
          />
          <h3>{C.differencesTitle}</h3>
          <dl>
            {C.differences.map(([topic, text]) => (
              <Fragment key={topic}>
                <dt>{topic}</dt>
                <dd>{text}</dd>
              </Fragment>
            ))}
          </dl>
          <p>
            For the base case the comparison is computed in advance. For other inputs the calculator loads the Ukrainian revenue
            library from this site when the comparison tab is opened.
          </p>

          <H2 id="checks">15. Checks and acceptance</H2>
          <p>
            Every run checks itself. The checks fall into three groups, and the case’s status follows the first group that fails:
            inputs outside the model, then a failed calculation, otherwise a result.
          </p>
          {checkGroups.map(({ g, checks }) => (
            <div key={g}>
              <h3>{deEn.checks.groups[g] ?? g}</h3>
              <p>
                {g === "input" && "A failure means the case lies outside the model: no result, a status instead."}
                {g === "integrity" && "Identities that must hold. A failure means the calculation failed its own checks, and no result is shown."}
                {g === "scope" && "Shown with the result, which stays: they mark shortfalls, covenant breaches and the edges of the model."}
              </p>
              <ul>
                {checks.map((c) => (
                  <li key={c.id}>{deEn.checks.ids[c.id] ?? c.id}</li>
                ))}
              </ul>
            </div>
          ))}
          <p>
            {failed === 0 && warned === 0 ? "No check fails or warns in the base case" : `In the base case ${failed} checks fail and ${warned} warn`}
            {notApplicable.length > 0 && (
              <>
                ; {notApplicable.length === 1 ? "one does" : `${notApplicable.length} do`} not apply: {andList(notApplicable)}
              </>
            )}
            . The revenue library’s release test is described in section 3.
          </p>
          <h3>Acceptance</h3>
          <ul>
            <li>
              The specification, the register of values and 33 test cases are frozen together, with a SHA-256 hash of every file.
              The cases are the base case, fourteen variants and eighteen edge cases — among them three built to fail: a
              temporary cash shortfall, a loan left at the end, and a cash deficit at the end. Analytical checks computed by hand
              cover the effective fee, the calendar and the index, the investment and its schedule, a month’s operating costs,
              the toll fee and the contract curve, small tax cases, depreciation, bucket budgets and sculpting, the liquidity
              reserve, the payout rules and the liquidity forecast, and synthetic functions for both break-even solvers.
            </li>
            <li>
              The engine’s outputs for all cases are sealed before any comparison, with only their hash on record. A schema check
              and a semantic checker derive from each output every field that can be derived — the loan schedule, the reserve
              movements, the state at each payout date, monthly depreciation, every root of the break-even search — and a set of
              deliberately corrupted outputs must each be rejected, while a change within tolerance must pass.
            </li>
            <li>
              Release follows the procedure of the Ukrainian calculator: a second implementation is written separately from the
              frozen documents alone — with its own revenue library and without the calculator’s code — and frozen before the two
              are compared. A comparator with full coverage then checks every field of every case by its own rule: statuses
              first, then the loan within 0.1%, IRRs within 0.05 points, cover ratios within 0.01, NPVs within €10,000, LCOS
              within 0.5%, the debt share within 0.001, revenue per MW within 0.1%, payback within a month, k within 0.005, T*
              within €250 per MW a year, monthly ledger lines and a year’s taxes within €0.01. It must find nothing
              when an output is compared with itself, and it must catch deliberate changes.
            </li>
            <li>
              <strong>Result.</strong> The first comparison found five faults in the calculator:
              <ul>
                <li>the peak purchases of a 4-hour battery;</li>
                <li>the contract curve under a lower availability;</li>
                <li>the LCOS of the lender’s case run in full;</li>
                <li>the project’s reserve after the toll;</li>
                <li>the liquidity reserve inside the lender’s case.</li>
              </ul>
              It also found a weakness in the IRR rule. Where a project’s cash flow has a second, deeply negative root, whether
              that root was kept depended on rounding. Each finding was traced to its cause, fixed on the side that was wrong,
              and recorded. The IRR rule now bisects further and checks the residual against the size of the flows.
            </li>
            <li>
              The two revenue libraries agree on the value of every node within €0.004 per MW and month. Their gross purchases
              and sales differ only where a day’s optimum is not unique. Run on the second implementation’s library, the
              calculator reproduced every field of all 33 cases within the frozen tolerances, about 650,000 values, with the
              monthly ledger to the cent. Each on its own library, the two agree as follows:
              <ul>
                <li>investor NPVs within €0.05;</li>
                <li>loans within €0.02;</li>
                <li>every ledger line within €0.12;</li>
                <li>the break-even toll price and spread multiplier to the last digit.</li>
              </ul>
              The project NPVs differ by up to €1,979, inside the €10,000 tolerance. One implementation dates the project’s
              initial reserve on the first day of the first month of operation and the other on its last day. This is
              recorded as an exception.
            </li>
            <li>
              The German modules sit beside the Ukrainian ones and leave its results unchanged: the Ukrainian calculator still reproduces
              its regression to the cent and its contract cases byte for byte.
            </li>
          </ul>

          <H2 id="limitations">16. Limitations</H2>
          <ul>
            <li>
              Day-ahead trading and one tolling contract only: no reserves (FCR, aFRR), no intraday market, no capacity market and
              no inertia services.
            </li>
            <li>
              Perfect foresight scaled by one realism factor; hourly comparable prices; the spread paths are assumptions, not
              forecasts.
            </li>
            <li>
              A simplified toll: a fixed nominal fee with an availability guarantee and a capacity curve — no efficiency
              penalties, no termination, no credit risk of the buyer, no floor and no indexation.
            </li>
            <li>
              A fully amortising loan: no mini-perm, refinancing, KfW programme or subordinated debt, and no loan for the
              day-ahead-only case.
            </li>
            <li>
              AgNes is a draft; the dynamic grid tariffs of 2030–2033 are not estimated; the BKZ is an assumption until a network
              operator’s offer, and its standardisation from 2027 is not considered.
            </li>
            <li>
              Taxes: one municipality, prepayments equal to the year’s tax, no loss carry-back, contested depreciation classes,
              the interest barrier as a check only; no taxes of the shareholder, no tax group (Organschaft) and no GmbH & Co. KG.
            </li>
            <li>The exchange’s collateral and daily liquidity are covered by the liquidity reserve — an assumption.</li>
            <li>The extra costs of a late start are not estimated.</li>
            <li>One site and one company; a 1-hour battery is outside this version and shows a status.</li>
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
