// Workbook sheets: Waterfall, Statements and Results.
import type { ModelResult, ScenarioName } from "@/engine";
import { SCENARIOS } from "@/engine";
import { COLS_PERIOD, cumulative, MONEY, SC_LABEL, xd, type Env } from "./common";
import { blank, period, scalar, text, type Ctx, type Row, type SheetDef } from "./grid";
import type { CellValue, Fmt } from "./ooxml";

/** Construction block of a scenario: the downside pays a capex overrun, the others share the base. */
export const consBlock = (sc: ScenarioName) => (sc === "downside" ? "down" : "base");
const taxLevered = (sc: ScenarioName) => sc;
const taxUnlevered = (sc: ScenarioName) => `${sc}U`;

// ---------------------------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------------------------

export function waterfallSheet(e: Env): SheetDef {
  const { N } = e;
  const rows: Row[] = [];
  const tiny = 1e-6;
  for (const sc of SCENARIOS) {
    const run: ModelResult = e.runs[sc];
    const W = run.trace!.waterfall;
    const t = e.base.trace!.timing;
    const pre = `w.${sc}`;
    const P = (id: string, label: string, f: (c: Ctx) => string, values: CellValue[], opts: Parameters<typeof period>[5] = {}) =>
      rows.push(period(`${pre}.${id}`, label, N, f, values, opts));
    const R = (c: Ctx, id: string) => c.r(`${pre}.${id}`);
    const pr = (c: Ctx, id: string) => c.p(`${pre}.${id}`);

    // Intermediate cash positions, as the formulas compute them.
    const cash0 = W.cfads.map((cf, y) => cf - W.debtService[y]! + W.deficitIn[y]!);
    const cash1 = cash0.map((c, y) => c + W.trappedUsed[y]!);
    const cash2 = cash1.map((c, y) => c - W.dsraTopUp[y]! + W.dsraRelease[y]!);
    const cash3 = cash2.map((c, y) => c + W.dsraDraw[y]!);
    const windowCount = t.reserveWindow.filter(Boolean).length;
    const leftOpen: number[] = [];
    const leftClose: number[] = [];
    let left = windowCount;
    t.reserveWindow.forEach((win) => {
      leftOpen.push(left);
      if (win && left > 0) left -= 1;
      leftClose.push(left);
    });
    const reserveOpen = W.reserveClose.map((_, y) => (y === 0 ? 0 : W.reserveClose[y - 1]!));
    const decomCost = run.annual[N - 1]!.decommissioningPaid;
    const planned = leftOpen.map((l, y) => (l > 0 ? (decomCost - reserveOpen[y]!) / l : 0));
    const cash4 = cash3.map((c, y) => c - W.reserveContribution[y]!);
    const dscr = W.cfads.map((cf, y) => (W.debtService[y]! > tiny ? cf / W.debtService[y]! : ""));
    const trappedPrev = W.trappedClose.map((_, y) => (y === 0 ? 0 : W.trappedClose[y - 1]!));
    const trappedAfterUse = trappedPrev.map((tp, y) => tp - W.trappedUsed[y]!);
    const cash5 = cash4.map((c, y) => c - W.trappedAdded[y]! + W.trappedReleased[y]!);
    const dsraPre = W.dsraOpen.map((d, y) => d + W.dsraTopUp[y]! - W.dsraRelease[y]! - W.dsraDraw[y]!);
    const reservePre = reserveOpen.map((r, y) => r + W.reserveContribution[y]! - W.decommissioningPaid[y]!);
    const trappedPre = trappedAfterUse.map((tp, y) => tp + W.trappedAdded[y]! - W.trappedReleased[y]!);
    const cash6 = cash5.map((c, y) => c + W.finalRelease[y]!);
    const ops = run.trace!.operations;
    const projectPre = run.annual.map((a) => a.projectCashFlowPreTax);
    const projectPost = run.annual.map((a) => a.projectCashFlowPostTax);

    rows.push(blank(), text(SC_LABEL[sc], "section"));
    P("cfads", "CFADS", (c) => c.r(`tx.${taxLevered(sc)}.cfads`), W.cfads, { unit: "€", fmt: MONEY, role: "link" });
    P("ds", "Debt service", (c) => c.r("d.ds"), W.debtService, { unit: "€", fmt: MONEY, role: "link" });
    P("deficitIn", "Unpaid cash from the year before", (c) => pr(c, "deficitOut"), W.deficitIn, { unit: "€", fmt: MONEY });
    P("cash0", "Cash after debt service", (c) => `${R(c, "cfads")}-${R(c, "ds")}+${R(c, "deficitIn")}`, cash0, { unit: "€", fmt: MONEY });
    P(
      "trappedUsed",
      "Cash held back under the lock-up, used for a shortfall",
      (c) => `IF(AND(${R(c, "cash0")}<0,${pr(c, "trappedClose")}>0),MIN(${pr(c, "trappedClose")},-${R(c, "cash0")}),0)`,
      W.trappedUsed,
      { unit: "€", fmt: MONEY },
    );
    P("cash1", "Cash after that", (c) => `${R(c, "cash0")}+${R(c, "trappedUsed")}`, cash1, { unit: "€", fmt: MONEY });
    rows.push(
      period(`${pre}.dsraOpen`, "DSRA at the start", N, (c) => pr(c, "dsraClose"), W.dsraOpen, { unit: "€", fmt: MONEY }),
    );
    P("dsraTarget", "DSRA target", (c) => c.r("d.dsraTarget"), W.dsraTarget, { unit: "€", fmt: MONEY, role: "link" });
    P(
      "topUp",
      "DSRA top-up from surplus cash",
      (c) => `IF(${R(c, "dsraTarget")}>${R(c, "dsraOpen")},MIN(${R(c, "dsraTarget")}-${R(c, "dsraOpen")},MAX(0,${R(c, "cash1")})),0)`,
      W.dsraTopUp,
      { unit: "€", fmt: MONEY },
    );
    P("release", "DSRA release above the target", (c) => `IF(${R(c, "dsraTarget")}>${R(c, "dsraOpen")},0,${R(c, "dsraOpen")}-${R(c, "dsraTarget")})`, W.dsraRelease, { unit: "€", fmt: MONEY });
    P("cash2", "Cash after DSRA top-up and release", (c) => `${R(c, "cash1")}-${R(c, "topUp")}+${R(c, "release")}`, cash2, { unit: "€", fmt: MONEY });
    P(
      "draw",
      "DSRA drawn for a shortfall",
      (c) => `IF(${R(c, "cash2")}<0,MIN(${R(c, "dsraOpen")}+${R(c, "topUp")}-${R(c, "release")},-${R(c, "cash2")}),0)`,
      W.dsraDraw,
      { unit: "€", fmt: MONEY },
    );
    P("cash3", "Cash after the DSRA", (c) => `${R(c, "cash2")}+${R(c, "draw")}`, cash3, { unit: "€", fmt: MONEY });
    rows.push(
      period(`${pre}.leftOpen`, "Reserve instalments still to pay", N, (c) => pr(c, "leftClose"), leftOpen, { fmt: "int" }),
      period(`${pre}.reserveOpen`, "Decommissioning reserve at the start", N, (c) => pr(c, "reserveClose"), reserveOpen, { unit: "€", fmt: MONEY, open: { v: 0 } }),
    );
    P(
      "planned",
      "Planned reserve instalment",
      (c) => `IF(${R(c, "leftOpen")}>0,(${c.k("t.decomCost")}-${R(c, "reserveOpen")})/${R(c, "leftOpen")},0)`,
      planned,
      { unit: "€", fmt: MONEY },
    );
    P(
      "contribution",
      "Paid into the reserve",
      (c) =>
        `IF(AND(${c.r("t.reserveWindow")}=1,${R(c, "leftOpen")}>0),IF(${c.r("t.isLast")}=1,${c.k("t.decomCost")}-${R(c, "reserveOpen")},MIN(MAX(0,${R(c, "cash3")}),${R(c, "planned")})),0)`,
      W.reserveContribution,
      { unit: "€", fmt: MONEY },
    );
    P("leftClose", "Reserve instalments left", (c) => `${R(c, "leftOpen")}-IF(AND(${c.r("t.reserveWindow")}=1,${R(c, "leftOpen")}>0),1,0)`, leftClose, {
      fmt: "int",
      open: { f: (c) => `SUM(${c.range("t.reserveWindow")})`, v: windowCount },
    });
    P("cash4", "Cash after the reserve", (c) => `${R(c, "cash3")}-${R(c, "contribution")}`, cash4, { unit: "€", fmt: MONEY });
    P("decomPaid", "Decommissioning paid", (c) => `IF(${c.r("t.isLast")}=1,${c.k("t.decomCost")},0)`, W.decommissioningPaid, { unit: "€", fmt: MONEY });
    P("dscr", "DSCR", (c) => `IF(${R(c, "ds")}>=${c.k("k.dsMin")},${R(c, "cfads")}/${R(c, "ds")},"")`, dscr, { fmt: "ratio", role: "total" });
    P(
      "lockUp",
      "Lock-up (1 = distributions held back)",
      (c) => `IF(${R(c, "ds")}>=${c.k("k.dsMin")},IF(AND(${R(c, "cfads")}/${R(c, "ds")}<${c.k("in.lockup")},${c.r("t.year")}<=${c.k("t.maturityYear")}),1,0),0)`,
      W.lockUp,
      { fmt: "int" },
    );
    P("trappedAfterUse", "Cash held back, after use for a shortfall", (c) => `${pr(c, "trappedClose")}-${R(c, "trappedUsed")}`, trappedAfterUse, { unit: "€", fmt: MONEY });
    P("trappedAdded", "Held back this year", (c) => `IF(AND(${R(c, "lockUp")}=1,${R(c, "cash4")}>0),${R(c, "cash4")},0)`, W.trappedAdded, { unit: "€", fmt: MONEY });
    P("trappedReleased", "Released after a lock-up", (c) => `IF(AND(${R(c, "lockUp")}=0,${R(c, "trappedAfterUse")}>0),${R(c, "trappedAfterUse")},0)`, W.trappedReleased, { unit: "€", fmt: MONEY });
    P("cash5", "Cash after the lock-up", (c) => `${R(c, "cash4")}-${R(c, "trappedAdded")}+${R(c, "trappedReleased")}`, cash5, { unit: "€", fmt: MONEY });
    P("dsraPre", "DSRA before the final release", (c) => `${R(c, "dsraOpen")}+${R(c, "topUp")}-${R(c, "release")}-${R(c, "draw")}`, dsraPre, { unit: "€", fmt: MONEY });
    P("reservePre", "Reserve before the final release", (c) => `${R(c, "reserveOpen")}+${R(c, "contribution")}-${R(c, "decomPaid")}`, reservePre, { unit: "€", fmt: MONEY });
    P("trappedPre", "Cash held back before the final release", (c) => `${R(c, "trappedAfterUse")}+${R(c, "trappedAdded")}-${R(c, "trappedReleased")}`, trappedPre, { unit: "€", fmt: MONEY });
    P("finalRelease", "Released in the final year", (c) => `IF(${c.r("t.isLast")}=1,${R(c, "dsraPre")}+${R(c, "trappedPre")}+${R(c, "reservePre")},0)`, W.finalRelease, { unit: "€", fmt: MONEY });
    P("cash6", "Cash at the year end", (c) => `${R(c, "cash5")}+${R(c, "finalRelease")}`, cash6, { unit: "€", fmt: MONEY });
    P("dsraClose", "DSRA at the year end", (c) => `IF(${c.r("t.isLast")}=1,0,${R(c, "dsraPre")})`, W.dsraClose, {
      unit: "€",
      fmt: MONEY,
      open: { f: (c) => c.k("d.dsra0"), v: e.runs[sc].sourcesUses.dsraInitial },
    });
    P("reserveClose", "Decommissioning reserve at the year end", (c) => `IF(${c.r("t.isLast")}=1,0,${R(c, "reservePre")})`, W.reserveClose, { unit: "€", fmt: MONEY });
    rows.push(
      period(`${pre}.trappedClose`, "Cash held back at the year end", N, (c) => `IF(${c.r("t.isLast")}=1,0,${R(c, "trappedPre")})`, W.trappedClose, { unit: "€", fmt: MONEY, open: { v: 0 } }),
      period(`${pre}.deficitOut`, "Unpaid cash at the year end (shortfall; no payments by the owners)", N, (c) => `IF(${R(c, "cash6")}>=0,0,${R(c, "cash6")})`, W.deficitOut, { unit: "€", fmt: MONEY, open: { v: 0 } }),
    );
    P(
      "distribution",
      "Cash available to equity (before legal limits on distributions)",
      (c) => `IF(${R(c, "cash6")}>=0,${R(c, "cash6")},0)`,
      W.distribution,
      { unit: "€", fmt: MONEY, role: "total" },
    );
    P(
      "projectPre",
      "Project cash flow before tax",
      (c) => `${c.r(`o.${sc}.ebitda`)}-${c.r(`o.${sc}.deltaWc`)}-${R(c, "decomPaid")}`,
      projectPre,
      { unit: "€", fmt: MONEY },
    );
    P("projectPost", "Project cash flow after tax (taxes without debt)", (c) => `${R(c, "projectPre")}-${c.r(`tx.${taxUnlevered(sc)}.taxes`)}`, projectPost, { unit: "€", fmt: MONEY });
    void ops;
  }
  return { name: "Waterfall", rows, widths: COLS_PERIOD(N), freeze: { rows: 4, cols: 5 }, periods: e.years, tabColor: "FF808080" };
}

