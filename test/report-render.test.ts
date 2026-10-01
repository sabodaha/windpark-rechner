// The report's slides rendered to HTML, as the browser prints them: the numbers in their tables and tiles must be
// the engine's. A wrong field in a cell (mutation M16) or a swapped word in a title (M15) fails here.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildReportData, irrText, npvText } from "../src/components/report/data";
import { Report } from "../src/components/report/Report";
import { BASE_CASE, runScenarios, type Inputs } from "../src/engine";
import { modelExtras } from "../src/lib/extras";
import { ct, eurCompact, keur, meur, pct, ratio } from "../src/lib/format";

const render = (inputs: Inputs, isBase: boolean) => {
  const results = runScenarios(inputs);
  const d = buildReportData(inputs, results, modelExtras(inputs), isBase);
  const html = renderToStaticMarkup(createElement(Report, { d }));
  return { d, html, results };
};
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "’").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** The value cell of the table row whose label is `label` (or starts with it, when it ends in "…"). */
const cell = (raw: string, label: string): string | undefined => {
  const html = raw.replace(/\u00a0/g, " ");
  const prefix = label.endsWith("…");
  const at = html.indexOf(prefix ? `>${label.slice(0, -1)}` : `>${label}</th>`);
  if (at < 0) return undefined;
  const m = /<td[^>]*>([\s\S]*?)<\/td>/.exec(html.slice(at));
  return m ? decode(m[1]!.replace(/<[^>]+>/g, "")) : undefined;
};

describe("report slides against the engine", () => {
  const { d, html, results } = render(BASE_CASE, true);
  const b = results.base;
  const k = b.kpis;

  it("renders 18 slides with every action title", () => {
    expect(html.match(/class="report-slide"/g)).toHaveLength(18);
    const text = decode(html).replace(/\u00a0/g, " ");
    for (const title of Object.values(d.titles)) expect(text).toContain(title);
  });

  it("the summary tiles show the base case's results", () => {
    const text = decode(html.replace(/<[^>]+>/g, "|"));
    for (const v of [irrText(b), pct(k.projectIrrPostTax, 1), npvText(b), ct(k.lcoeRealCt), ratio(k.minDscr), meur(k.debt)]) expect(text).toContain(`|${v}|`);
  });

  it("the tables carry the engine's numbers", () => {
    expect(cell(html, "Average DSCR over the repayment years")).toBe(ratio(k.avgDscr));
    expect(cell(html, "Debt service reserve (…")).toBe(eurCompact(b.sourcesUses.dsraInitial));
    expect(cell(html, "Lowest cash balance")).toBe("never negative");
    expect(cell(html, "Equity IRR (KG…")).toBe(irrText(b, 2));
    expect(cell(html, "Project IRR, pre-tax / after tax")).toBe(`${pct(k.projectIrrPreTax, 2)} / ${pct(k.projectIrrPostTax, 2)}`);
    expect(cell(html, "Total uses")).toBe(keur(b.sourcesUses.totalUses));
    expect(cell(html, "Anzulegender Wert (the EEG floor)")).toBe(ct(k.awCt));
    expect(cell(html, "Loan")).toBe(meur(k.debt, 2));
  });

  it("the summary title says below or above the cost of equity the right way round", () => {
    expect(k.equityIrr!).toBeLessThan(BASE_CASE.macro.costOfEquity);
    expect(d.titles.summary).toMatch(/— below an 8% cost of equity$/);
    const rich = render(
      (() => {
        const c = structuredClone(BASE_CASE);
        c.revenue.awardPriceCt = 9;
        c.revenue.longTermBaseEurMwh2026 = 110;
        return c;
      })(),
      false,
    );
    expect(rich.results.base.kpis.equityIrr!).toBeGreaterThan(BASE_CASE.macro.costOfEquity);
    expect(rich.d.titles.summary).toMatch(/— above an 8% cost of equity$/);
  });
});
