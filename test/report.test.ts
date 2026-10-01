// The PDF report: its texts come from the model, its tables add up, and the published PDF matches the code that
// made it. The PDF itself is printed by a browser (scripts/pdf/render.ts), which a unit test cannot do.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dependencyFiles, dependencyHash, inspectPdf, pdfText, readInfo, reportFingerprint, setInfo, type PdfManifest } from "../scripts/pdf/deps";
import {
  buildReportData,
  equityByYear,
  keep,
  lifetimeTotals,
  roundToTotal,
  SLIDE_COUNT,
  SLIDE_NAMES,
  statusOf,
  withArticle,
  type ReportData,
} from "../src/components/report/data";
import { BASE_CASE, DATA_AS_OF, ENGINE_VERSION, hashInputs, runScenarios, SOURCES, type Inputs, type ModelResult, type ScenarioName } from "../src/engine";
import { modelExtras, type ModelExtras } from "../src/lib/extras";
import { pageMetadata } from "../src/lib/metadata";
import { PATHS, SITE } from "../src/lib/site";
import { en } from "../src/messages/en";

const root = fileURLToPath(new URL("..", import.meta.url));
const results = runScenarios(BASE_CASE);
const d = buildReportData(BASE_CASE, results, modelExtras(BASE_CASE), true);
const base = results.base;

describe("report texts", () => {
  it("has a name for each of the 18 slides and an action title for each content slide", () => {
    expect(SLIDE_NAMES).toHaveLength(SLIDE_COUNT);
    expect(Object.keys(d.titles)).toHaveLength(SLIDE_COUNT - 1);
    for (const [id, title] of Object.entries(d.titles)) {
      expect(title.length, id).toBeGreaterThan(20);
      expect(title, id).not.toMatch(/NaN|undefined|Infinity|null|n\/a/);
    }
    for (const line of d.summary) expect(line).not.toMatch(/NaN|undefined|Infinity|null|n\/a/);
  });

  it("states the base case's numbers", () => {
    expect(d.titles.summary).toContain("4.79 ct/kWh");
    expect(d.titles.summary).toContain("an 8% cost of equity");
    expect(d.titles.financing).toContain("€20.6m");
    expect(d.titles.eeg).toContain("no premium");
    expect(d.facts.firstTaxYear).toBe(2044);
  });

  it("numbers the sources in the order of the sources list", () => {
    expect(d.cite("bnetza2608")).toBe("S1");
    expect(d.cite("kfw270", "bnetza2608", "kfw270", "assumption")).toBe("S1, S9");
    expect(d.sourceKeys).toEqual(Object.keys(SOURCES));
  });

  it("uses the right article before a percentage", () => {
    expect(["8%", "7%", "11.5%", "110%", "18%", "1.5%", "80%"].map(withArticle)).toEqual([
      "an 8%",
      "a 7%",
      "an 11.5%",
      "a 110%",
      "an 18%",
      "a 1.5%",
      "an 80%",
    ]);
  });

  it("keeps dates, units and section signs on one line", () => {
    expect(keep("repaid by 31 Dec 2046")).toBe("repaid by 31 Dec 2046");
    expect(keep("an award of 4.79 ct/kWh")).toBe("an award of 4.79 ct/kWh");
    expect(keep("Municipal payment (§ 6 EEG)")).toBe("Municipal payment (§ 6 EEG)");
  });
});

// Light extras for text tests: no tornado, no bid search.
const NO_EXTRAS: ModelExtras = {
  tornado: { equityIrr: [], projectIrrPostTax: [], minDscr: [], lcoeRealCt: [] },
  bid: { target: null, feasible: null, admissible: null, ceilingCt: 7.35, searchedUpToCt: 15, stepCt: 0.25, toleranceCt: 0.0005 },
  bidTarget: 0.08,
  curve: [],
};
const caseOf = (fn: (c: Inputs) => void): ReportData => {
  const c = structuredClone(BASE_CASE);
  fn(c);
  return buildReportData(c, runScenarios(c), NO_EXTRAS, false);
};
const texts = (r: ReportData) => [...Object.values(r.titles), ...r.summary];
const clean = (r: ReportData) => {
  for (const t of texts(r)) expect(t).not.toMatch(/NaN|undefined|Infinity|null|n\/a|−?0\.0%.*against −?0\.0%/);
};

