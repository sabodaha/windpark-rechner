"use client";

// The 18 slides of the PDF report (16:9, 1280 × 720 px each). Numbers, charts and titles come from one ReportData;
// the charts are the calculator's own, drawn at a fixed width.
import { P90_Z, SCENARIOS, SOURCES, TENDER_FACTS, TORNADO_DRIVERS, type ScenarioName } from "@/engine";
import { SERIES } from "@/components/charts/core";
import { CurveChart } from "@/components/charts/CurveChart";
import { TornadoChart } from "@/components/charts/TornadoChart";
import { YearChart } from "@/components/charts/YearChart";
import { FIELD_BY_ID, toDisplay, type FieldDef } from "@/lib/fields";
import { ct, dateLabel, eurCompact, keur, meur, num, pct, ratio } from "@/lib/format";
import { absoluteUrl, PATHS, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";
import { irrText, keep, npvText, SLIDE_COUNT, SLIDE_NAMES, statusOf, type ReportData, type SlideId } from "./data";
import { BODY_W, Bridge, Bullets, Gantt, Kpi, Panel, Slide, StatusIcon, Table, type BridgeStep, type Level, type Row, type SlideMeta } from "./parts";

const m = (v: number) => v / 1e6;
const fmtM = (v: number) => `€${num(v, 2)}m`;
const axisM = (v: number) => num(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0);
const SCENARIO_LABEL: Record<ScenarioName, string> = { base: "Base", p90: "P90 1-yr", resource: "P90 10-yr", downside: "Downside" };

export function Report({ d }: { d: ReportData }) {
  const meta = (n: number): SlideMeta => ({ n, total: SLIDE_COUNT, dataAsOf: d.meta.dataAsOf });
  const slides = [
    TitleSlide,
    SummarySlide,
    TimelineSlide,
    AssumptionsSlide,
    EnergySlide,
    EegSlide,
    PricesSlide,
    ConstructionSlide,
    OpexSlide,
    FinancingSlide,
    DscrSlide,
    WaterfallSlide,
    ReturnsSlide,
    ScenariosSlide,
    SensitivitySlide,
    BidSlide,
    RisksSlide,
    MethodologySlide,
  ];
  return (
    <>
      {slides.map((S, i) => (
        <S key={i} d={d} meta={meta(i + 1)} />
      ))}
    </>
  );
}

type SlideProps = { d: ReportData; meta: SlideMeta };
const kicker = (id: SlideId) => SLIDE_NAMES.find(([k]) => k === id)?.[1] ?? id;

// 1 ---------------------------------------------------------------------------------------------

function TitleSlide({ d, meta }: SlideProps) {
  const p = d.inputs.project;
  const k = d.results.base.kpis;
  return (
    <section className="report-slide" aria-labelledby="slide-1">
      <div className="flex h-full flex-col px-14 pt-12">
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px] gap-16">
          <div className="flex flex-col">
            <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-link">Project-finance model · report</p>
            <h1 id="slide-1" className="mt-3 text-[56px] font-semibold leading-[1.05] tracking-[-0.02em]">
              Windpark Musterhöhe
            </h1>
            <p className="mt-3 text-[22px] leading-snug text-foreground/80">
              Fictional onshore wind farm · {p.turbines} × {num(p.turbineMw, 1)} MW = {num(k.capacityMw, 1)} MW · Hesse, Germany
            </p>
            <p
              className={cn(
                "mt-6 w-fit rounded-md px-3 py-1.5 text-[15px] font-medium",
                d.meta.isBase ? "bg-accent text-foreground" : "bg-[#fdf1d6] text-foreground",
              )}
            >
              {d.meta.isBase ? "Base case, as published on the website" : "Custom inputs — not the published base case"}
            </p>
            <dl className="mt-6 grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-[15px]">
              <dt className="text-muted-foreground">Data as of</dt>
              <dd className="tabular">{dateLabel(d.meta.dataAsOf)}</dd>
              <dt className="text-muted-foreground">Engine</dt>
              <dd className="tabular">{d.meta.engine}</dd>
              <dt className="text-muted-foreground">Inputs</dt>
              <dd className="font-mono text-[14px]">{d.meta.inputHash}</dd>
              <dt className="text-muted-foreground">Calculator</dt>
              <dd>
                <a href={absoluteUrl(PATHS.calculator)} className="text-link">
                  {absoluteUrl(PATHS.calculator).replace("https://", "")}
                </a>
              </dd>
            </dl>
            <p className="mt-auto text-[20px] font-medium">{en.footer.author}</p>
            <p className="mt-2 max-w-[640px] rounded-md border border-border bg-muted px-3 py-2 text-[14px] leading-snug">
              {en.header.disclaimer} The results depend on the assumptions shown on slide 4.
            </p>
          </div>
          <nav aria-label="Contents" className="self-start rounded-lg border border-border bg-card px-5 py-4">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Contents</p>
            <ol className="mt-2 grid gap-y-[3px] text-[14px]">
              {SLIDE_NAMES.slice(1).map(([id, name], n) => (
                <li key={id} className="flex gap-3">
                  <span className="w-5 text-right tabular text-muted-foreground">{n + 2}</span>
                  <span>{name}</span>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <FooterOnly meta={meta} />
      </div>
    </section>
  );
}

function FooterOnly({ meta }: { meta: SlideMeta }) {
  return (
    <footer className="mb-5 mt-6 flex items-end justify-between gap-6 border-t border-border pt-2.5 text-[10.5px] leading-snug text-muted-foreground">
      <span>{en.header.disclaimer}</span>
      <span className="shrink-0 tabular">
        Data as of {dateLabel(meta.dataAsOf)} ·{" "}
        <span className="font-semibold text-foreground">
          {meta.n} / {meta.total}
        </span>
      </span>
    </footer>
  );
}

// 2 ---------------------------------------------------------------------------------------------

function SummarySlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const k = b.kpis;
  const i = d.inputs;
  const status = statusOf(b);
  const groups = ["integrity", "funding", "covenant", "inputs", "scope"] as const;
  const notOk = b.checks.filter((c) => !c.ok && c.severity !== "info");
  return (
    <Slide meta={meta} kicker={kicker("summary")} title={d.titles.summary} sources={d.cite("bnetza2608", "kfw270", "windguardCost2025", "ise2024")}>
      <div className="grid h-full grid-cols-[1fr_360px] gap-8">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label={en.kpis.equityIrr.label}
              value={irrText(b)}
              note={`${i.tax.legalForm === "KG" ? "KG, after the company’s taxes" : "GmbH, after all company taxes"}; cost of equity ${pct(i.macro.costOfEquity, 0)}`}
            />
            <Kpi
              label={en.kpis.projectIrr.label}
              value={pct(k.projectIrrPostTax, 1)}
              note={`Unlevered, after tax (pre-tax ${pct(k.projectIrrPreTax, 1)})`}
            />
            <Kpi label={en.kpis.npv.label} value={npvText(b)} note={`At ${pct(i.macro.costOfEquity, 0)}, to financial close`} />
            <Kpi label={en.kpis.lcoe.label} value={ct(k.lcoeRealCt)} note={`Real 2026 money (nominal ${num(k.lcoeNominalCt, 2)} ct/kWh)`} />
            <Kpi label={en.kpis.minDscr.label} value={ratio(k.minDscr)} note={`In ${k.minDscrYear}; covenant ${ratio(i.financing.covenantDscr)}, P90 1-yr ${ratio(d.results.p90.kpis.minDscr)}`} />
            <Kpi label={en.kpis.debt.label} value={meur(k.debt)} note={`${pct(k.gearing, 1)} of uses; equity ${meur(k.equity)}`} />
          </div>
          <Panel title="Key messages">
            <Bullets items={d.summary} />
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Validity">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <StatusIcon level={status.level} />
              {status.level === "ok" ? en.validity.ok : status.text}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-[13px]">
              {groups.map((g) => {
                const level: Level = b.validity[g];
                const n = b.checks.filter((c) => c.group === g).length;
                return (
                  <li key={g} className="flex items-center gap-2">
                    <StatusIcon level={level} />
                    <span className="flex-1">{en.checks.groups[g]}</span>
                    <span className="tabular text-muted-foreground">{n} checks</span>
                  </li>
                );
              })}
            </ul>
            {notOk.length > 0 && (
              <ul className="mt-2 border-t border-border pt-2 text-[12px] leading-snug text-muted-foreground">
                {notOk.map((c) => (
                  <li key={c.id} className="flex gap-1.5">
                    <StatusIcon level={c.severity === "error" ? "error" : "warning"} className="mt-px size-3.5" />
                    <span>
                      {en.checks.ids[c.id] ?? c.id} — not met
                      {c.id === "bookEquity" && d.facts.negativeBookYears.length
                        ? ` in ${d.facts.negativeBookYears[0]}–${d.facts.negativeBookYears.at(-1)}: the legal limits on distributions could bite (§ 30 GmbHG, § 172 (4) HGB)`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Scenarios">
            <Table
              head={["", "Equity IRR", "Min DSCR"]}
              num={[1, 2]}
              rows={SCENARIOS.map((s) => ({
                cells: [SCENARIO_LABEL[s], irrText(d.results[s]), ratio(d.results[s].kpis.minDscr)],
              }))}
            />
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{en.scenarios.note}</p>
          </Panel>
        </div>
      </div>
    </Slide>
  );
}

// 3 ---------------------------------------------------------------------------------------------

function TimelineSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const tl = b.timeline;
  const i = d.inputs;
  const f = i.financing;
  const k = b.kpis;
  const instalments = b.lockedDebt.instalments.length;
  const reserveStart = `${Number(tl.endOfLife.slice(0, 4)) - i.opex.decommissioningReserveYears}${tl.endOfLife.slice(4)}`;
  const monthsToCod = Math.round((Date.parse(tl.cod) - Date.parse(tl.awardNotice)) / (86_400_000 * 30.4375));
  return (
    <Slide meta={meta} kicker={kicker("timeline")} title={d.titles.timeline} sources={d.cite("bnetza2608", "eegAwardDeadlines", "eeg", "kfw270", "kfw270Merkblatt")}>
      <div className="flex flex-col gap-4">
        <Gantt
          width={BODY_W}
          marker={{ label: `Data as of ${dateLabel(d.meta.dataAsOf)}`, date: d.meta.dataAsOf }}
          rows={[
            { label: "Award valid (§ 36e EEG)", start: tl.awardNotice, end: tl.awardLapse, color: SERIES[3]!, light: true, note: "36 months" },
            { label: "Construction", start: tl.financialClose, end: tl.cod, color: SERIES[1]!, note: `${i.project.constructionMonths} months` },
            { label: "Loan: grace years", start: tl.financialClose, end: tl.graceEnd, color: SERIES[0]!, light: true, note: "interest only" },
            { label: "Loan: repayment", start: tl.graceEnd, end: tl.loanMaturity, color: SERIES[0]!, note: `${instalments} quarterly instalments` },
            { label: "EEG support", start: tl.cod, end: tl.eegEnd, color: SERIES[2]!, note: `20 years + ${d.facts.extensionDays} days (§ 51a)` },
            { label: "Operation", start: tl.cod, end: tl.endOfLife, color: "var(--primary)", note: `${i.project.lifetimeYears} years` },
            { label: "Decommissioning reserve", start: reserveStart, end: tl.endOfLife, color: SERIES[4]!, note: `last ${i.opex.decommissioningReserveYears} years` },
          ]}
        />
        <div className="grid grid-cols-3 gap-x-10 gap-y-1 text-[13.5px]">
          <Fact label="Capacity" value={`${i.project.turbines} × ${num(i.project.turbineMw, 1)} MW = ${num(k.capacityMw, 1)} MW`} />
          <Fact label="Hub height / rotor" value={`${num(i.project.hubHeightM, 0)} m / ${num(i.project.rotorDiameterM, 0)} m`} />
          <Fact label="Site quality" value={`${pct(i.energy.siteQuality, 0)} → ${num(k.fullLoadHoursP50, 0)} h at P50`} />
          <Fact label="Award announced" value={`${dateLabel(tl.awardNotice)}; COD after ${monthsToCod} months`} />
          <Fact label="Financial close" value={`${dateLabel(tl.financialClose)} (valuation date)`} />
          <Fact label="First instalment" value={tl.firstInstalment ? dateLabel(tl.firstInstalment) : "—"} />
          <Fact label="Loan term" value={`${f.tenorYearsFromClose} years, ${f.graceYears} grace years`} />
          <Fact label="Legal form" value={en.options.legalForm?.[i.tax.legalForm] ?? i.tax.legalForm} />
          <Fact label="EEG support ends" value={dateLabel(tl.eegEnd)} />
        </div>
      </div>
    </Slide>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-[3px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular">{value}</span>
    </div>
  );
}

// 4 ---------------------------------------------------------------------------------------------

const ASSUMPTION_GROUPS: [string, string[]][][] = [
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

/** A field's value as the input panel shows it, with its unit. */
function fieldText(f: FieldDef, d: ReportData): string {
  const v = f.get(d.inputs);
  if (f.kind === "switch") return v ? "Yes" : "No";
  if (f.kind === "select") return en.options[f.optionsKey ?? ""]?.[String(v)] ?? String(v);
  if (f.kind === "month") {
    const [y, mo] = String(v).split("-").map(Number);
    return new Date(Date.UTC(y!, mo! - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  if (f.kind === "date") return dateLabel(String(v));
  const shown = num(Number(toDisplay(f, v)), f.decimals ?? 2);
  const unit = f.unit ?? "";
  if (unit === "" ) return shown;
  if (unit === "x") return `${shown}x`;
  if (unit.startsWith("%")) return `${shown}${unit}`;
  return `${shown} ${unit}`;
}

function AssumptionsSlide({ d, meta }: SlideProps) {
  const cell = (id: string): Row => {
    if (id === "futures") {
      const fut = d.inputs.revenue.futuresEurMwh;
      return {
        cells: [`Futures ${fut[0]?.year}–${String(fut.at(-1)?.year).slice(2)}`, `${fut.map((x) => num(x.value, 0)).join(" / ")} €/MWh`, d.cite("futures")],
      };
    }
    const f = FIELD_BY_ID.get(id);
    if (!f) return { cells: [id, "—", ""] };
    const keys = f.sources ?? [];
    const src = [d.cite(...keys.filter((s) => s !== "assumption")), keys.includes("assumption") ? "A" : ""].filter(Boolean).join(" · ");
    return { cells: [keep(en.fields[id]?.label ?? id), fieldText(f, d), src] };
  };
  const all = ASSUMPTION_GROUPS.flat().flatMap(([, ids]) => ids);
  const keys = all.flatMap((id) => (id === "futures" ? ["futures"] : (FIELD_BY_ID.get(id)?.sources ?? [])));
  return (
    <Slide meta={meta} kicker={kicker("assumptions")} title={d.titles.assumptions} sources={`${d.cite(...keys).split(", ").length} listed in the table`}>
      <div className="grid grid-cols-3 gap-7">
        {ASSUMPTION_GROUPS.map((col, c) => (
          <div key={c} className="flex flex-col gap-3">
            {col.map(([group, ids]) => (
              <div key={group}>
                <p className="mb-0.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{group}</p>
                <Table rows={ids.map(cell)} num={[1, 2]} widths={[undefined, "112px", "70px"]} className="text-[12.5px]" caption={group} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-muted-foreground">
        S1–S{d.sourceKeys.length}: sources listed on slide 18 · A: assumption — no public value for this case; see the methodology. All
        inputs, with hints and ranges, are in the calculator and the Excel workbook.
      </p>
    </Slide>
  );
}

// 5 ---------------------------------------------------------------------------------------------

function EnergySlide({ d, meta }: SlideProps) {
  const e = d.inputs.energy;
  const k = d.results.base.kpis;
  const site = e.siteQuality * e.referenceYieldHours;
  const afterAvailability = site * Math.min(1, e.availability / 0.98);
  const p50 = k.fullLoadHoursP50;
  const p90 = p50 * (1 - P90_Z * e.sigma1y);
  const steps: BridgeStep[] = [
    { label: "Reference yield", value: e.referenceYieldHours, kind: "total" },
    { label: `Site quality ${pct(e.siteQuality, 0)}`, value: site - e.referenceYieldHours, kind: "delta" },
    { label: "Site yield", value: site, kind: "total" },
    { label: `Availability ${pct(e.availability, 1)}`, value: afterAvailability - site, kind: "delta" },
    ...(e.otherExtraLosses > 0 ? [{ label: `Other losses ${pct(e.otherExtraLosses, 1)}`, value: p50 - afterAvailability, kind: "delta" as const }] : []),
    { label: "P50, net", value: p50, kind: "total" },
    { label: `One-year uncertainty ${pct(e.sigma1y, 1)}`, value: p90 - p50, kind: "delta" },
    { label: "P90, one year", value: p90, kind: "total" },
  ];
  const year = d.facts.firstFullYear;
  const row = (s: ScenarioName) => d.results[s].annual.find((a) => a.year === year);
  const last = d.results.base.annual.filter((a) => a.operatingFraction > 0.999).at(-1);
  const gwh = (v: number | undefined) => (v === undefined ? "—" : num(v / 1e6, 1));
  return (
    <Slide
      meta={meta}
      kicker={kicker("energy")}
      title={d.titles.energy}
      sources={d.cite("windguardCost2025", "fawsSiteQuality", "leeFullLoad", "degradation", "uncertainty", "smard", "eeg")}
    >
      <div className="grid grid-cols-[700px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Full-load hours a year, before degradation</p>
          <Bridge steps={steps} width={700} height={372} format={(v) => num(v, 0)} ariaLabel="Energy yield bridge from the reference yield to P50 and P90, full-load hours" />
        </div>
        <div className="flex flex-col gap-4">
          <Panel title={`Output in ${year}, the first full year (GWh)`}>
            <Table
              num={[1]}
              rows={[
                { cells: ["P50 output", gwh(row("base")?.energyKwh)], bold: true },
                { cells: [`Sold: ${pct(e.negativePriceOutputShare, 0)} falls into negative prices`, gwh(row("base")?.energySoldKwh)] },
                { cells: [`P90, one year (${pct(1 - P90_Z * e.sigma1y, 1)} of P50)`, gwh(row("p90")?.energyKwh)] },
                { cells: [`P90, ten years (${pct(1 - P90_Z * e.sigma10y, 1)} of P50)`, gwh(row("resource")?.energyKwh)] },
                { cells: [`P50 in ${last?.year ?? "—"}, after ${pct(e.degradationPerYear, 1)} a year of degradation`, gwh(last?.energyKwh)] },
              ]}
            />
          </Panel>
          <Bullets
            items={[
              "By law the site yield already excludes wake losses, up to 2% unavailability, electrical losses and curtailment required by the permit (Anlage 2 Nr. 7 EEG); the model deducts only availability below 98% and other losses.",
              `Site quality sets both the output and the correction factor of the AW: a better site produces more but receives less per kWh.`,
              `P90 = P50 × (1 − ${P90_Z} × σ). The one-year value tests debt service in a bad year; the ten-year value describes a weaker wind resource.`,
              "Grid curtailment under Redispatch 2.0 is compensated (§ 13a EnWG) and is not deducted.",
            ]}
            className="text-[12.5px]"
          />
        </div>
      </div>
    </Slide>
  );
}

// 6 ---------------------------------------------------------------------------------------------

function EegSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const k = b.kpis;
  const i = d.inputs;
  const a = b.annual.filter((x) => x.eegShare > 0);
  const years = a.map((x) => x.year);
  const perKwh = (value: number, sold: number) => (sold > 0 ? (value / sold) * 100 : 0);
  const unrounded = i.revenue.awardPriceCt * k.correctionFactor;
  return (
    <Slide
      meta={meta}
      kicker={kicker("eeg")}
      title={d.titles.eeg}
      sources={d.cite("eeg", "bnetza2608", "eegSettlement", "netztransparenzMarketValues", "smard")}
    >
      <div className="grid grid-cols-[660px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Base scenario during support, ct/kWh (nominal)</p>
          <YearChart
            width={660}
            height={318}
            years={years}
            bars={[{ id: "mp", label: "Market premium per kWh sold", color: SERIES[1]!, values: a.map((x) => perKwh(x.revenuePremium, x.energySoldKwh)) }]}
            lines={[{ id: "jw", label: "Annual market value of wind (JW)", color: SERIES[0]!, values: a.map((x) => x.marketValueEurKwh * 100) }]}
            refLines={[{ label: `AW ${num(k.awCt, 2)}`, value: k.awCt, labelAt: "right-below" }]}
            yMin={0}
            format={(v) => `${num(v, 2)} ct`}
            axisFormat={(v) => num(v, 0)}
            ariaLabel="Annual market value of wind against the AW during the support period, ct/kWh"
          />
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="How the premium is set">
            <Table
              num={[1]}
              rows={[
                { cells: [`Award price (tender of ${dateLabel(TENDER_FACTS.lastRoundDate)})`, ct(i.revenue.awardPriceCt)] },
                { cells: [`× correction factor at ${pct(i.energy.siteQuality, 0)} site quality (§ 36h)`, num(k.correctionFactor, 3)] },
                { cells: [`= AW, ${num(unrounded, 4)} rounded (§ 36h (5))`, ct(k.awCt)], bold: true, rule: true },
                { cells: ["Premium = max(0, AW − annual market value)", "Anlage 1"] },
                { cells: [`No premium at negative prices: output share`, pct(i.energy.negativePriceOutputShare, 0)] },
                { cells: [`Support: 20 years + § 51a extension`, `+${d.facts.extensionDays} days`] },
                { cells: ["Support ends", dateLabel(b.timeline.eegEnd)] },
              ]}
            />
          </Panel>
          <Panel title="Premium by scenario">
            <Table
              head={["", "Years paid", "Total", "AW from year 6"]}
              num={[1, 2, 3]}
              rows={SCENARIOS.map((s) => ({
                cells: [
                  SCENARIO_LABEL[s],
                  `${d.facts.premiumYears[s]} of ${d.facts.supportYears}`,
                  meur(d.facts.premiumTotal[s]),
                  ct((d.results[s].awPeriods[1] ?? d.results[s].awPeriods[0])!.awCt),
                ],
              }))}
            />
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
              Advances follow the previous year’s market value (§ 26); the rest arrives with the final settlement, assumed{" "}
              {i.revenue.premiumTrueUpLagMonths} months after the year end. The multi-year stresses re-determine the AW from year 6 (§ 36h (2)).
            </p>
          </Panel>
        </div>
      </div>
    </Slide>
  );
}

// 7 ---------------------------------------------------------------------------------------------

function PricesSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const i = d.inputs;
  const r = i.revenue;
  const fut = r.futuresEurMwh;
  const pre = fut.filter((x) => x.year < b.annual[0]!.year);
  const years = [...pre.map((x) => x.year), ...b.annual.map((a) => a.year)];
  const base = [...pre.map((x) => x.value), ...b.annual.map((a) => a.baseEurMwh)];
  const jw = [...pre.map((x) => x.value * r.captureFactor), ...b.annual.map((a) => a.marketValueEurKwh * 1000)];
  const at = (y: number) => b.annual.find((a) => a.year === y);
  return (
    <Slide
      meta={meta}
      kicker={kicker("prices")}
      title={d.titles.prices}
      sources={d.cite("futures", "priceScenarios", "netztransparenzMarketValues", "smard", "directMarketing", "ppa", "bundesbank", "ecb")}
    >
      <div className="grid grid-cols-[700px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Power prices, €/MWh (nominal)</p>
          <YearChart
            width={700}
            height={318}
            years={years}
            lines={[
              { id: "base", label: "Baseload price", color: SERIES[0]!, values: base },
              { id: "jw", label: "Market value of wind", color: SERIES[1]!, values: jw },
            ]}
            refLines={[{ label: `AW ${num(b.kpis.awCt * 10, 1)} €/MWh`, value: b.kpis.awCt * 10, labelAt: "right-below" }]}
            yMin={0}
            format={(v) => `${num(v, 1)} €/MWh`}
            axisFormat={(v) => num(v, 0)}
            ariaLabel="Baseload price and market value of wind by year, euro per MWh"
          />
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Price inputs">
            <Table
              num={[1]}
              rows={[
                ...fut.map((x) => ({ cells: [`EEX baseload futures ${x.year}`, `${num(x.value, 2)} €/MWh`] })),
                { cells: [`Long-term baseload from ${(fut.at(-1)?.year ?? 2029) + 1}, 2026 money`, `${num(r.longTermBaseEurMwh2026, 0)} €/MWh`], bold: true },
                { cells: ["Wind capture factor (market value ÷ baseload)", num(r.captureFactor, 2)] },
                { cells: [`Market value of wind in ${2035} (nominal)`, `${num((at(2035)?.marketValueEurKwh ?? NaN) * 1000, 1)} €/MWh`] },
                { cells: ["Direct-marketing fee, 2026 money", ct(r.directMarketingCtKwh2026)] },
                { cells: ["After the EEG period", r.postEeg === "ppa" ? `PPA at ${num(r.ppaEurMwh2026, 0)} €/MWh (2026 money)` : "Market prices"] },
                { cells: [`Inflation ${i.macro.inflation.map((x) => x.year).join("/")}, then`, `${i.macro.inflation.map((x) => pct(x.value, 1)).join(" / ")}, ${pct(i.macro.longRunInflation, 1)}`] },
              ]}
            />
          </Panel>
          <Bullets
            className="text-[12.5px]"
            items={[
              "The long-term price is the model’s strongest assumption. Published scenarios range from about 65 to 101 €/MWh (Ariadne, Prognos, Agora).",
              "The farm’s own capture price is assumed equal to the market value of all onshore wind; the 2023–2025 average factor was 0.81.",
              `Negative-price periods: ${pct(i.energy.negativePriceTimeShare, 1)} of the time, ${pct(i.energy.negativePriceOutputShare, 0)} of the output; the farm is curtailed then.`,
            ]}
          />
        </div>
      </div>
    </Slide>
  );
}

// 8 ---------------------------------------------------------------------------------------------

function ConstructionSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const su = b.sourcesUses;
  const cons = b.construction;
  const i = d.inputs;
  const capacityKw = b.kpis.capacityMw * 1000;
  const itemsTotal = i.capex.items.reduce((s, it) => s + it.eurPerKw, 0);
  const cx: Record<string, string> = {
    turbine: "Turbines incl. transport and installation",
    foundation: "Foundations",
    infrastructure: "Roads and crane pads",
    gridConnection: "Grid connection",
    development: "Development and permits",
    compensation: "Compensation measures",
    other: "Other",
  };
  const U = en.overview.uses;
  return (
    <Slide meta={meta} kicker={kicker("construction")} title={d.titles.construction} sources={d.cite("windguardCost2025", "kfw270Merkblatt", "ustg", "prospectuses")}>
      <div className="grid grid-cols-[520px_1fr_300px] gap-8">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Funding by month after financial close, € million</p>
          <YearChart
            width={520}
            height={300}
            years={cons.map((c) => c.index)}
            bars={[
              { id: "debt", label: "Debt drawn", color: SERIES[0]!, values: cons.map((c) => m(c.debtDraw)) },
              { id: "eq", label: "Equity paid in", color: SERIES[1]!, values: cons.map((c) => m(c.equityDraw)) },
            ]}
            format={fmtM}
            axisFormat={axisM}
            ariaLabel="Debt and equity drawn by construction month, euro million"
          />
          <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
            Turbines: 10% at close, 70% on delivery, 20% at commissioning; civil works in thirds; development at close. VAT of{" "}
            {pct(i.capex.vatRate, 0)} is bridged by a VAT loan for {i.capex.vatRefundLagMonths} months.{" "}
            {i.financing.equityFirst ? "Equity is paid in first." : "Debt and equity are drawn pro rata."}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[13px] font-semibold">Capex, net of VAT</p>
          <Table
            head={["", "€/kW", "€m"]}
            num={[1, 2]}
            rows={[
              ...i.capex.items.map((it) => ({ cells: [cx[it.key] ?? it.key, num(it.eurPerKw, 0), num((it.eurPerKw * capacityKw) / 1e6, 2)] })),
              {
                cells: [`Contingency ${pct(i.capex.contingencyPct, 0)}`, num(itemsTotal * i.capex.contingencyPct, 0), num((itemsTotal * i.capex.contingencyPct * capacityKw) / 1e6, 2)],
              },
              { cells: ["Total capex", num(b.kpis.capexPerKw, 0), num(su.capex / 1e6, 2)], bold: true, rule: true },
            ]}
          />
        </div>
        <div>
          <p className="mb-1 text-[13px] font-semibold">Sources and uses, € thousand</p>
          <Table
            num={[1]}
            rows={[
              ...(["capex", "upfrontFee", "commitmentFee", "interestDuringConstruction", "vatInterest", "dsraInitial", "workingCapitalInitial"] as const).map(
                (key) => ({ cells: [U[key], keur(su[key])] }),
              ),
              { cells: [U.totalUses, keur(su.totalUses)], bold: true, rule: true },
              { cells: [U.debt, keur(su.debt)] },
              { cells: [U.equity, keur(su.equity)] },
              { cells: [U.totalSources, keur(su.totalSources)], bold: true, rule: true },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Gearing {pct(b.kpis.gearing, 1)} · check: sources − uses = {num(su.totalSources - su.totalUses, 0)}
          </p>
        </div>
      </div>
    </Slide>
  );
}

// 9 ---------------------------------------------------------------------------------------------

function OpexSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const a = b.annual;
  const i = d.inputs;
  const years = a.map((x) => x.year);
  const y = a.find((x) => x.year === d.facts.firstFullYear) ?? a[0]!;
  const perMwh = (v: number) => num((v / y.energySoldKwh) * 1000, 2);
  const bond = i.project.hubHeightM * i.opex.decommissioningBondPerMeterHub * i.project.turbines;
  const T = en.tables.rows;
  const lines: [string, number][] = [
    [T.maintenance!, y.maintenance],
    [T.management!, y.management],
    [T.insurance!, y.insurance],
    [T.otherOpex!, y.otherOpex],
    [T.lease!, y.lease],
    [T.directMarketing!, y.directMarketing],
    [T.municipal!, y.municipal],
    [T.guaranteeFee!, y.guaranteeFee],
    [T.gridFee!, y.gridFee],
  ];
  return (
    <Slide meta={meta} kicker={kicker("opex")} title={d.titles.opex} sources={d.cite("windguardCost2025", "leaseMarket", "hessenSecurity", "decommissioning", "prospectuses", "agnes", "eeg")}>
      <div className="grid grid-cols-[680px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Operating costs by year, € million (nominal)</p>
          <YearChart
            width={680}
            height={300}
            years={years}
            bars={[
              { id: "om", label: "Maintenance", color: SERIES[0]!, values: a.map((x) => m(x.maintenance)) },
              { id: "lease", label: "Land lease", color: SERIES[1]!, values: a.map((x) => m(x.lease)) },
              { id: "mio", label: "Management, insurance, other", color: SERIES[2]!, values: a.map((x) => m(x.management + x.insurance + x.otherOpex)) },
              { id: "dm", label: "Direct marketing, § 6 payment", color: SERIES[3]!, values: a.map((x) => m(x.directMarketing + x.municipal)) },
              { id: "gf", label: "Guarantee and grid fee", color: SERIES[4]!, values: a.map((x) => m(x.guaranteeFee + x.gridFee)) },
            ]}
            format={fmtM}
            axisFormat={axisM}
            ariaLabel="Operating costs by year and item, euro million"
          />
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Fixed items step up after years 10 and 20 (full-service maintenance ages). The first and last years are part years.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title={`${y.year}, the first full year`}>
            <Table
              head={["", "€ thousand", "€/MWh sold"]}
              num={[1, 2]}
              rows={[
                ...lines.filter(([, v]) => Math.abs(v) > 0.5).map(([label, v]) => ({ cells: [label, keur(v), perMwh(v)] })),
                { cells: ["Operating costs", keur(y.opex), perMwh(y.opex)], bold: true, rule: true },
                { cells: [T.municipalRefund!, keur(y.municipalRefund), perMwh(y.municipalRefund)], muted: true },
              ]}
            />
          </Panel>
          <Panel title="Decommissioning">
            <Table
              num={[1]}
              rows={[
                { cells: [`Security: ${num(i.project.hubHeightM, 0)} m hub × €${num(i.opex.decommissioningBondPerMeterHub, 0)} × ${i.project.turbines}`, eurCompact(bond)] },
                { cells: [`Guarantee fee ${pct(i.opex.guaranteeFeeRate, 2)} a year`, eurCompact(bond * i.opex.guaranteeFeeRate)] },
                { cells: [`Cost ${num(i.opex.decommissioningCostPerKw2026, 0)} €/kW (2026 money), paid ${a.at(-1)!.year}`, meur(d.facts.lifetime.decommissioning, 2)] },
                { cells: ["Cash reserve built over the last", `${i.opex.decommissioningReserveYears} years`] },
              ]}
            />
          </Panel>
        </div>
      </div>
    </Slide>
  );
}

// 10 --------------------------------------------------------------------------------------------

function FinancingSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const i = d.inputs;
  const f = i.financing;
  const k = b.kpis;
  const lc = b.sizing.lenderCase;
  const loanYears = lc.years.map((_, n) => n).filter((n) => (lc.debtService[n] ?? 0) > 1e-6);
  const pick = (xs: number[]) => loanYears.map((n) => m(xs[n] ?? 0));
  const basis = en.overview.basis[b.sizing.bankPriceBasis] ?? "";
  return (
    <Slide
      meta={meta}
      kicker={kicker("financing")}
      title={d.titles.financing}
      sources={d.cite("kfw270", "kfw270Merkblatt", "prospectuses", "gearing", "bankLetter")}
    >
      <div className="grid grid-cols-[680px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Lender’s case: revenue {basis}, € million</p>
          <YearChart
            width={680}
            height={300}
            years={loanYears.map((n) => lc.years[n]!)}
            bars={[{ id: "ds", label: "Debt service", color: SERIES[3]!, values: pick(lc.debtService) }]}
            lines={[
              { id: "c50", label: "CFADS at P50", color: SERIES[0]!, values: pick(lc.cfadsP50) },
              { id: "c90", label: "CFADS at P90 (1-year)", color: SERIES[1]!, values: pick(lc.cfadsP90) },
            ]}
            yMin={0}
            format={fmtM}
            axisFormat={axisM}
            ariaLabel="Lender's case: cash flow available for debt service at P50 and P90 against debt service, euro million"
          />
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            The loan is the largest that keeps CFADS at least {ratio(f.targetDscrP50)} × debt service at P50 and {ratio(f.targetDscrP90)} × at P90 in
            every year of the lender’s case, and at most {pct(f.maxGearing, 0)} of uses. Taxes, fees and the reserve depend on the loan: the model iterates.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Loan terms">
            <Table
              num={[1]}
              rows={[
                { cells: ["Interest rate, fixed", pct(f.interestRate, 2)] },
                { cells: ["Term from financial close / grace years", `${f.tenorYearsFromClose} / ${f.graceYears} years`] },
                { cells: ["Repayment", en.options.repayment?.[f.repayment] ?? f.repayment] },
                { cells: ["Target DSCR P50 / P90 (1-year)", `${ratio(f.targetDscrP50)} / ${ratio(f.targetDscrP90)}`] },
                { cells: ["Revenue the bank counts on", en.options.bankBasis?.[i.revenue.bankPriceBasis] ?? ""] },
                { cells: ["Maximum gearing", pct(f.maxGearing, 0)] },
                { cells: ["Upfront / commitment fee", `${pct(f.upfrontFeePct, 2)} / ${pct(f.commitmentFeePerMonth, 2)} a month`] },
                { cells: ["Debt service reserve", `${f.dsraMonths} months`] },
              ]}
            />
          </Panel>
          <Panel title="Result">
            <Table
              num={[1]}
              rows={[
                { cells: ["Loan", meur(k.debt, 2)], bold: true },
                { cells: ["Gearing (loan ÷ uses)", pct(k.gearing, 1)] },
                { cells: ["Limited by", d.facts.bindingLabel] },
                { cells: [`Lowest lender DSCR, P50 / P90`, `${ratio(b.sizing.minBankDscrP50)} / ${ratio(b.sizing.minBankDscrP90)}`] },
              ]}
            />
          </Panel>
        </div>
      </div>
    </Slide>
  );
}

// 11 --------------------------------------------------------------------------------------------

function DscrSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const f = d.inputs.financing;
  const withDebt = b.annual.filter((a) => a.debtService > 1e-6);
  const years = withDebt.map((a) => a.year);
  const dscrOf = (s: ScenarioName) => withDebt.map((a) => d.results[s].annual.find((x) => x.year === a.year)?.dscr ?? null);
  const su = b.sourcesUses;
  return (
    <Slide meta={meta} kicker={kicker("dscr")} title={d.titles.dscr} sources={d.cite("prospectuses", "kfw270Merkblatt")}>
      <div className="grid grid-cols-[680px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">DSCR by year, operating cases with the base-case loan</p>
          <YearChart
            width={680}
            height={300}
            years={years}
            lines={[
              { id: "base", label: "Base", color: SERIES[0]!, values: dscrOf("base") },
              { id: "p90", label: "P90 1-yr (same loan)", color: SERIES[1]!, values: dscrOf("p90") },
            ]}
            refLines={[
              { label: `Lock-up ${ratio(f.lockupDscr)}`, value: f.lockupDscr, labelAt: "right-above" },
              { label: `Covenant ${ratio(f.covenantDscr)}`, value: f.covenantDscr, labelAt: "right-below" },
            ]}
            yMin={0}
            format={(v) => ratio(v)}
            axisFormat={(v) => num(v, 1)}
            ariaLabel="Debt service cover ratio by year, base and one-year P90"
          />
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            DSCR = CFADS ÷ (interest + principal); CFADS = EBITDA − change in working capital − taxes. Grace years carry interest only, so their
            DSCR is high.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Cover and lock-up by scenario">
            <Table
              head={["", "Min DSCR", "Year", "Lock-up", "LLCR"]}
              num={[1, 2, 3, 4]}
              rows={SCENARIOS.map((s) => {
                const r = d.results[s];
                return {
                  cells: [SCENARIO_LABEL[s], ratio(r.kpis.minDscr), String(r.kpis.minDscrYear ?? "—"), `${r.validity.lockUpYears.length} yr`, ratio(r.kpis.llcr)],
                };
              })}
            />
          </Panel>
          <Panel title="Liquidity">
            <Table
              num={[1]}
              rows={[
                { cells: [`Debt service reserve (${f.dsraMonths} months), funded at COD`, eurCompact(su.dsraInitial)] },
                { cells: ["Start-up liquidity for first-year receivables", eurCompact(su.workingCapitalInitial)] },
                { cells: ["Average DSCR over the repayment years", ratio(b.kpis.avgDscr)] },
                { cells: [`Distributions held back below ${ratio(f.lockupDscr)}`, `${b.validity.lockUpYears.length} years`] },
                { cells: ["Lowest cash balance", b.validity.shortfall ? `short by ${eurCompact(b.validity.shortfall.amount)}` : "never negative"] },
              ]}
            />
          </Panel>
        </div>
      </div>
    </Slide>
  );
}

// 12 --------------------------------------------------------------------------------------------

function WaterfallSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const a = b.annual;
  const i = d.inputs;
  const L = d.facts.lifetime;
  const C = en.charts.cashflow;
  const T = en.tables.rows;
  const kg = i.tax.legalForm === "KG";
  const neg = d.facts.negativeBookYears;
  return (
    <Slide meta={meta} kicker={kicker("waterfall")} title={d.titles.waterfall} sources={d.cite("gewstg", "kstg", "estg", "bfhWindPark")}>
      <div className="grid grid-cols-[640px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Annual cash flows, € million (nominal)</p>
          <YearChart
            width={640}
            height={290}
            years={a.map((x) => x.year)}
            bars={[
              { id: "rev", label: C.revenue, color: SERIES[0]!, values: a.map((x) => m(x.revenue)) },
              { id: "opex", label: C.opex, color: SERIES[1]!, values: a.map((x) => -m(x.opex)) },
              { id: "tax", label: C.taxes, color: SERIES[2]!, values: a.map((x) => -m(x.taxes)) },
              { id: "ds", label: C.debtService, color: SERIES[3]!, values: a.map((x) => -m(x.debtService)) },
            ]}
            lines={[{ id: "dist", label: C.distribution, color: SERIES[4]!, values: a.map((x) => m(x.distribution)) }]}
            format={fmtM}
            axisFormat={axisM}
            ariaLabel="Annual cash flows: revenue, opex, taxes, debt service and cash to equity, euro million"
          />
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            {kg
              ? `A GmbH & Co. KG pays trade tax only (3.5% × ${pct(i.tax.hebesatz, 0)} multiplier); its partners’ income tax is not modelled.`
              : "A GmbH pays trade tax, corporate tax and the solidarity surcharge."}{" "}
            Straight-line depreciation over {i.tax.depreciationYears} years and loss carry-forwards keep taxable profit low in the early years.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Over the life, € million (nominal)">
            <Table
              num={[1]}
              rows={[
                { cells: [T.revenue!, num(L.revenue / 1e6, 1)] },
                { cells: [`${T.opex!} net of the § 6 refund`, num(-(L.opex - L.municipalRefund) / 1e6, 1)] },
                { cells: [T.ebitda!, num(L.ebitda / 1e6, 1)], bold: true, rule: true },
                { cells: [T.taxes!, num(-L.taxes / 1e6, 1)] },
                { cells: [T.deltaWorkingCapital!, num(-L.deltaWorkingCapital / 1e6, 1)] },
                { cells: ["CFADS", num(L.cfads / 1e6, 1)], bold: true, rule: true },
                { cells: [T.interest!, num(-L.interest / 1e6, 1)] },
                { cells: [T.principal!, num(-L.principal / 1e6, 1)] },
                { cells: [T.decommissioningPaid!, num(-L.decommissioning / 1e6, 1)] },
                { cells: ["Reserves released (debt service reserve)", num(L.reservesReleased / 1e6, 1)] },
                { cells: [T.distribution!, num(L.distribution / 1e6, 1)], bold: true, rule: true },
                { cells: ["Equity paid in during construction", num(-L.equityInvested / 1e6, 1)], muted: true },
              ]}
            />
          </Panel>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {keep(
              `${en.tables.distributionNote}${neg.length > 0 ? ` The model’s book equity is negative in ${neg[0]}–${neg.at(-1)}: a sign that such limits could bite, not a legal test.` : ""}`,
            )}
          </p>
        </div>
      </div>
    </Slide>
  );
}

// 13 --------------------------------------------------------------------------------------------

function ReturnsSlide({ d, meta }: SlideProps) {
  const b = d.results.base;
  const k = b.kpis;
  const i = d.inputs;
  const eq = d.facts.equityByYear;
  return (
    <Slide meta={meta} kicker={kicker("returns")} title={d.titles.returns} sources={d.cite("ise2024", "windguardCost2025")}>
      <div className="grid grid-cols-[680px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Owners’ cash flows by year, € million (nominal)</p>
          <YearChart
            width={680}
            height={300}
            years={eq.map((x) => x.year)}
            bars={[{ id: "flow", label: "Paid in (−) and received (+)", color: SERIES[0]!, values: eq.map((x) => m(x.flow)) }]}
            lines={[{ id: "cum", label: "Cumulative", color: SERIES[1]!, values: eq.map((x) => m(x.cumulative)) }]}
            format={fmtM}
            axisFormat={axisM}
            ariaLabel="Owners' annual and cumulative cash flows, euro million"
          />
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            Returns use the exact dates: monthly contributions during construction, cash to equity on 31 December (XIRR and XNPV, Actual/365).
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Returns, base case">
            <Table
              num={[1]}
              rows={[
                { cells: [`Equity IRR (${i.tax.legalForm === "KG" ? "KG, before the partners’ taxes" : "GmbH, after company taxes"})`, irrText(b, 2)], bold: true },
                { cells: ["Project IRR, pre-tax / after tax", `${pct(k.projectIrrPreTax, 2)} / ${pct(k.projectIrrPostTax, 2)}`] },
                { cells: [`Equity NPV at ${pct(i.macro.costOfEquity, 0)}`, npvText(b)] },
                { cells: [`Project NPV at ${pct(i.macro.waccNominal, 1)} (nominal WACC)`, meur(k.npvProject)] },
                { cells: ["Payback after commissioning", k.paybackYears === null ? "not within the life" : `${num(k.paybackYears, 1)} years`] },
                { cells: [`LCOE, real 2026 money at ${pct(i.macro.waccReal, 1)}`, ct(k.lcoeRealCt)] },
                { cells: ["Anzulegender Wert (the EEG floor)", ct(k.awCt)] },
              ]}
            />
          </Panel>
          <Bullets
            className="text-[12.5px]"
            items={[
              d.facts.negativeLeverage
                ? `Negative leverage: the equity IRR (${irrText(b, 2)}) is below the project IRR after tax (${pct(k.projectIrrPostTax, 2)}) — the project earns less than the loan’s ${pct(i.financing.interestRate, 2)}.`
                : `Positive leverage: the equity IRR (${irrText(b, 2)}) is above the project IRR after tax (${pct(k.projectIrrPostTax, 2)}).`,
              k.lcoeRealCt > k.awCt
                ? `The LCOE of ${ct(k.lcoeRealCt)} is above the AW of ${ct(k.awCt)}: the EEG floor alone does not cover the cost; the case relies on market prices.`
                : `The LCOE of ${ct(k.lcoeRealCt)} is below the AW of ${ct(k.awCt)}: the EEG floor covers the cost.`,
            ]}
          />
        </div>
      </div>
    </Slide>
  );
}

// 14 --------------------------------------------------------------------------------------------

function ScenariosSlide({ d, meta }: SlideProps) {
  const e = d.inputs.energy;
  const withDebt = d.results.base.annual.filter((a) => a.debtService > 1e-6);
  const text: Record<ScenarioName, string> = {
    base: "P50 output, base prices and costs; sizes the loan",
    p90: `One-year P90 output in every year (${pct(1 - P90_Z * e.sigma1y, 1)} of P50) — the lender’s stress`,
    resource: `Ten-year P90 output in every year (${pct(1 - P90_Z * e.sigma10y, 1)}), with the § 36h review`,
    downside: "Ten-year P90, power prices −20%, fixed opex and grid fee +10%, capex +5% paid by the owners, § 36h review",
  };
  return (
    <Slide meta={meta} kicker={kicker("scenarios")} title={d.titles.scenarios} sources={d.cite("uncertainty", "priceScenarios", "eeg")}>
      <div className="flex flex-col gap-4">
        <Table
          head={["", ...SCENARIOS.map((s) => SCENARIO_LABEL[s])]}
          widths={["190px", "22%", "22%", "22%", undefined]}
          className="tabular"
          rows={[
            { cells: ["What changes", ...SCENARIOS.map((s) => <span key={s} className="block pr-4 text-[11.5px] leading-snug text-muted-foreground">{text[s]}</span>)] },
            { cells: ["Equity IRR", ...SCENARIOS.map((s) => irrText(d.results[s], 2))], bold: true },
            { cells: ["Project IRR, after tax", ...SCENARIOS.map((s) => pct(d.results[s].kpis.projectIrrPostTax, 2))] },
            { cells: ["Equity NPV", ...SCENARIOS.map((s) => npvText(d.results[s]))] },
            { cells: ["Min DSCR (year)", ...SCENARIOS.map((s) => `${ratio(d.results[s].kpis.minDscr)} (${d.results[s].kpis.minDscrYear ?? "—"})`)] },
            { cells: ["Status", ...SCENARIOS.map((s) => statusOf(d.results[s]).text)] },
          ]}
        />
        <div className="grid grid-cols-[1fr_300px] items-end gap-8">
          <YearChart
            width={840}
            height={222}
            years={withDebt.map((a) => a.year)}
            lines={SCENARIOS.map((s, n) => ({
              id: s,
              label: SCENARIO_LABEL[s],
              color: SERIES[n]!,
              values: withDebt.map((a) => d.results[s].annual.find((x) => x.year === a.year)?.dscr ?? null),
            }))}
            refLines={[{ label: `Covenant ${ratio(d.inputs.financing.covenantDscr)}`, value: d.inputs.financing.covenantDscr, labelAt: "right-below" }]}
            yMin={0}
            format={(v) => ratio(v)}
            axisFormat={(v) => num(v, 1)}
            ariaLabel="DSCR by year in the four scenarios"
          />
          <p className="pb-6 text-[12px] leading-snug text-muted-foreground">
            DSCR by year in each scenario. {en.scenarios.note} Applying a P90 output to every year is a stress, not a 90% probability for the whole life.
          </p>
        </div>
      </div>
    </Slide>
  );
}

// 15 --------------------------------------------------------------------------------------------

function SensitivitySlide({ d, meta }: SlideProps) {
  const bars = d.extras.tornado.equityIrr;
  const base = bars[0]?.base ?? d.results.base.kpis.equityIrr ?? 0;
  const S = en.sensitivity;
  const settings = new Map(TORNADO_DRIVERS.map((x) => [x.id, x]));
  return (
    <Slide
      meta={meta}
      kicker={kicker("sensitivity")}
      title={d.titles.sensitivity}
      sources={d.cite("fawsSiteQuality", "priceScenarios", "netztransparenzMarketValues", "bnetza2608", "windguardCost2025", "kfw270", "bundesbank", "smard", "leaseMarket", "gewstg")}
    >
      <div className="grid grid-cols-[720px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">Equity IRR, each driver at its low and high value</p>
          <TornadoChart
            width={720}
            rows={bars.map((x) => ({ label: S.drivers[x.id] ?? x.id, lowLabel: x.lowLabel, highLabel: x.highLabel, low: x.low, high: x.high }))}
            base={base}
            format={(v) => pct(v, 1)}
            lowName={S.low}
            highName={S.high}
            ariaLabel="Tornado: equity IRR for the low and high value of each driver"
          />
          <p className="mt-1 text-[11.5px] text-muted-foreground">Base: {pct(base, 2)}. Colour marks the side of the input (low / high), not better or worse.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Settings">
            <Table
              head={["Driver", S.low, S.high]}
              num={[1, 2]}
              rows={bars.map((x) => ({ cells: [S.drivers[x.id] ?? x.id, settings.get(x.id)?.lowLabel ?? x.lowLabel, settings.get(x.id)?.highLabel ?? x.highLabel] }))}
              className="text-[12px]"
            />
          </Panel>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {S.subtitle} The negative-price driver also moves the capture factor with (1 − share). Drivers are sorted by the swing of the equity IRR.
          </p>
        </div>
      </div>
    </Slide>
  );
}

// 16 --------------------------------------------------------------------------------------------

function BidSlide({ d, meta }: SlideProps) {
  const x = d.extras;
  const bid = x.bid;
  const i = d.inputs;
  const B = en.bid;
  const shown = bid.feasible;
  const targetOnly = bid.target && bid.feasible && bid.target.awardPriceCt < bid.feasible.awardPriceCt - 1e-9 ? bid.target : null;
  const status = (ok: boolean | null): Level => (ok === null ? "info" : ok ? "ok" : "error");
  return (
    <Slide meta={meta} kicker={kicker("bid")} title={d.titles.bid} sources={d.cite("bnetza2608", "bnetzaCeiling2026")}>
      <div className="grid grid-cols-[700px_1fr] gap-10">
        <div>
          <p className="mb-1 text-[13px] font-semibold">{B.curve}, loan re-sized at every price</p>
          <CurveChart
            width={700}
            height={318}
            points={x.curve}
            xFormat={(v) => `${num(v, 1)} ct`}
            yFormat={(v) => pct(v, 0)}
            hLines={[{ label: `${B.target} ${pct(x.bidTarget, 1)}`, y: x.bidTarget }]}
            vLines={[
              { label: `Average award ${num(TENDER_FACTS.lastRoundAverageCt, 2)}`, x: TENDER_FACTS.lastRoundAverageCt },
              { label: `${B.ceiling} ${num(i.revenue.ceilingPriceCt, 2)}`, x: i.revenue.ceilingPriceCt },
            ]}
            marker={shown !== null && shown.awardPriceCt <= 10 ? { x: shown.awardPriceCt, y: shown.equityIrr ?? x.bidTarget } : null}
            seriesLabel={en.kpis.equityIrr.label}
            ariaLabel={B.curve}
          />
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {x.curve.some((pt) => pt.y === null) ? "Gaps: prices at which the company runs out of cash (returns not meaningful). " : ""}
            {B.resolution}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title={B.result}>
            <p className="text-[34px] font-semibold leading-tight tabular">
              {shown ? (
                <>
                  {num(shown.awardPriceCt, 2)} <span className="text-[16px] font-normal text-muted-foreground">ct/kWh</span>
                </>
              ) : (
                <span className="text-[18px]">{bid.target ? B.notFinanceable : B.notReachable}</span>
              )}
            </p>
            {shown && (
              <p className="text-[12.5px] text-muted-foreground">
                AW {ct(shown.awCt)} at this site · target equity IRR {pct(x.bidTarget, 1)}
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-1 text-[13px]">
              <li className="flex items-center gap-2">
                <StatusIcon level={status(bid.target !== null)} />
                {B.statusTarget}
              </li>
              <li className="flex items-center gap-2">
                <StatusIcon level={status(bid.feasible !== null)} />
                {B.statusFinanceable}
              </li>
              <li className="flex items-center gap-2">
                <StatusIcon level={status(bid.admissible)} />
                {bid.admissible === false ? B.aboveCeiling : B.statusAdmissible}
              </li>
            </ul>
            {targetOnly && <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{B.targetOnly(ct(targetOnly.awardPriceCt))}</p>}
          </Panel>
          <Table
            num={[1]}
            rows={[
              { cells: [`${B.lastRound} (announced ${dateLabel(TENDER_FACTS.lastRoundNoticeDate)})`, ct(TENDER_FACTS.lastRoundAverageCt)] },
              { cells: [B.ceiling, ct(i.revenue.ceilingPriceCt)] },
              { cells: ["Award price in this case", ct(i.revenue.awardPriceCt)] },
            ]}
          />
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            The IRR is not monotonic in the award price: a higher floor allows more debt at {pct(i.financing.interestRate, 2)}, which can lower the
            equity return. The search therefore scans a 0.25 ct grid for the first qualifying price, then bisects.
          </p>
        </div>
      </div>
    </Slide>
  );
}

// 17 --------------------------------------------------------------------------------------------

function RisksSlide({ d, meta }: SlideProps) {
  const i = d.inputs;
  return (
    <Slide
      meta={meta}
      kicker={kicker("risks")}
      title={d.titles.risks}
      sources={d.cite("priceScenarios", "eeg2027Draft", "bankLetter", "agnes", "eegAwardDeadlines", "smard", "kfw270")}
    >
      <div className="grid grid-cols-2 gap-10">
        <Panel title="Risks the calculator lets you test">
          <Bullets
            items={[
              <><strong>Power price after the futures.</strong> The long-term price is the strongest assumption; the tornado shows its weight.</>,
              <><strong>Wind resource.</strong> One-year and ten-year P90; a weaker site also re-sets the AW in the § 36h (2) reviews.</>,
              <><strong>Negative prices.</strong> No premium in those periods (§ 51 EEG); more of them also lower the capture factor.</>,
              <><strong>EEG 2027 draft.</strong> A two-sided premium is a switch — a simplified stress, not the draft’s calculation; 18 banks warned of financing risks (Sep 2026).</>,
              <><strong>Interest rate and loan terms.</strong> KfW 270 at {pct(i.financing.interestRate, 2)}; DSCR targets, gearing and the revenue the bank counts on are inputs.</>,
              <><strong>Timing.</strong> The award lapses 36 months after its announcement (§ 36e); a penalty applies after 30 months (§ 55). The checks flag late commissioning.</>,
              <><strong>Generator grid fees.</strong> Proposed in the regulator’s AgNes process (4–7 €/kW a year); 0 in the base case, an input.</>,
              <><strong>Distributions.</strong> Cash to equity is before § 30 GmbHG and § 172 (4) HGB; negative book equity is flagged.</>,
            ]}
            className="text-[13px]"
          />
        </Panel>
        <Panel title="What the model leaves out">
          <Bullets
            items={[
              "Operations are annual; output is spread evenly over the year (winter is in fact windier).",
              "The farm’s capture price equals the market value of all onshore wind.",
              "The partners’ income tax of a KG is not modelled; taxes are paid in the year they arise.",
              "One senior loan: no tranches, shareholder loans, refinancing or cash sweep; instalments during construction are not supported.",
              "Not modelled: the § 55 penalty for late commissioning, interest on § 36h paybacks, the interest barrier, and payments by the owners to cure a shortfall.",
              "Uncompensated grid curtailment (a draft of the grid package) and generator grid fees are not in the base case; the fee is available as an input.",
              "In the Excel workbook the loan, the total uses and the sculpted principal are solved on the website; the tornado and the bid calculator are included as values.",
              "The wind farm is fictional and the results are illustrative.",
            ]}
            className="text-[13px]"
          />
        </Panel>
      </div>
    </Slide>
  );
}

// 18 --------------------------------------------------------------------------------------------

function MethodologySlide({ d, meta }: SlideProps) {
  const checks = d.results.base.checks.length;
  const entries = d.sourceKeys.map((key, n) => ({ n: n + 1, s: SOURCES[key]! }));
  const half = Math.ceil(entries.length / 2);
  const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");
  return (
    <Slide meta={meta} kicker={kicker("methodology")} title={d.titles.methodology} sources="">
      <div className="grid grid-cols-[330px_1fr] gap-8">
        <div className="flex flex-col gap-3">
          <Bullets
            className="text-[12.5px]"
            items={[
              "Deterministic and nominal: the same inputs always give the same result. Construction runs monthly, operations by calendar year.",
              "Returns from dated cash flows (XIRR and XNPV, Actual/365). The loan is sized on the lender’s case and iterated until it changes by less than €0.50.",
              `${checks} checks in five groups on every run: calculation, funding, covenant, inputs and model scope.`,
              "The Excel workbook rebuilds the model in formulas. Recalculated by Microsoft Excel in 25 variants, its roughly 26,000 formula cells agree with the engine: money to the cent.",
              `Every input has a public source, checked on ${dateLabel(d.meta.dataAsOf)}, or is a documented assumption.`,
            ]}
          />
          <p className="text-[12px] leading-snug">
            Full methodology:{" "}
            <a className="text-link" href={absoluteUrl(PATHS.methodology)}>
              {absoluteUrl(PATHS.methodology).replace("https://", "")}
            </a>
            <br />
            Source code:{" "}
            <a className="text-link" href={SITE.repository}>
              {SITE.repository.replace("https://", "")}
            </a>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 text-[10.5px] leading-[1.28]">
          {[entries.slice(0, half), entries.slice(half)].map((col, c) => (
            <ol key={c} className="flex flex-col gap-[3px]">
              {col.map(({ n, s }) => (
                <li key={n} className="flex gap-1.5">
                  <span className="w-6 shrink-0 font-semibold tabular">S{n}</span>
                  <span>
                    <a href={s.url} className="text-foreground">
                      {s.title}
                    </a>{" "}
                    <span className="text-muted-foreground">
                      · {host(s.url)}, {dateLabel(s.date)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ))}
        </div>
      </div>
    </Slide>
  );
}