// ---------------------------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------------------------

export function statementsSheet(e: Env): SheetDef {
  const { N } = e;
  const rows: Row[] = [];
  for (const sc of SCENARIOS) {
    const run = e.runs[sc];
    const S = run.trace!.statements;
    const tx = run.trace!.tax;
    const pre = `b.${sc}`;
    const P = (id: string, label: string, f: (c: Ctx) => string, values: CellValue[], opts: Parameters<typeof period>[5] = {}) =>
      rows.push(period(`${pre}.${id}`, label, N, f, values, opts));
    const R = (c: Ctx, id: string) => c.r(`${pre}.${id}`);
    const netIncome = tx.ebt.map((x, y) => x - tx.taxes[y]!);
    const blk = consBlock(sc);
    rows.push(blank(), text(SC_LABEL[sc], "section"));
    P("netIncome", "Net income", (c) => `${c.r(`tx.${sc}.ebt`)}-${c.r(`tx.${sc}.taxes`)}`, netIncome, { unit: "€", fmt: MONEY });
    rows.push(
      period(`${pre}.cumDep`, "Depreciation to date", N, (c) => `${c.p(`${pre}.cumDep`)}+${c.r(`tx.${sc}.dep`)}`, cumulative(tx.depreciation), { unit: "€", fmt: MONEY, open: { v: 0 } }),
      period(`${pre}.cumIncome`, "Net income to date", N, (c) => `${c.p(`${pre}.cumIncome`)}+${R(c, "netIncome")}`, S.cumulativeNetIncome, { unit: "€", fmt: MONEY, open: { v: 0 } }),
      period(`${pre}.cumDist`, "Cash to equity to date", N, (c) => `${c.p(`${pre}.cumDist`)}+${c.r(`w.${sc}.distribution`)}`, S.cumulativeDistributions, { unit: "€", fmt: MONEY, open: { v: 0 } }),
    );
    P("fixed", "Wind farm (book value)", (c) => `${c.k(`c.${blk}.capitalized`)}-${R(c, "cumDep")}`, S.fixedAssets, { unit: "€", fmt: MONEY });
    P("receivables", "Receivables", (c) => c.r(`o.${sc}.receivables`), S.receivables, { unit: "€", fmt: MONEY, role: "link" });
    P("dsra", "Debt service reserve", (c) => c.r(`w.${sc}.dsraClose`), S.dsra, { unit: "€", fmt: MONEY, role: "link" });
    P("reserve", "Decommissioning reserve", (c) => c.r(`w.${sc}.reserveClose`), S.reserve, { unit: "€", fmt: MONEY, role: "link" });
    P("trapped", "Cash held back", (c) => c.r(`w.${sc}.trappedClose`), S.trapped, { unit: "€", fmt: MONEY, role: "link" });
    P("deficit", "Unpaid cash (negative)", (c) => c.r(`w.${sc}.deficitOut`), S.cashDeficit, { unit: "€", fmt: MONEY, role: "link" });
    P("assets", "Total assets", (c) => `${R(c, "fixed")}+${R(c, "receivables")}+${R(c, "dsra")}+${R(c, "reserve")}+${R(c, "trapped")}+${R(c, "deficit")}`, S.totalAssets, { unit: "€", fmt: MONEY, role: "total" });
    P("debt", "Senior loan", (c) => c.r("d.close"), S.debt, { unit: "€", fmt: MONEY, role: "link" });
    P("provision", "Decommissioning provision", (c) => `IF(${c.r("t.isLast")}=1,0,${c.r("tx.provision")})`, S.provision, { unit: "€", fmt: MONEY });
    rows.push(scalar(`${pre}.equityIn`, "Equity paid in", (c) => c.k(`c.${blk}.equity`), S.equityContributed, { unit: "€", fmt: MONEY, role: "link" }));
    P("equity", "Book equity (model balance sheet, not an HGB test)", (c) => `${c.k(`${pre}.equityIn`)}-${R(c, "cumDist")}+${R(c, "cumIncome")}`, S.bookEquity, { unit: "€", fmt: MONEY, role: "total" });
    P("check", "Check: assets − loan − provision − equity", (c) => `${R(c, "assets")}-${R(c, "debt")}-${R(c, "provision")}-${R(c, "equity")}`, S.difference, { unit: "€", fmt: MONEY });
  }
  return { name: "Statements", rows, widths: COLS_PERIOD(N), freeze: { rows: 4, cols: 5 }, periods: e.years, tabColor: "FF808080" };
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

export function resultsSheet(e: Env): SheetDef {
  const { N, M, i } = e;
  const F = 1 + M + N;
  const rows: Row[] = [];
  const base = e.base;
  const C = M;
  const idx = Array.from({ length: F }, (_, k) => k);
  const fc = xd(i.project.financialClose);
  const dates = [fc, ...base.construction.map((m) => xd(m.date)), ...base.annual.map((a) => xd(a.cashFlowDate))];
  const helper = (y: number) => {
    // Price index (2026 = 1) of a construction-month year, from the Timing helper table.
    let ix = 1;
    for (let yy = 2026; yy <= y; yy++) ix *= 1 + (i.macro.inflation.find((x) => x.year === yy)?.value ?? i.macro.longRunInflation);
    for (let yy = 2025; yy > y; yy--) ix /= 1 + (i.macro.inflation.find((x) => x.year === yy + 1)?.value ?? i.macro.longRunInflation);
    return ix;
  };
  const infl2026 = i.macro.inflation.find((x) => x.year === 2026)?.value ?? i.macro.longRunInflation;
  const yearOf = (serial: number) => new Date((serial - 25569) * 86_400_000).getUTCFullYear();
  const deflator = idx.map((k) => (k <= C ? helper(yearOf(dates[k]!)) / (1 + infl2026) : base.trace!.timing.index2026[k - C - 1]!));
  const dfReal = dates.map((d) => Math.pow(1 + i.macro.waccReal, (d - fc) / 365));
  const dfNom = dates.map((d) => Math.pow(1 + i.macro.waccNominal, (d - fc) / 365));

  rows.push(text("Dated cash flows (financial close, construction months, operating years)", "section"));
  rows.push(period("r.idx", "Flow number", F, undefined, idx, { fmt: "int", role: "calc" }));
  rows.push(
    period(
      "r.date",
      "Date",
      F,
      (c) => `IF(${c.r("r.idx")}=0,${c.k("t.fc")},IF(${c.r("r.idx")}<=${c.k("in.construction")},EDATE(${c.k("t.fc")},${c.r("r.idx")})-1,INDEX(${c.range("t.cfDate")},${c.r("r.idx")}-${c.k("in.construction")})))`,
      dates,
      { fmt: "date", open: { f: (c) => c.k("t.fc"), v: fc } },
    ),
  );
  rows.push(
    period(
      "r.deflator",
      "Price index (2026 = 1) for real LCOE",
      F,
      (c) =>
        `IF(${c.r("r.idx")}<=${c.k("in.construction")},INDEX(${c.table("tab.index", 1)},MATCH(YEAR(${c.r("r.date")}),${c.table("tab.index", 0)},0))/${c.k("t.idx2026")},INDEX(${c.range("t.index2026")},${c.r("r.idx")}-${c.k("in.construction")}))`,
      deflator,
      { fmt: "dec6" },
    ),
    period("r.dfReal", "Discount factor, real WACC", F, (c) => `(1+${c.k("in.waccReal")})^((${c.r("r.date")}-${c.k("t.fc")})/${c.k("k.daysPerYear")})`, dfReal, { fmt: "dec6" }),
    period("r.dfNom", "Discount factor, nominal WACC", F, (c) => `(1+${c.k("in.waccNominal")})^((${c.r("r.date")}-${c.k("t.fc")})/${c.k("k.daysPerYear")})`, dfNom, { fmt: "dec6" }),
  );

  for (const sc of SCENARIOS) {
    const run = e.runs[sc];
    const k = run.kpis;
    const blk = consBlock(sc);
    const pre = `r.${sc}`;
    const P = (id: string, label: string, f: (c: Ctx) => string, values: CellValue[], opts: Parameters<typeof period>[5] = {}) =>
      rows.push(period(`${pre}.${id}`, label, F, f, values, opts));
    const R = (c: Ctx, id: string) => c.r(`${pre}.${id}`);
    const pick = (c: Ctx, month: string, year: string) =>
      `IF(${c.r("r.idx")}=0,0,IF(${c.r("r.idx")}<=${c.k("in.construction")},${month},${year}))`;
    const atMonth = (c: Ctx, id: string) => `INDEX(${c.range(id)},${c.r("r.idx")})`;
    const atYear = (c: Ctx, id: string) => `INDEX(${c.range(id)},${c.r("r.idx")}-${c.k("in.construction")})`;
    const cm = run.construction;
    const equityFlow = [0, ...cm.map((m) => -m.equityDraw), ...run.annual.map((a) => a.distribution)];
    const preFlow = [0, ...cm.map((m) => -m.capex - m.workingCapitalFunding), ...run.annual.map((a) => a.projectCashFlowPreTax)];
    const postFlow = [0, ...cm.map((m) => -m.capex - m.workingCapitalFunding), ...run.annual.map((a) => a.projectCashFlowPostTax)];
    const cost = [0, ...cm.map((m) => m.capex), ...run.annual.map((a) => a.opex - a.municipalRefund + a.decommissioningPaid)];
    const kwh = [0, ...cm.map(() => 0), ...run.annual.map((a) => a.energySoldKwh)];
    // Payback: cumulative flow, the first crossing of zero and the date it happens (linear within the step).
    const cum = cumulative(equityFlow);
    const cross = equityFlow.map((a, j) => {
      const before = j === 0 ? 0 : cum[j - 1]!;
      return before < 0 && cum[j]! >= 0 && a > 0 ? 1 : 0;
    });
    const crossCount = cumulative(cross);
    const first = cross.map((x, j) => (x === 1 && (j === 0 ? 0 : crossCount[j - 1]!) === 0 ? 1 : 0));
    const crossDate = first.map((f, j) => {
      if (f !== 1) return 0;
      const prevDate = j === 0 ? fc : dates[j - 1]!;
      const before = j === 0 ? 0 : cum[j - 1]!;
      return prevDate + ((dates[j]! - prevDate) * -before) / equityFlow[j]!;
    });

    rows.push(blank(), text(SC_LABEL[sc], "section"));
    P("equity", "Owners' cash flow", (c) => pick(c, `-${atMonth(c, `c.${blk}.equityDraw`)}`, atYear(c, `w.${sc}.distribution`)), equityFlow, { unit: "€", fmt: MONEY });
    P(
      "pre",
      "Project cash flow before tax",
      (c) => pick(c, `-${atMonth(c, `c.${blk}.capex`)}-${atMonth(c, `c.${blk}.wc`)}`, atYear(c, `w.${sc}.projectPre`)),
      preFlow,
      { unit: "€", fmt: MONEY },
    );
    P(
      "post",
      "Project cash flow after tax",
      (c) => pick(c, `-${atMonth(c, `c.${blk}.capex`)}-${atMonth(c, `c.${blk}.wc`)}`, atYear(c, `w.${sc}.projectPost`)),
      postFlow,
      { unit: "€", fmt: MONEY },
    );
    P(
      "cost",
      "LCOE costs: capex, opex net of the § 6 refund, decommissioning",
      (c) => pick(c, atMonth(c, `c.${blk}.capex`), `${atYear(c, `o.${sc}.opex`)}-${atYear(c, `o.${sc}.refund`)}+${atYear(c, `w.${sc}.decomPaid`)}`),
      cost,
      { unit: "€", fmt: MONEY },
    );
    P("kwh", "LCOE output: output sold", (c) => pick(c, "0", atYear(c, `o.${sc}.sold`)), kwh, { unit: "kWh", fmt: MONEY });
    rows.push(
      period(`${pre}.cum`, "Owners' cash flow to date", F, (c) => `${c.p(`${pre}.cum`)}+${R(c, "equity")}`, cum, { unit: "€", fmt: MONEY, open: { v: 0 } }),
    );
    P("cross", "Turns non-negative here (1 = yes)", (c) => `IF(AND(${c.p(`${pre}.cum`)}<0,${R(c, "cum")}>=0,${R(c, "equity")}>0),1,0)`, cross, { fmt: "int" });
    rows.push(period(`${pre}.crossCount`, "Crossings to date", F, (c) => `${c.p(`${pre}.crossCount`)}+${R(c, "cross")}`, crossCount, { fmt: "int", open: { v: 0 } }));
    P("first", "First crossing (1 = yes)", (c) => `IF(AND(${R(c, "cross")}=1,${c.p(`${pre}.crossCount`)}=0),1,0)`, first, { fmt: "int" });
    P(
      "crossDate",
      "Date the cumulative flow reaches zero",
      (c) => `IF(${R(c, "first")}=1,${c.p("r.date")}+(${c.r("r.date")}-${c.p("r.date")})*(-${c.p(`${pre}.cum`)})/${R(c, "equity")},0)`,
      crossDate,
      { fmt: "date" },
    );
    const S = (id: string, label: string, f: (c: Ctx) => string, v: CellValue, fmt: Fmt, unit = "") =>
      rows.push(scalar(`${pre}.${id}`, label, f, v, { fmt, unit, role: "total" }));
    rows.push(scalar(`${pre}.guess`, "Start value for XIRR (the website's result)", undefined, k.equityIrr ?? 0.05, { fmt: "pct2", role: "snapshot" }));
    rows.push(scalar(`${pre}.guessPre`, "Start value for the project XIRR before tax (website)", undefined, k.projectIrrPreTax ?? 0.05, { fmt: "pct2", role: "snapshot" }));
    rows.push(scalar(`${pre}.guessProject`, "Start value for the project XIRR after tax (website)", undefined, k.projectIrrPostTax ?? 0.05, { fmt: "pct2", role: "snapshot" }));
    const irr = (v: number | null) => (v === null ? "n/a" : v);
    // XIRR starts with the first construction month: a leading zero flow at financial close derails Excel's XIRR.
    // Excel's XIRR can also stop at a value that is no root (2.98E-09 without a start value), and it can fail from a
    // start value right at the root (−16.8 % in a stress case) while converging from 0.01 below it. So it tries the
    // website's result, then that result ∓ k.guessStep, then the two fixed start values of the Inputs sheet; a try
    // counts only if the NPV changes sign within ± k.irrEps of its result (Excel stops within about 1E-08, so a real
    // root always passes).
    const xirr = (c: Ctx, flows: string, guess: string) => {
      const v = c.range(flows, 1);
      const d = c.range("r.date", 1);
      const eps = c.k("k.irrEps");
      // The NPV is summed directly: Excel's XNPV rejects a negative rate.
      const npvAt = (rate: string) => `SUMPRODUCT(${v}/(1+${rate})^((${d}-MIN(${d}))/${c.k("k.daysPerYear")}))`;
      // A try that is no root becomes an error, so the next try is written once and the formula grows linearly.
      const attempt = (g: string, next: string) => {
        const r = `XIRR(${v},${d},${g})`;
        return `IFERROR(IF(${npvAt(`${r}-${eps}`)}*${npvAt(`${r}+${eps}`)}<=0,${r},NA()),${next})`;
      };
      const g = c.k(guess);
      const step = c.k("k.guessStep");
      const starts = [g, `${g}-${step}`, `${g}+${step}`, c.k("k.guessLow"), c.k("k.guessHigh")];
      return starts.reduceRight((next, start) => attempt(start, next), `"n/a"`);
    };
    // Returns are not meaningful when the company runs out of cash (D01): the headline cells say n.m., as on the
    // website, and the rows "as calculated" keep the arithmetic for review.
    const funded = run.validity.shortfall === null;
    rows.push(
      scalar(
        `${pre}.funded`,
        "Funding: the company never runs out of cash (otherwise the owners' returns are n.m.)",
        (c) => `IF(MIN(${c.range(`w.${sc}.deficitOut`)})>-1,"funded","not funded")`,
        funded ? "funded" : "not funded",
        { role: "check" },
      ),
    );
    const gate = (c: Ctx, id: string) => `IF(${c.k(`${pre}.funded`)}="funded",${c.k(`${pre}.${id}`)},"n.m.")`;
    S("irr", "Equity IRR", (c) => gate(c, "irrCalc"), funded ? irr(k.equityIrr) : "n.m.", "pct2");
    S("npv", "Equity NPV at the cost of equity, at financial close", (c) => gate(c, "npvCalc"), funded ? k.npvEquity : "n.m.", MONEY, "€");
    S("pirrPre", "Project IRR before tax", (c) => xirr(c, `${pre}.pre`, `${pre}.guessPre`), irr(k.projectIrrPreTax), "pct2");
    S("pirrPost", "Project IRR after tax", (c) => xirr(c, `${pre}.post`, `${pre}.guessProject`), irr(k.projectIrrPostTax), "pct2");
    S("npvProject", "Project NPV at the nominal WACC", (c) => `XNPV(${c.k("in.waccNominal")},${c.range(`${pre}.post`)},${c.range("r.date")})`, k.npvProject, MONEY, "€");
    S(
      "lcoeReal",
      "LCOE, real 2026 money (in the style of Fraunhofer ISE)",
      (c) => `SUMPRODUCT(${c.range(`${pre}.cost`)}/${c.range("r.deflator")}/${c.range("r.dfReal")})/SUMPRODUCT(${c.range(`${pre}.kwh`)}/${c.range("r.dfReal")})*100`,
      k.lcoeRealCt,
      "dec2",
      "ct/kWh",
    );
    S(
      "lcoeNominal",
      "LCOE, nominal",
      (c) => `SUMPRODUCT(${c.range(`${pre}.cost`)}/${c.range("r.dfNom")})/SUMPRODUCT(${c.range(`${pre}.kwh`)}/${c.range("r.dfNom")})*100`,
      k.lcoeNominalCt,
      "dec2",
      "ct/kWh",
    );
    // Without debt service (no loan) there is no DSCR or LLCR: "n/a", as on the website.
    S("minDscr", "Minimum DSCR", (c) => `IF(COUNT(${c.range(`w.${sc}.dscr`)})=0,"n/a",MIN(${c.range(`w.${sc}.dscr`)}))`, k.minDscr ?? "n/a", "ratio");
    S(
      "minDscrYear",
      "Year of the minimum DSCR",
      (c) => `IFERROR(INDEX(${c.range("t.year")},MATCH(${c.k(`${pre}.minDscr`)},${c.range(`w.${sc}.dscr`)},0)),"n/a")`,
      k.minDscrYear ?? "n/a",
      "year",
    );
    S("avgDscr", "Average DSCR over the repayment years", (c) => `IFERROR(AVERAGEIFS(${c.range(`w.${sc}.dscr`)},${c.range("d.principal")},">0"),"n/a")`, k.avgDscr ?? "n/a", "ratio");
    S(
      "llcr",
      "LLCR at COD (reserves not counted)",
      (c) =>
        `IF(${c.k("d.debt")}=0,"n/a",SUMPRODUCT(${c.range("t.loanShare")}*${c.range(`tx.${sc}.cfads`)}/(1+${c.k("in.rate")})^((${c.range("t.llcrDate")}-${c.k("t.cod")})/${c.k("k.daysPerYear")}))/${c.k("d.debt")})`,
      k.llcr ?? "n/a",
      "ratio",
    );
    S(
      "payback",
      "Payback: years from COD until the owners' cumulative cash flow turns positive",
      (c) => `IF(SUM(${c.range(`${pre}.first`)})=0,"n/a",MAX(0,(SUM(${c.range(`${pre}.crossDate`)})-${c.k("t.cod")})/${c.k("k.paybackYear")}))`,
      k.paybackYears === null ? "n/a" : k.paybackYears,
      "dec2",
      "years",
    );
    S("uses", "Total uses", (c) => c.k(`c.${blk}.uses`), run.sourcesUses.totalUses, MONEY, "€");
    S("equityIn", "Equity paid in", (c) => c.k(`c.${blk}.equity`), k.equity, MONEY, "€");
    S("gearing", "Gearing (loan ÷ total uses)", (c) => `${c.k("d.debt")}/${c.k(`${pre}.uses`)}`, k.gearing, "pct2");
    rows.push(
      scalar(`${pre}.irrCalc`, "Equity IRR as calculated, whether funded or not (XIRR, checked to be a root)", (c) => xirr(c, `${pre}.equity`, `${pre}.guess`), irr(k.equityIrr), { fmt: "pct2" }),
      scalar(`${pre}.npvCalc`, "Equity NPV as calculated, whether funded or not", (c) => `XNPV(${c.k("in.coe")},${c.range(`${pre}.equity`)},${c.range("r.date")})`, k.npvEquity, { fmt: MONEY, unit: "€" }),
    );
  }
  return {
    name: "Results",
    rows,
    widths: [46, 13, 16, 12, 14, ...Array(F).fill(12)],
    freeze: { rows: 4, cols: 5 },
    periods: idx,
    periodFmt: "int",
    tabColor: "FF2F75B5",
  };
}
