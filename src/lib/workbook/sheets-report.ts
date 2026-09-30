// Workbook sheets: Checks, Scenarios, Sensitivities, Sources and Readme.
import { SCENARIOS, SOURCES, TORNADO_DRIVERS, type TornadoMetric } from "@/engine";
import type { Messages } from "@/messages/en";
import { SC_LABEL, type Env } from "./common";
import type { WorkbookExtras } from "./build";
import { blank, scalar, text, type Ctx, type Row, type SheetDef } from "./grid";
import type { CellValue, Fmt } from "./ooxml";

const OK = "OK";

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

export function checksSheet(e: Env): SheetDef {
  const { i } = e;
  const b = e.base;
  const rows: Row[] = [];
  const ids: string[] = [];
  const check = (id: string, label: string, f: (c: Ctx) => string, v: string, note?: string) => {
    ids.push(`chk.${id}`);
    rows.push(scalar(`chk.${id}`, label, f, v, { role: "check", note }));
  };
  const status = (cond: (c: Ctx) => string, fail: string) => (c: Ctx) => `IF(${cond(c)},"${OK}","${fail}")`;
  const sculpted = i.financing.repayment === "sculpted";
  const D = b.kpis.debt;
  const L = b.sizing.lenderCase;
  const headroom = L.cfadsP50
    .map((cf, y) => (L.debtService[y]! > 1e-6 ? Math.min(cf / L.debtService[y]! / i.financing.targetDscrP50, L.cfadsP90[y]! / L.debtService[y]! / i.financing.targetDscrP90) : Infinity))
    .reduce((a, x) => Math.min(a, x), Infinity);
  const loanCap = i.financing.maxGearing * b.sourcesUses.totalUses;
  const loanOk = sculpted
    ? headroom >= 1 - 1e-6 && (Math.abs(headroom - 1) < 1e-6 || Math.abs(D - loanCap) < 0.5)
    : Math.abs(Math.max(0, Math.min(D * headroom, loanCap)) - D) <= 0.5;

  rows.push(text("Pasted solution still fits (otherwise download the workbook again from the website)", "section"));
  check(
    "loan",
    "Loan: the DSCR targets and the gearing cap give the pasted loan",
    status(
      (c) =>
        `IF(${c.k("in.repayment")}="sculpted",AND(${c.k("d.minHeadroom")}>=1-${c.k("k.tiny")},OR(ABS(${c.k("d.minHeadroom")}-1)<${c.k("k.tiny")},ABS(${c.k("d.debt")}-${c.k("d.loanCap")})<0.5)),ABS(${c.k("d.loanCalc")}-${c.k("d.debt")})<=0.5)`,
      "Re-solve the financing on the website",
    ),
    loanOk ? OK : "Re-solve the financing on the website",
    "tolerance €0.50, as the website's solver",
  );
  check(
    "usesBase",
    "Total uses (base): the funding need adds up to the pasted uses",
    status((c) => `ABS(${c.k("c.base.uses")}-${c.k("sol.usesBase")})<=0.5`, "Re-solve the financing on the website"),
    OK,
  );
  check(
    "usesDown",
    "Total uses (downside): the funding need adds up to the pasted uses",
    status((c) => `ABS(${c.k("c.down.uses")}-${c.k("sol.usesDown")})<=0.5`, "Re-solve the financing on the website"),
    OK,
  );
  check(
    "structure",
    "Timeline and loan structure unchanged since the download",
    status(
      (c) =>
        `AND(${c.k("in.fc")}=${c.k("sol.fc")},${c.k("in.construction")}=${c.k("sol.construction")},${c.k("in.lifetime")}=${c.k("sol.lifetime")},` +
        `${c.k("in.tenor")}=${c.k("sol.tenor")},${c.k("in.grace")}=${c.k("sol.grace")},${c.k("in.repayment")}=${c.k("sol.repayment")})`,
      "Structure changed: download a new workbook",
    ),
    OK,
  );
  rows.push(blank(), text("Model checks", "section"));
  check("sources", "Sources equal uses (base)", status((c) => `ABS(${c.k("c.base.uses")}-${c.k("c.base.debt")}-${c.k("c.base.equity")})<1`, "Sources ≠ uses"), OK);
  check(
    "repaid",
    "Loan repaid by the last instalment",
    status((c) => `ABS(INDEX(${c.range("d.close")},MATCH(MIN(${c.k("t.maturityYear")},${c.k("t.lastYear")}),${c.range("t.year")},0)))<1`, "Loan not repaid"),
    Math.abs(b.annual.find((a) => a.year === Math.min(new Date(Date.parse(b.timeline.loanMaturity)).getUTCFullYear(), b.annual.at(-1)!.year))?.debtClosing ?? 0) < 1 ? OK : "Loan not repaid",
  );
  check(
    "gearing",
    "Gearing within the maximum (base)",
    status((c) => `${c.k("r.base.gearing")}<=${c.k("in.maxGearing")}+${c.k("k.tiny")}`, "Gearing above the maximum"),
    b.kpis.gearing <= i.financing.maxGearing + 1e-6 ? OK : "Gearing above the maximum",
  );
  for (const sc of SCENARIOS) {
    const r = e.runs[sc];
    const bsMax = Math.max(...r.trace!.statements.difference.map(Math.abs));
    check(
      `balance.${sc}`,
      `${SC_LABEL[sc]}: balance sheet balances every year`,
      status((c) => `MAX(MAX(${c.range(`b.${sc}.check`)}),-MIN(${c.range(`b.${sc}.check`)}))<1`, "Balance sheet does not balance"),
      bsMax < 1 ? OK : "Balance sheet does not balance",
    );
    const minCash = Math.min(0, ...r.annual.map((a) => a.cashDeficit));
    check(
      `cash.${sc}`,
      `${SC_LABEL[sc]}: the company never runs out of cash`,
      status((c) => `MIN(${c.range(`w.${sc}.deficitOut`)})>-1`, "Cash shortfall: returns not meaningful"),
      minCash > -1 ? OK : "Cash shortfall: returns not meaningful",
    );
    check(
      `covenant.${sc}`,
      `${SC_LABEL[sc]}: DSCR at or above the covenant every year`,
      status((c) => `${c.k(`r.${sc}.minDscr`)}>=${c.k("in.covenant")}-${c.k("k.tiny")}`, "Covenant breached"),
      r.kpis.minDscr === null || r.kpis.minDscr >= i.financing.covenantDscr - 1e-6 ? OK : "Covenant breached",
    );
  }
  const expectedAll = rows.every((row) => row.kind !== "scalar" || !row.id.startsWith("chk.") || row.v === OK);
  rows.push(blank());
  rows.push(
    scalar(
      "chk.master",
      "All checks",
      (c) => `IF(AND(${ids.map((id) => `${c.k(id)}="${OK}"`).join(",")}),"${OK}","See the checks above")`,
      expectedAll ? OK : "See the checks above",
      { role: "check" },
    ),
  );
  return { name: "Checks", rows, widths: [60, 12, 36, 40], freeze: { rows: 4, cols: 1 }, tabColor: "FFC00000" };
}

