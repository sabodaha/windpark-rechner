// Workbook sheets: Checks, Scenarios, Sensitivities, Sources and Readme.
import { SCENARIOS, SOURCES, TORNADO_DRIVERS, type TornadoMetric } from "@/engine";
import { MIN_DEBT_SERVICE } from "@/engine/model";
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
  const errors: string[] = [];
  const warnings: string[] = [];
  /** An error makes "All checks" fail; a warning is counted separately, as the website does. */
  const check = (id: string, label: string, f: (c: Ctx) => string, v: string, level: "error" | "warning", note?: string) => {
    (level === "error" ? errors : warnings).push(`chk.${id}`);
    rows.push(scalar(`chk.${id}`, label, f, v, { role: "check", note }));
  };
  const status = (cond: (c: Ctx) => string, fail: string) => (c: Ctx) => `IF(${cond(c)},"${OK}","${fail}")`;
  const engine = (id: string, fail: string, run = b) => ((run.checks.find((c) => c.id === id)?.ok ?? true) ? OK : fail);
  const sculpted = i.financing.repayment === "sculpted";
  const D = b.kpis.debt;
  const L = b.sizing.lenderCase;
  const headroom = L.cfadsP50
    .map((cf, y) => (L.debtService[y]! >= MIN_DEBT_SERVICE ? Math.min(cf / L.debtService[y]! / i.financing.targetDscrP50, L.cfadsP90[y]! / L.debtService[y]! / i.financing.targetDscrP90) : Infinity))
    .reduce((a, x) => Math.min(a, x), Infinity);
  const loanCap = i.financing.maxGearing * b.sourcesUses.totalUses;
  const loanOk =
    D === 0 ||
    (sculpted ? headroom >= 1 - 1e-6 && (Math.abs(headroom - 1) < 1e-6 || Math.abs(D - loanCap) < 0.5) : Math.abs(Math.max(0, Math.min(D * headroom, loanCap)) - D) <= 0.5);
  const RESOLVE = "Re-solve the financing on the website";

  rows.push(text("Pasted solution still fits (otherwise download the workbook again from the website)", "section"));
  check(
    "loan",
    "Loan: the DSCR targets and the gearing cap give the pasted loan",
    status(
      (c) =>
        `IF(${c.k("d.debt")}=0,TRUE,IF(${c.k("in.repayment")}="sculpted",AND(${c.k("d.minHeadroom")}>=1-${c.k("k.tiny")},OR(ABS(${c.k("d.minHeadroom")}-1)<${c.k("k.tiny")},ABS(${c.k("d.debt")}-${c.k("d.loanCap")})<${c.k("k.debtTol")})),ABS(${c.k("d.loanCalc")}-${c.k("d.debt")})<=${c.k("k.debtTol")}))`,
      RESOLVE,
    ),
    loanOk ? OK : RESOLVE,
    "error",
    "tolerance €0.50, as the website's solver; without a loan the check cannot scale one — re-solve on the website after a change",
  );
  check("usesBase", "Total uses (base): the funding need adds up to the pasted uses", status((c) => `ABS(${c.k("c.base.uses")}-${c.k("sol.usesBase")})<=${c.k("k.debtTol")}`, RESOLVE), OK, "error");
  check("usesDown", "Total uses (downside): the funding need adds up to the pasted uses", status((c) => `ABS(${c.k("c.down.uses")}-${c.k("sol.usesDown")})<=${c.k("k.debtTol")}`, RESOLVE), OK, "error");
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
    "error",
  );
  const bool = (c: Ctx, id: string) => `OR(${c.k(id)}=TRUE,${c.k(id)}=FALSE)`;
  check(
    "switches",
    "Switches hold one of their listed values",
    status(
      (c) =>
        `AND(OR(${c.k("in.legalForm")}="KG",${c.k("in.legalForm")}="GmbH"),OR(${c.k("in.postEeg")}="market",${c.k("in.postEeg")}="ppa"),` +
        `OR(${c.k("in.bankBasis")}="floor",${c.k("in.bankBasis")}="base"),` +
        `OR(${c.k("in.repayment")}="linear",${c.k("in.repayment")}="annuity",${c.k("in.repayment")}="sculpted"),` +
        `${bool(c, "in.south")},${bool(c, "in.twoSided")},${bool(c, "in.municipalAfter")},${bool(c, "in.equityFirst")},${bool(c, "in.degressive")})`,
      "A switch has a value the formulas do not know",
    ),
    OK,
    "error",
    "KG / GmbH, market / ppa, floor / base, linear / annuity / sculpted, TRUE / FALSE",
  );

  rows.push(blank(), text("Calculation", "section"));
  check("sources", "Sources equal uses (base)", status((c) => `ABS(${c.k("c.base.uses")}-${c.k("c.base.debt")}-${c.k("c.base.equity")})<1`, "Sources ≠ uses"), OK, "error");
  check(
    "repaid",
    "Loan repaid by the last instalment",
    status((c) => `ABS(INDEX(${c.range("d.close")},MATCH(MIN(${c.k("t.maturityYear")},${c.k("t.lastYear")}),${c.range("t.year")},0)))<1`, "Loan not repaid"),
    Math.abs(b.annual.find((a) => a.year === Math.min(new Date(Date.parse(b.timeline.loanMaturity)).getUTCFullYear(), b.annual.at(-1)!.year))?.debtClosing ?? 0) < 1 ? OK : "Loan not repaid",
    "error",
  );
  check("loanLife", "Loan matures before the end of the operating life", status((c) => `${c.k("t.maturity")}<${c.k("t.end")}`, "Loan runs beyond the operating life"), engine("loanWithinLifetime", "Loan runs beyond the operating life"), "error");
  check(
    "gearing",
    "Gearing within the maximum (base)",
    status((c) => `${c.k("r.base.gearing")}<=${c.k("in.maxGearing")}+${c.k("k.tiny")}`, "Gearing above the maximum"),
    b.kpis.gearing <= i.financing.maxGearing + 1e-6 ? OK : "Gearing above the maximum",
    "error",
  );
  for (const sc of SCENARIOS) {
    const r = e.runs[sc];
    const bsMax = Math.max(...r.trace!.statements.difference.map(Math.abs));
    check(
      `balance.${sc}`,
      `${SC_LABEL[sc]}: balance sheet balances every year`,
      status((c) => `MAX(MAX(${c.range(`b.${sc}.check`)}),-MIN(${c.range(`b.${sc}.check`)}))<1`, "Balance sheet does not balance"),
      bsMax < 1 ? OK : "Balance sheet does not balance",
      "error",
    );
  }

  rows.push(blank(), text("Funding and covenant", "section"));
  for (const sc of SCENARIOS) {
    const r = e.runs[sc];
    const minCash = Math.min(0, ...r.annual.map((a) => a.cashDeficit));
    check(
      `cash.${sc}`,
      `${SC_LABEL[sc]}: the company never runs out of cash, the final year included`,
      status((c) => `MIN(${c.range(`w.${sc}.deficitOut`)})>-1`, "Cash shortfall: returns not meaningful"),
      minCash > -1 ? OK : "Cash shortfall: returns not meaningful",
      "error",
    );
    check(
      `covenant.${sc}`,
      `${SC_LABEL[sc]}: DSCR at or above the covenant every year`,
      status((c) => `IF(COUNT(${c.k(`r.${sc}.minDscr`)})=0,TRUE,${c.k(`r.${sc}.minDscr`)}>=${c.k("in.covenant")}-${c.k("k.tiny")})`, "Covenant breached"),
      r.kpis.minDscr === null || r.kpis.minDscr >= i.financing.covenantDscr - 1e-6 ? OK : "Covenant breached",
      "error",
    );
  }
  check("lockUp", "Base: no year with distributions held back (lock-up)", status((c) => `SUM(${c.range("w.base.lockUp")})=0`, "Distributions held back"), engine("noLockUp", "Distributions held back"), "warning");

  rows.push(blank(), text("Model scope", "section"));
  check("awardValid", "Commissioning before the award lapses (§ 36e EEG)", status((c) => `${c.k("t.cod")}<=${c.k("t.awardLapse")}`, "Award lapsed: outside the model's scope"), engine("awardValid", "Award lapsed: outside the model's scope"), "error");
  check("noPenalty", "Commissioning within 30 months of the award (§ 55 EEG; the penalty is not modelled)", status((c) => `${c.k("t.cod")}<=${c.k("t.penaltyDate")}`, "A § 55 penalty applies"), engine("noPenalty", "A § 55 penalty applies"), "warning");
  check("tenorSupport", "Loan matures before the EEG support ends", status((c) => `${c.k("t.maturity")}<${c.k("t.eegEnd")}`, "The loan outlasts the support period"), engine("tenorWithinSupport", "The loan outlasts the support period"), "warning");
  check(
    "interestBarrier",
    "Interest below the € 3 m threshold of the interest barrier (§ 4h EStG is not modelled)",
    status((c) => `MAX(${c.range("d.interest")})<${c.k("k.interestBarrier")}`, "The interest barrier may apply"),
    engine("interestBarrier", "The interest barrier may apply"),
    "warning",
  );
  check(
    "bookEquity",
    "Base: book equity stays positive (otherwise § 30 GmbHG / § 172 (4) HGB may limit distributions)",
    status((c) => `MIN(${c.range("b.base.equity")})>-1`, "Negative book equity"),
    engine("bookEquity", "Negative book equity"),
    "warning",
  );

  rows.push(blank(), text("Inputs outside the usual assumptions", "section"));
  check("awardCeiling", "Award price within the tender ceiling", status((c) => `${c.k("in.award")}<=${c.k("in.ceiling")}+${c.k("k.tiny")}`, "Award above the ceiling"), engine("awardWithinCeiling", "Award above the ceiling"), "warning");
  check("awardBeforeClose", "Award announced before financial close", status((c) => `${c.k("in.awardNotice")}<=${c.k("t.fc")}`, "Award announced after financial close"), engine("awardBeforeClose", "Award announced after financial close"), "warning");
  check(
    "hebesatz",
    "Trade-tax multiplier at or above the legal minimum (280 % from 2027)",
    status((c) => `OR(${c.k("t.lastYear")}<${c.k("k.minHebesatzFrom")},${c.k("in.hebesatz")}>=${c.k("k.minHebesatz")}-${c.k("k.tiny")})`, "Below the legal minimum"),
    engine("hebesatzMinimum", "Below the legal minimum"),
    "warning",
  );
  check(
    "degressive",
    "Declining-balance depreciation allowed (completion 1 Jul 2025 – 31 Dec 2027)",
    status((c) => `OR(${c.k("in.degressive")}=FALSE,AND(${c.k("t.cod")}>=${c.k("k.degStart")},${c.k("t.cod")}<=${c.k("k.degEnd")}))`, "Not allowed for this commissioning date"),
    engine("degressiveEligible", "Not allowed for this commissioning date"),
    "warning",
  );
  check(
    "kfw",
    "Loan term and grace years match a KfW 270 variant",
    // The variant is the first row whose term is not shorter than the loan's; beyond the table there is none.
    status(
      (c) => `IFERROR(${c.k("in.grace")}<=INDEX(${c.table("tab.kfw", 1)},COUNTIF(${c.table("tab.kfw", 0)},"<"&${c.k("in.tenor")})+1),FALSE)`,
      "No KfW 270 variant",
    ),
    engine("kfwTerms", "No KfW 270 variant"),
    "warning",
    "the KfW 270 variants are on the Inputs sheet",
  );
  check(
    "kfwDrawdown",
    "Construction within the longest KfW drawdown period (12 months, extendable by up to 24)",
    status((c) => `${c.k("in.construction")}<=${c.k("k.kfwDrawdownMax")}`, "Longer than any KfW drawdown period"),
    i.project.constructionMonths <= 36 ? OK : "Longer than any KfW drawdown period",
    "warning",
  );

  const expected = (ids: string[]) => ids.map((id) => rows.find((r): r is Extract<Row, { kind: "scalar" }> => r.kind === "scalar" && r.id === id)!.v);
  const errorsOk = expected(errors).every((v) => v === OK);
  const warningCount = expected(warnings).filter((v) => v !== OK).length;
  rows.push(blank());
  rows.push(
    scalar("chk.master", "All checks (errors)", (c) => `IF(AND(${errors.map((id) => `${c.k(id)}="${OK}"`).join(",")}),"${OK}","See the checks above")`, errorsOk ? OK : "See the checks above", {
      role: "check",
    }),
    scalar("chk.warnings", "Warnings among the checks above (they do not stop the model)", (c) => warnings.map((id) => `(${c.k(id)}<>"${OK}")`).join("+"), warningCount, {
      role: "check",
      fmt: "int",
    }),
  );
  return { name: "Checks", rows, widths: [64, 12, 40, 44], freeze: { rows: 4, cols: 1 }, tabColor: "FFC00000" };
}

