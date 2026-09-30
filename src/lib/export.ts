// Excel export (values): summary, assumptions with sources, annual table, construction months, checks, sources.
import { SCENARIOS, SOURCES, type ModelResult, type ModelSnapshot } from "@/engine";
import type { Messages } from "@/messages/en";
import { FIELDS, toDisplay } from "./fields";
import { buildXlsx, excelDate, type Row, type Sheet } from "./xlsx";

const b = (v: string) => ({ v, s: "bold" as const });

export function buildWorkbook(snapshot: ModelSnapshot, t: Messages, pageUrl: string): Uint8Array {
  const { inputs, scenarios } = snapshot;
  const base = scenarios.base;
  const k = base.kpis;

  const summary: Row[] = [
    [{ v: t.header.title, s: "title" }],
    [t.header.subtitle],
    [t.header.disclaimer],
    [t.actions.excelNote],
    [`${t.header.dataAsOf}: ${snapshot.dataAsOf}`],
    [`Engine ${snapshot.engineVersion} · input hash ${snapshot.inputHash}`],
    [pageUrl],
    [],
    [b("KPI"), ...SCENARIOS.map((sc) => b(t.scenarios[sc]))],
    ["Status", ...SCENARIOS.map((sc) => statusText(scenarios[sc]))],
    ["Returns meaningful (company fully funded)", ...SCENARIOS.map((sc) => (scenarios[sc].validity.returnsMeaningful ? "yes" : "no"))],
    ...(
      [
        [t.kpis.equityIrr.label, "equityIrr", "pct"],
        [t.kpis.projectIrr.label, "projectIrrPostTax", "pct"],
        ["Project IRR pre-tax", "projectIrrPreTax", "pct"],
        [t.kpis.npv.label + " (€)", "npvEquity", "int"],
        [t.kpis.minDscr.label, "minDscr", "dec2"],
        ["Average DSCR", "avgDscr", "dec2"],
        ["LLCR", "llcr", "dec2"],
        [t.kpis.lcoe.label + " real (ct/kWh)", "lcoeRealCt", "dec2"],
        [t.kpis.lcoe.label + " nominal (ct/kWh)", "lcoeNominalCt", "dec2"],
        [t.kpis.debt.label + " (€)", "debt", "int"],
        ["Gearing", "gearing", "pct"],
        ["Equity (€)", "equity", "int"],
        ["Payback (years from COD)", "paybackYears", "dec2"],
      ] as const
    ).map(([label, key, s]) => [
      label,
      ...SCENARIOS.map((sc) => {
        const r = scenarios[sc];
        const returns = key === "equityIrr" || key === "npvEquity" || key === "paybackYears";
        return returns && !r.validity.returnsMeaningful ? "n.m." : { v: r.kpis[key] as number | null, s };
      }),
    ]),
    [t.tables.distributionNote],
    [],
    [b(t.overview.facts)],
    [t.overview.capacity + " (MW)", { v: k.capacityMw, s: "dec2" }],
    [t.overview.p50, { v: k.fullLoadHoursP50, s: "int" }],
    [t.overview.kf, { v: k.correctionFactor, s: "dec3" }],
    [t.overview.aw + " (ct/kWh)", { v: k.awCt, s: "dec2" }],
    ["Financial close", { v: excelDate(base.timeline.financialClose), s: "date" }],
    [t.overview.cod, { v: excelDate(base.timeline.cod), s: "date" }],
    [t.overview.eegEnd, { v: excelDate(base.timeline.eegEnd), s: "date" }],
    [t.overview.loanEnd, { v: excelDate(base.timeline.loanMaturity), s: "date" }],
    [t.overview.endOfLife, { v: excelDate(base.timeline.endOfLife), s: "date" }],
    [t.overview.firstInstalment, base.timeline.firstInstalment ? { v: excelDate(base.timeline.firstInstalment), s: "date" } : "—"],
    [t.overview.awardLapse, { v: excelDate(base.timeline.awardLapse), s: "date" }],
    [
      t.overview.sizing,
      `${t.overview.binding[base.sizing.binding] ?? base.sizing.binding} ${base.sizing.binding.startsWith("dscr") ? (t.overview.basis[base.sizing.bankPriceBasis] ?? "") : ""}`.trim(),
    ],
    ["Lowest lender DSCR, P50", { v: base.sizing.minBankDscrP50, s: "dec3" }],
    ["Lowest lender DSCR, P90 1-yr", { v: base.sizing.minBankDscrP90, s: "dec3" }],
    [],
    [b(t.overview.sourcesUses), b("€")],
    ...Object.entries(base.sourcesUses).map(([key, v]) => [t.overview.uses[key] ?? key, { v, s: "int" as const }]),
  ];

  const assumptions: Row[] = [
    [b("Group"), b("Input"), b("Value"), b("Unit"), b("Sources")],
    ...FIELDS.filter((f) => !f.virtual && !(f.hidden?.(inputs) ?? false)).map((f) => {
      const raw = toDisplay(f, f.get(inputs));
      const label = f.opexCell
        ? `${t.inputs.opexItems[f.opexCell.item]} — ${t.inputs.decade[f.opexCell.decade]}`
        : (t.fields[f.id]?.label ?? f.id);
      const value =
        typeof raw === "boolean" ? (raw ? "yes" : "no") : typeof raw === "string" ? (t.options[f.optionsKey ?? ""]?.[raw] ?? raw) : raw;
      const sources = (f.sources ?? [])
        .map((s) => (s === "assumption" ? "Assumption" : (SOURCES[s]?.title ?? s)))
        .join("; ");
      return [t.groups[f.group] ?? f.group, label, value, f.unit ?? "", sources];
    }),
  ];

  const years = base.annual.map((a) => a.year);
  const annualRows: [string, (a: ModelResult["annual"][number]) => number | null, "int" | "dec2"][] = [
    ["Energy sold (kWh)", (a) => a.energySoldKwh, "int"],
    [t.tables.rows.marketValue ?? "Market value (€/MWh)", (a) => a.marketValueEurKwh * 1000, "dec2"],
    ...(
      [
        "revenueMarket", "revenuePremium", "revenuePostEeg", "revenue", "maintenance", "management", "insurance", "otherOpex",
        "lease", "directMarketing", "municipal", "guaranteeFee", "gridFee", "opex", "municipalRefund", "ebitda",
        "depreciation", "interest", "provisionChange", "ebt", "tradeTax", "corporateTax", "soli", "taxes", "netIncome",
        "receivables", "deltaWorkingCapital", "premiumAdvance", "siteQualitySettlement", "cfads", "principal", "debtService",
        "debtOpening", "debtClosing", "dsraBalance", "decommissioningReserve", "trappedCash", "cashDeficit",
        "decommissioningPaid", "distribution", "bookEquity",
      ] as const
    ).map((key) => [`${t.tables.rows[key] ?? key} (€)`, (a: ModelResult["annual"][number]) => a[key], "int"] as [string, (a: ModelResult["annual"][number]) => number, "int"]),
    ["DSCR", (a) => a.dscr, "dec2"],
  ];
  const annual: Row[] = [
    [b(t.charts.year), ...years.map((y) => b(String(y)))],
    ...annualRows.map(([label, get, s]) => [label, ...base.annual.map((a) => ({ v: get(a), s }))]),
  ];

  const construction: Row[] = [
    [b("Month end"), b("Capex"), b("VAT paid"), b("VAT refund"), b("VAT bridge balance"), b("VAT interest"), b("Upfront fee"),
      b("Commitment fee"), b("Interest during construction"), b("DSRA funding"), b("Start-up liquidity"), b("Total need"), b("Loan draw"),
    b("Equity draw")],
    ...base.construction.map((m) => [
      { v: excelDate(m.date), s: "date" as const },
      ...[m.capex, m.vat, m.vatRefund, m.vatFacilityBalance, m.vatInterest, m.upfrontFee, m.commitmentFee,
        m.interestDuringConstruction, m.dsraFunding, m.workingCapitalFunding, m.need, m.debtDraw, m.equityDraw].map((v) => ({ v, s: "int" as const })),
    ]),
  ];

  const checks: Row[] = [
    [b("Check"), b("Group"), b("Status"), b("Severity"), b("Value")],
    ...base.checks.map((c) => [t.checks.ids[c.id] ?? c.id, t.checks.groups[c.group] ?? c.group, c.ok ? "OK" : "FAILED", c.severity, c.value]),
  ];

  const sources: Row[] = [
    [b("Key"), b("Title"), b("URL"), b("Date")],
    ...Object.entries(SOURCES).map(([key, s]) => [key, s.title, s.url, s.date]),
  ];

  const sheets: Sheet[] = [
    { name: "Summary", rows: summary, widths: [44, 18, 18, 18, 18] },
    { name: "Assumptions", rows: assumptions, widths: [24, 40, 14, 16, 90] },
    { name: "Annual (base)", rows: annual, widths: [40, ...years.map(() => 13)] },
    { name: "Construction", rows: construction, widths: [12, ...Array(13).fill(15)] },
    { name: "Checks", rows: checks, widths: [60, 14, 10, 10, 20] },
    { name: "Sources", rows: sources, widths: [26, 80, 90, 12] },
  ];
  return buildXlsx(sheets);
}

/** The validity line of a scenario for the Summary sheet. */
function statusText(r: ModelResult): string {
  const v = r.validity;
  if (v.integrity === "error") return "Calculation check failed";
  if (v.shortfall) return `Not funded: shortfall in ${v.shortfall.year}`;
  if (v.covenantBreach) return `Covenant breached in ${v.covenantBreach.year}`;
  if (v.scope === "error") return "Outside the model scope";
  return v.lockUpYears.length ? `Valid; lock-up in ${v.lockUpYears.length} year(s)` : "Valid";
}