// ---------------------------------------------------------------------------------------------
// Scenarios: the workbook's results next to the website's
// ---------------------------------------------------------------------------------------------

const KPI_ROWS: { id: string; label: string; fmt: Fmt; get: (k: Env["base"]["kpis"], su: Env["base"]["sourcesUses"]) => number | null }[] = [
  { id: "irr", label: "Equity IRR", fmt: "pct3", get: (k) => k.equityIrr },
  { id: "npv", label: "Equity NPV (€)", fmt: "int", get: (k) => k.npvEquity },
  { id: "pirrPost", label: "Project IRR after tax", fmt: "pct3", get: (k) => k.projectIrrPostTax },
  { id: "pirrPre", label: "Project IRR before tax", fmt: "pct3", get: (k) => k.projectIrrPreTax },
  { id: "npvProject", label: "Project NPV (€)", fmt: "int", get: (k) => k.npvProject },
  { id: "lcoeReal", label: "LCOE real (ct/kWh)", fmt: "dec4", get: (k) => k.lcoeRealCt },
  { id: "lcoeNominal", label: "LCOE nominal (ct/kWh)", fmt: "dec4", get: (k) => k.lcoeNominalCt },
  { id: "minDscr", label: "Minimum DSCR", fmt: "ratio", get: (k) => k.minDscr },
  { id: "avgDscr", label: "Average DSCR (repayment years)", fmt: "ratio", get: (k) => k.avgDscr },
  { id: "llcr", label: "LLCR", fmt: "ratio", get: (k) => k.llcr },
  { id: "payback", label: "Payback (years from COD)", fmt: "dec2", get: (k) => k.paybackYears },
  { id: "uses", label: "Total uses (€)", fmt: "int", get: (_, su) => su.totalUses },
  { id: "equityIn", label: "Equity (€)", fmt: "int", get: (k) => k.equity },
  { id: "gearing", label: "Gearing", fmt: "pct2", get: (k) => k.gearing },
];