// ---------------------------------------------------------------------------------------------
// Scenarios: the workbook's results next to the website's
// ---------------------------------------------------------------------------------------------

type Run = Env["base"];
/** The website shows the owners' returns as n.m. when the company runs out of cash (D01). */
const nm = (r: Run, v: number | null): number | string | null => (r.validity.shortfall === null ? v : "n.m.");
const KPI_ROWS: { id: string; label: string; fmt: Fmt; get: (r: Run) => number | string | null }[] = [
  { id: "irr", label: "Equity IRR", fmt: "pct2", get: (r) => nm(r, r.kpis.equityIrr) },
  { id: "npv", label: "Equity NPV (€)", fmt: "int", get: (r) => nm(r, r.kpis.npvEquity) },
  { id: "pirrPost", label: "Project IRR after tax", fmt: "pct2", get: (r) => r.kpis.projectIrrPostTax },
  { id: "pirrPre", label: "Project IRR before tax", fmt: "pct2", get: (r) => r.kpis.projectIrrPreTax },
  { id: "npvProject", label: "Project NPV (€)", fmt: "int", get: (r) => r.kpis.npvProject },
  { id: "lcoeReal", label: "LCOE real (ct/kWh)", fmt: "dec2", get: (r) => r.kpis.lcoeRealCt },
  { id: "lcoeNominal", label: "LCOE nominal (ct/kWh)", fmt: "dec2", get: (r) => r.kpis.lcoeNominalCt },
  { id: "minDscr", label: "Minimum DSCR", fmt: "ratio", get: (r) => r.kpis.minDscr },
  { id: "avgDscr", label: "Average DSCR (repayment years)", fmt: "ratio", get: (r) => r.kpis.avgDscr },
  { id: "llcr", label: "LLCR", fmt: "ratio", get: (r) => r.kpis.llcr },
  { id: "payback", label: "Payback (years from COD)", fmt: "dec2", get: (r) => r.kpis.paybackYears },
  { id: "uses", label: "Total uses (€)", fmt: "int", get: (r) => r.sourcesUses.totalUses },
  { id: "equityIn", label: "Equity (€)", fmt: "int", get: (r) => r.kpis.equity },
  { id: "gearing", label: "Gearing", fmt: "pct2", get: (r) => r.kpis.gearing },
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
        const v = kpi.get(e.runs[s]);
        return { v: v === null ? "n/a" : v, fmt: kpi.fmt, f: (c: Ctx) => c.k(`r.${s}.${kpi.id}`), role: "link" as const };
      }),
      ...SCENARIOS.map((s) => {
        const v = kpi.get(e.runs[s]);
        return { v: v === null ? "n/a" : v, fmt: kpi.fmt, role: "snapshot" as const };
      }),
    ]),
  });
  rows.push(blank(), text("The loan and every instalment are the base case's in all four scenarios — the lender's view after financial close.", "note"));
  rows.push(text("P90 1-yr: one-year P90 output in every year (the lender's stress). P90 10-yr: ten-year P90 output with the § 36h review.", "note"));
  rows.push(text("Downside: ten-year P90 output, power prices −20 %, fixed opex and grid fee +10 %, capex +5 % paid by the owners, with the § 36h review.", "note"));
  rows.push(text("n.m.: not meaningful — the company runs out of cash, so the owners' return is not shown (the Results sheet keeps the arithmetic). n/a: no loan, no DSCR.", "note"));
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
    { id: "lcoeRealCt", label: "LCOE (ct/kWh)", fmt: "dec2" },
  ];
  rows.push(text("Computed by the website at download, with the loan re-sized for every bar (the view before financial close). Values, not formulas.", "note"));
  rows.push(text("n.m.: the run runs out of cash or fails a calculation check, so its equity IRR is not meaningful. n/a: the measure does not exist (no loan, no DSCR).", "note"));
  const snap = (v: number | null, fmt: Fmt, missing: string) => ({ v: v === null ? missing : v, fmt, role: "snapshot" as const });
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
        snap(bar.low, m.fmt, m.id === "equityIrr" ? "n.m." : "n/a"),
        { v: bar.highLabel, role: "snapshot" as const },
        snap(bar.high, m.fmt, m.id === "equityIrr" ? "n.m." : "n/a"),
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
      cell("Lowest bid that reaches the target return (ct/kWh, two decimals as in a bid)", b.target?.awardPriceCt ?? "not reachable", "dec2"),
      cell("Lowest financeable bid: funded, covenant met, award valid (ct/kWh)", b.feasible?.awardPriceCt ?? "not financeable", "dec2"),
      cell("AW at the financeable bid (ct/kWh)", b.feasible ? b.feasible.awCt : "n/a", "dec2"),
      cell("Equity IRR at the financeable bid", b.feasible?.equityIrr ?? "n/a", "pct2"),
      cell("Within the tender ceiling", b.admissible === null ? "n/a" : b.admissible ? "yes" : "no"),
      cell("Tender ceiling of the inputs (ct/kWh)", b.ceilingCt, "dec2"),
      cell(
        "Search",
        `grid of ${b.stepCt} ct, then bisection inside the first step that qualifies; the answer is the lowest two-decimal price that qualifies, re-run at that price (searched up to ${b.searchedUpToCt} ct)`,
      ),
    ],
  });
  rows.push(blank(), text("Equity IRR by award price (loan re-sized; n.m.: the case runs out of cash)", "section"));
  rows.push({
    kind: "table",
    id: "tab.curve",
    head: ["Award price (ct/kWh)", "Equity IRR"],
    rows: x.curve.map((p) => [
      { v: p.x, fmt: "dec2" as const, role: "snapshot" as const },
      { v: p.y === null ? "n.m." : p.y, fmt: "pct2" as const, role: "snapshot" as const },
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

export function readmeSheet(e: Env, t: Messages, pageUrl: string, status: string, warnings: number): SheetDef {
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
    ["What you can change here", "section"],
    ["Valuation only — cost of equity, nominal WACC, real WACC: the NPVs and the LCOE follow; the loan and the checks are not affected.", "text"],
    [
      "Everything else on the Inputs sheet that is not marked as structure — yield, prices, costs, tax, fees, DSCR targets, gearing: every formula follows with the pasted loan kept, as a lender would see it after financial close. If the Checks sheet then says “Re-solve the financing on the website”, the loan no longer fits the targets: make the same change on the website and download again.",
      "text",
    ],
    ["Structure — financial close, construction period, operating life, loan term, grace years, repayment: download a new workbook. The period columns and the loan calendar depend on them.", "text"],
    ["Purple cells are the website's solution and blue-grey cells its results at download: do not edit them. Switches accept only their listed values.", "text"],
    ["", "text"],
    ["Colour code", "section"],
    ["Blue on yellow: inputs. Black: formulas. Green: links to another sheet. Purple: solved on the website — do not edit. Blue-grey: website results at download.", "text"],
    ["", "text"],
    ["Sheets", "section"],
    ["Inputs · Timing · Construction (monthly) · Operations · Tax · Debt (annual and monthly) · Waterfall · Statements · Results · Checks · Scenarios · Sensitivities · Sources", "text"],
    ["Every period sheet has the years in the same columns; column E holds opening values. One formula per row, copied across.", "text"],
    ["Printing: the period sheets print at 70 % across several pages, with the labels (columns A–B) and the header rows repeated on each page; the other sheets fit the page width.", "text"],
    ["", "text"],
    ["Conventions", "section"],
    ["Amounts in nominal euros. Construction by month, operations by calendar year with cash flows on 31 December; IRR and NPV use the exact dates (Act/365, XIRR/XNPV).", "text"],
    ["Inputs are the website's, rounded to 0.001 of their unit; results may differ from an unrounded website run by fractions of a euro. Numbers show two decimals where more would only add zeros; the cells keep full precision.", "text"],
    ["Cash available to equity is before legal limits on distributions (§ 30 GmbHG, § 172 (4) HGB). The wind farm is fictional; the results are illustrative.", "text"],
  ];
  const rows: Row[] = lines.map(([txt, role]) => text(txt, role));
  rows.push(
    blank(),
    scalar("readme.status", "Status of all checks (errors)", (c) => c.k("chk.master"), status, { role: "check" }),
    scalar("readme.warnings", "Warnings (see the Checks sheet)", (c) => c.k("chk.warnings"), warnings, { role: "check", fmt: "int" }),
  );
  return { name: "Readme", rows, widths: [150, 10, 14] };
}