describe("report conclusions outside the base case (R17)", () => {
  it("no loan: no DSCR, no leverage claim, the reason named", () => {
    const r = caseOf((c) => void (c.financing.maxGearing = 0));
    clean(r);
    expect(r.titles.financing).toBe("No loan: the gearing cap is 0%, so the owners fund all " + r.titles.financing.split("fund all ")[1]);
    expect(r.titles.dscr).toMatch(/^No loan, so no debt service/);
    expect(r.titles.timeline).toMatch(/the case has no loan$/);
    expect(r.summary[1]).toMatch(/^No loan: the gearing cap is 0%/);
    expect(r.summary[2]).toMatch(/^Without a loan the owners earn the project’s return/);
  });

  it("not funded: the year cash runs out, and no claim about leverage", () => {
    const r = caseOf((c) => {
      c.opex.decommissioningCostPerKw2026 = 100;
      c.opex.decommissioningReserveYears = 1;
    });
    clean(r);
    const year = r.results.base.validity.shortfall!.year;
    expect(r.titles.summary).toContain(`the company runs out of cash in ${year}`);
    expect(r.titles.returns).toBe(`The company runs out of cash in ${year}: the owners’ returns are not meaningful`);
    expect(r.summary[2]).toMatch(/^The company runs out of cash in \d{4}, so the owners’ return — and what debt does to it — is not meaningful\.$/);
    expect(statusOf(r.results.base).text).toBe(`Not funded (${year})`);
  });

  it("a failed calculation check is not called a shortage of cash", () => {
    const results = runScenarios(BASE_CASE);
    const broken: ModelResult = { ...results.base, validity: { ...results.base.validity, integrity: "error", returnsMeaningful: false } };
    const r = buildReportData(BASE_CASE, { ...results, base: broken } as Record<ScenarioName, ModelResult>, NO_EXTRAS, false);
    clean(r);
    expect(r.titles.summary).toContain("a calculation check fails");
    expect(r.titles.returns).toMatch(/^A calculation check fails/);
    for (const t of texts(r)) expect(t).not.toMatch(/runs out of cash/);
    expect(statusOf(broken).text).toBe("Calculation check failed");
  });

  it("two-sided premium: paid back, not insurance", () => {
    const r = caseOf((c) => void (c.revenue.twoSidedPremium = true));
    clean(r);
    expect(r.facts.paidBackYears.base).toBeGreaterThan(0);
    expect(r.titles.eeg).toMatch(/^With the two-sided premium the farm earns the AW/);
    expect(r.summary[0]).toContain(`it pays back the difference to the market value in ${r.facts.paidBackYears.base} of`);
    expect(r.summary[0]).not.toMatch(/insurance/);
  });

  it("a lapsed award is outside the model's scope", () => {
    const r = caseOf((c) => {
      c.revenue.awardNoticeDate = "2023-01-01";
      c.revenue.ceilingPriceCt = 8;
    });
    expect(statusOf(r.results.base).text).toBe("Award lapsed (§ 36e)");
  });

  it("names what limits the loan", () => {
    expect(d.facts.bindingLabel).toMatch(/^P90 \(1-year\) DSCR target/);
    const none = caseOf((c) => {
      c.revenue.longTermBaseEurMwh2026 = 20;
      c.revenue.awardPriceCt = 2;
    });
    expect(none.results.base.sizing.binding).toBe("cashflow");
    expect(none.titles.financing).toMatch(/^No loan: the lender’s case has a year without cash for debt service/);
  });
});

describe("numbers in every title (R18)", () => {
  it("slides 4, 8, 17 and 18 carry their numbers, and slide 8 adds up", () => {
    for (const id of ["assumptions", "risks", "methodology", "construction"] as const) expect(d.titles[id], id).toMatch(/\d/);
    expect(d.titles.assumptions).toMatch(/^\d+ inputs drive the answer: \d+ from public sources, \d+ documented assumptions$/);
    const m = d.titles.construction.match(/€(\d+\.\d)m/g)!.map((x) => Number(x.slice(1, -1)));
    const [total, capex, financing, reserves, debt, equity] = m as [number, number, number, number, number, number];
    expect(Math.round((capex + financing + reserves) * 10)).toBe(Math.round(total * 10));
    expect(Math.round((debt + equity) * 10)).toBe(Math.round(total * 10));
    expect(reserves).toBeGreaterThan(1);
  });

  it("rounds a table's lines to its total", () => {
    // The reviewer's case: 98.5 − 4.1 + 0.5 printed for a CFADS of 94.8.
    expect(roundToTotal([98.46, -4.14, 0.45], 1, 94.77)).toEqual([98.5, -4.1, 0.4]);
    for (const [parts, total] of [
      [[1.25, 2.25, 3.5], 7],
      [[0.333, 0.333, 0.334], 1],
      [[-1.05, 2.05, 10.449], 11.449],
    ] as [number[], number][]) {
      const r = roundToTotal(parts, 1, total);
      expect(Math.round(r.reduce((s, x) => s + x, 0) * 10)).toBe(Math.round(total * 10));
      r.forEach((x, n) => expect(Math.abs(x - parts[n]!)).toBeLessThan(0.1 + 1e-9));
    }
  });
});