export function scenariosSheet(e: Env): SheetDef {
  const rows: Row[] = [];
  rows.push(text("Live results of this workbook and the website's results at download (inputs unchanged: they agree)"));
  const head = ["Measure", ...SCENARIOS.map((s) => `${SC_LABEL[s]} — workbook`), ...SCENARIOS.map((s) => `${SC_LABEL[s]} — website`)];
  rows.push({
    kind: "table",
    id: "tab.kpis",
    head,
    rows: KPI_ROWS.map((kpi) => [
      { v: kpi.label, role: "label" as const },
      ...SCENARIOS.map((s) => {
        const v = kpi.get(e.runs[s].kpis, e.runs[s].sourcesUses);
        return { v: v === null ? "n/a" : v, fmt: kpi.fmt, f: (c: Ctx) => c.k(`r.${s}.${kpi.id}`), role: "link" as const };
      }),
      ...SCENARIOS.map((s) => {
        const v = kpi.get(e.runs[s].kpis, e.runs[s].sourcesUses);
        return { v: v === null ? "n/a" : v, fmt: kpi.fmt, role: "snapshot" as const };
      }),
    ]),
  });
  rows.push(blank(), text("The loan and every instalment are the base case's in all four scenarios — the lender's view after financial close.", "note"));
  rows.push(text("P90 1-yr: one-year P90 output in every year (the lender's stress). P90 10-yr: ten-year P90 output with the § 36h review.", "note"));
  rows.push(text("Downside: ten-year P90 output, power prices −20 %, fixed opex and grid fee +10 %, capex +5 % paid by the owners, with the § 36h review.", "note"));
  return { name: "Scenarios", rows, widths: [34, ...Array(8).fill(23)], freeze: { rows: 6, cols: 1 }, tabColor: "FF2F75B5" };
}

// ---------------------------------------------------------------------------------------------
// Sensitivities: the website's tornado and bid calculator, as values
// ---------------------------------------------------------------------------------------------

export function sensitivitiesSheet(e: Env, x: WorkbookExtras, t: Messages): SheetDef {
  const rows: Row[] = [];
  const metrics: { id: TornadoMetric; label: string; fmt: Fmt }[] = [
    { id: "equityIrr", label: "Equity IRR", fmt: "pct2" },
    { id: "projectIrrPostTax", label: "Project IRR", fmt: "pct2" },
    { id: "minDscr", label: "Min DSCR", fmt: "ratio" },
    { id: "lcoeRealCt", label: "LCOE (ct/kWh)", fmt: "dec4" },
  ];
  rows.push(text("Computed by the website at download, with the loan re-sized for every bar (the view before financial close). Values, not formulas.", "note"));
  const snap = (v: number | null, fmt: Fmt) => ({ v: v === null ? "n/a" : v, fmt, role: "snapshot" as const });
  for (const m of metrics) {
    const bars = x.tornado[m.id];
    rows.push(blank(), text(`Tornado: ${m.label}`, "section"));
    rows.push({
      kind: "table",
      id: `tab.tornado.${m.id}`,
      head: ["Driver", "Low", m.label, "High", m.label],
      rows: bars.map((bar) => [
        { v: t.sensitivity.drivers[bar.id] ?? bar.id, role: "label" as const },
        { v: bar.lowLabel, role: "snapshot" as const },
        snap(bar.low, m.fmt),
        { v: bar.highLabel, role: "snapshot" as const },
        snap(bar.high, m.fmt),
      ]),
    });
  }
  rows.push(blank(), text("Bid calculator", "section"));
  const b = x.bid;
  const cell = (label: string, v: CellValue, fmt: Fmt = "general") => [{ v: label, role: "label" as const }, { v, fmt, role: "snapshot" as const }];
  rows.push({
    kind: "table",
    id: "tab.bid",
    head: ["", "Value"],
    rows: [
      cell("Target equity IRR", x.bidTarget, "pct2"),
      cell("Lowest award price for the target (ct/kWh)", b.target?.awardPriceCt ?? "not reachable", "dec4"),
      cell("Lowest financeable award price: funded, covenant met (ct/kWh)", b.feasible?.awardPriceCt ?? "not financeable", "dec4"),
      cell("AW at the financeable price (ct/kWh)", b.feasible ? b.feasible.awCt : "n/a", "dec4"),
      cell("Within the tender ceiling", b.admissible === null ? "n/a" : b.admissible ? "yes" : "no"),
      cell("Tender ceiling of the inputs (ct/kWh)", b.ceilingCt, "dec2"),
      cell("Search", `grid of ${b.stepCt} ct, then bisection to ${b.toleranceCt} ct, up to ${b.searchedUpToCt} ct`),
    ],
  });
  rows.push(blank(), text("Equity IRR by award price (loan re-sized; blank: the case runs out of cash)", "section"));
  rows.push({
    kind: "table",
    id: "tab.curve",
    head: ["Award price (ct/kWh)", "Equity IRR"],
    rows: x.curve.map((p) => [
      { v: p.x, fmt: "dec2" as const, role: "snapshot" as const },
      { v: p.y === null ? "" : p.y, fmt: "pct2" as const, role: "snapshot" as const },
    ]),
  });
  rows.push(blank(), text(`Drivers and ranges: ${TORNADO_DRIVERS.map((d) => `${t.sensitivity.drivers[d.id] ?? d.id} ${d.lowLabel} / ${d.highLabel}`).join("; ")}.`, "note"));
  void e;
  return { name: "Sensitivities", rows, widths: [48, 18, 16, 18, 16], freeze: { rows: 4, cols: 1 }, tabColor: "FF2F75B5" };
}

