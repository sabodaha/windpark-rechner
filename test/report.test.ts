// The PDF report: its texts come from the model, its tables add up, and the published PDF matches the code that
// made it. The PDF itself is printed by a browser (scripts/pdf/render.ts), which a unit test cannot do.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dependencyFiles, dependencyHash, inspectPdf, type PdfManifest } from "../scripts/pdf/deps";
import { buildReportData, equityByYear, keep, lifetimeTotals, SLIDE_COUNT, SLIDE_NAMES, withArticle } from "../src/components/report/data";
import { BASE_CASE, DATA_AS_OF, ENGINE_VERSION, hashInputs, runScenarios, SOURCES } from "../src/engine";
import { modelExtras } from "../src/lib/extras";
import { PATHS } from "../src/lib/site";

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

describe("published PDF", () => {
  const manifest = JSON.parse(readFileSync(join(root, "scripts", "pdf", "manifest.json"), "utf8")) as PdfManifest;
  const file = join(root, "public", ...PATHS.reportPdf.split("/").filter(Boolean));
  const stale = "The PDF report is out of date: print it again with  npm run build && npm run report:pdf";

  it("is the file the manifest describes", () => {
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(createHash("sha256").update(bytes).digest("hex"), stale).toBe(manifest.sha256);
    expect(bytes.length).toBe(manifest.bytes);
    expect(bytes.length).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(inspectPdf(bytes)).toEqual({ pages: SLIDE_COUNT, tagged: true, outline: true });
  });

  it("was printed from the current model, inputs and slides", () => {
    expect(manifest.file).toBe(PATHS.reportPdf);
    expect(manifest.engineVersion, stale).toBe(ENGINE_VERSION);
    expect(manifest.dataAsOf, stale).toBe(DATA_AS_OF);
    expect(manifest.inputHash, stale).toBe(hashInputs(BASE_CASE));
    expect(manifest.dependencies, stale).toBe(dependencyFiles(root).length);
    expect(manifest.dependencyHash, stale).toBe(dependencyHash(root));
  });
});