describe("report tables", () => {
  it("the lifetime waterfall adds up", () => {
    const L = lifetimeTotals(base);
    expect(L.ebitda).toBeCloseTo(L.revenue - L.opex + L.municipalRefund, 2);
    expect(L.cfads).toBeCloseTo(L.ebitda - L.taxes - L.deltaWorkingCapital, 2);
    // Funded without shortfalls, the only reserve left to release is the debt service reserve funded at COD.
    expect(L.reservesReleased).toBeCloseTo(base.sourcesUses.dsraInitial, 2);
    expect(L.equityInvested).toBeCloseTo(base.sourcesUses.equity, 2);
  });

  it("the owners' cash flows by year add up", () => {
    const flows = equityByYear(base);
    const total = base.annual.reduce((s, a) => s + a.distribution, 0) - base.sourcesUses.equity;
    expect(flows.at(-1)!.cumulative).toBeCloseTo(total, 2);
    expect(flows.map((f) => f.year)).toEqual([...new Set(flows.map((f) => f.year))].sort());
  });

  it("the opex groups on the chart cover every opex line", () => {
    for (const a of base.annual) {
      const groups =
        a.maintenance + a.lease + (a.management + a.insurance + a.otherOpex) + (a.directMarketing + a.municipal) + (a.guaranteeFee + a.gridFee);
      expect(groups).toBeCloseTo(a.opex, 4);
    }
  });
});

describe("page titles (mutation M17)", () => {
  it("social cards carry the same title as the page: the layout's template", () => {
    const m = pageMetadata({ title: en.report.title, description: "x", path: PATHS.report });
    expect(m.title).toBe(en.report.title);
    expect((m.openGraph as { title?: string }).title).toBe(`${en.report.title} — ${SITE.name}`);
    expect((m.twitter as { title?: string }).title).toBe(`${en.report.title} — ${SITE.name}`);
  });
});

describe("published PDF", () => {
  const manifest = JSON.parse(readFileSync(join(root, "scripts", "pdf", "manifest.json"), "utf8")) as PdfManifest;
  const file = join(root, "public", ...PATHS.reportPdf.split("/").filter(Boolean));
  const stale = "The PDF report is out of date: print it again with  npm run build && npm run report:pdf";

  it("is the file the manifest describes", () => {
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(createHash("sha256").update(bytes).digest("hex"), stale).toBe(manifest.sha256);
    expect(bytes.length).toBe(manifest.bytes);
    expect(bytes.length).toBeLessThanOrEqual(1024 * 1024);
    expect(inspectPdf(bytes)).toEqual({ pages: SLIDE_COUNT, tagged: true, outline: true });
  });

  it("names its author, subject and keywords, and embeds real fonts", () => {
    const bytes = readFileSync(file);
    const info = readInfo(bytes);
    // The page title as the layout's template writes it ("%s — Igor Sabodakha").
    expect(info.Title).toBe(`${en.report.title} — ${SITE.name}`);
    expect(info.Author).toBe(SITE.name);
    expect(info.Subject).toMatch(/not investment, tax or legal advice/);
    expect(info.Keywords).toMatch(/project finance/);
    // Static Inter, embedded as a real font; only text with a halo (a stroke) is still drawn as Type 3 glyphs.
    const text = Buffer.from(bytes).toString("latin1");
    expect(/\/BaseFont\s*\/[A-Z]{6}\+Inter-Regular/.test(text)).toBe(true);
    expect((text.match(/\/Subtype\s*\/Type3/g) ?? []).length).toBeLessThanOrEqual(8);
  });

  it("rewrites the document information without breaking the cross-references", () => {
    const objects = ["1 0 obj\n<</Title <FEFF0041>\n/Creator (x \\(y\\))>>\nendobj\n", "2 0 obj\n<</Type /Catalog>>\nendobj\n"];
    let pdf = "%PDF-1.4\n";
    const offsets = objects.map((o) => {
      const at = pdf.length;
      pdf += o;
      return at;
    });
    const xref = pdf.length;
    pdf += `xref\n0 3\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    pdf += `trailer\n<</Size 3\n/Root 2 0 R\n/Info 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
    const out = setInfo(new Uint8Array(Buffer.from(pdf, "latin1")), { Author: "Igor Sabodakha", Subject: "Ä § €" });
    expect(readInfo(out)).toEqual({ Title: "A", Author: "Igor Sabodakha", Subject: "Ä § €", Creator: "x (y)" });
    expect(pdfText("€")).toBe("<FEFF20AC>");
  });

  it("was printed from the current model, inputs and slides", () => {
    expect(manifest.file).toBe(PATHS.reportPdf);
    expect(manifest.engineVersion, stale).toBe(ENGINE_VERSION);
    expect(manifest.dataAsOf, stale).toBe(DATA_AS_OF);
    expect(manifest.inputHash, stale).toBe(hashInputs(BASE_CASE));
    expect(manifest.dependencies, stale).toBe(dependencyFiles(root).length);
    expect(manifest.dependencyHash, stale).toBe(dependencyHash(root));
    expect(manifest.contentHash, stale).toBe(reportFingerprint(d));
    expect(manifest.browser).toMatch(/\d+\.\d+/);
  });
});