// ---------------------------------------------------------------------------------------------
// Sources and Readme
// ---------------------------------------------------------------------------------------------

export function sourcesSheet(): SheetDef {
  const rows: Row[] = [];
  rows.push({
    kind: "table",
    id: "tab.sources",
    head: ["Key", "Source", "Link", "Date"],
    rows: Object.entries(SOURCES).map(([key, s]) => [
      { v: key, role: "text" as const },
      { v: s.title, role: "text" as const },
      { v: s.url, role: "text" as const },
      { v: s.date, role: "text" as const },
    ]),
  });
  return { name: "Sources", rows, widths: [26, 90, 70, 12], freeze: { rows: 5, cols: 1 } };
}

export function readmeSheet(e: Env, t: Messages, pageUrl: string, status: string): SheetDef {
  const s = e.snap;
  const lines: [string, "subtitle" | "text" | "note" | "section"][] = [
    [t.header.disclaimer, "subtitle"],
    [`Engine ${s.engineVersion} · input hash ${s.inputHash} · data as of ${s.dataAsOf}`, "note"],
    [pageUrl, "note"],
    ["", "text"],
    ["What this workbook is", "section"],
    ["The project-finance model of the website, rebuilt with live spreadsheet formulas: change an input on the Inputs sheet and every result follows.", "text"],
    ["The website solves the two fixed points of the model — the loan and the total uses — and, for a sculpted loan, the principal per year. They are pasted as values (purple).", "text"],
    ["After a change, the Checks sheet shows whether the pasted loan still fits the DSCR targets. If not, re-solve on the website and download again.", "text"],
    ["", "text"],
    ["Colour code", "section"],
    ["Blue on yellow: inputs. Black: formulas. Green: links to another sheet. Purple: solved on the website — do not edit. Blue-grey: website results at download.", "text"],
    ["", "text"],
    ["Sheets", "section"],
    ["Inputs · Timing · Construction (monthly) · Operations · Tax · Debt (annual and monthly) · Waterfall · Statements · Results · Checks · Scenarios · Sensitivities · Sources", "text"],
    ["Every period sheet has the years in the same columns; column E holds opening values. One formula per row, copied across.", "text"],
    ["", "text"],
    ["Conventions", "section"],
    ["Amounts in nominal euros. Construction by month, operations by calendar year with cash flows on 31 December; IRR and NPV use the exact dates (Act/365, XIRR/XNPV).", "text"],
    ["Inputs are the website's, rounded to 0.001 of their unit; results may differ from an unrounded website run by fractions of a euro.", "text"],
    ["Cash available to equity is before legal limits on distributions (§ 30 GmbHG, § 172 (4) HGB). The wind farm is fictional; the results are illustrative.", "text"],
  ];
  const rows: Row[] = lines.map(([txt, role]) => text(txt, role));
  rows.push(blank(), scalar("readme.status", "Status of all checks", (c) => c.k("chk.master"), status, { role: "check" }));
  return { name: "Readme", rows, widths: [150, 10, 14] };
}
