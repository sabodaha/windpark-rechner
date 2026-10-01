// The formula workbook: the model rebuilt with live spreadsheet formulas from one snapshot. The website solves the
// loan, the total uses and — for a sculpted loan — the principal per year; the workbook takes them as pasted values
// and calculates everything else. Check rows show whether the pasted solution still fits after a change.
import { buildSnapshot, type Inputs, type ModelSnapshot } from "@/engine";
import { modelExtras, type ModelExtras } from "@/lib/extras";
import { FIELDS, withField } from "@/lib/fields";
import type { Messages } from "@/messages/en";
import { makeEnv } from "./common";
import { Grid, type ManifestEntry } from "./grid";
import { buildWorkbookXlsx } from "./ooxml";
import { constructionSheet, inputsSheet, timingSheet } from "./sheets-inputs";
import { debtSheet, operationsSheet, taxSheet } from "./sheets-calc";
import { checksSheet, readmeSheet, scenariosSheet, sensitivitiesSheet, sourcesSheet } from "./sheets-report";
import { resultsSheet, statementsSheet, waterfallSheet } from "./sheets-results";

export type WorkbookExtras = ModelExtras;

/**
 * Inputs rounded as the workbook stores them: to 0.001 of the unit shown (0.001 %-points for percentages). The
 * website computes the workbook's snapshot from these, so the formulas reproduce it to the cent.
 */
export function canonicalInputs(inputs: Inputs): Inputs {
  let out = structuredClone(inputs);
  for (const f of FIELDS) {
    if (f.virtual || f.kind !== "number") continue;
    const v = f.get(out);
    if (typeof v !== "number") continue;
    const scale = f.scale ?? 1;
    const shown = Math.round(v * scale * 1000) / 1000;
    const stored = shown / scale;
    if (stored !== v) out = withField(out, f, Number(stored.toPrecision(15)));
  }
  return out;
}

/** The website's tornado, bid calculator and IRR curve for the Sensitivities sheet. */
export const workbookExtras = modelExtras;

const mw = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
/** Sheet titles; the Readme names the turbines of the inputs, not the base case's. */
const titles = (i: Inputs): Record<string, { title: string; subtitle: string }> => ({
  Readme: {
    title: "Wind Farm Investment Calculator — formula workbook",
    subtitle: `Fictional wind farm “Musterhöhe” · ${i.project.turbines} × ${mw.format(i.project.turbineMw)} MW · Hesse, Germany`,
  },
  Inputs: { title: "Inputs", subtitle: "Blue on yellow: inputs you may change. Purple: solved on the website — do not edit." },
  Timing: { title: "Timing", subtitle: "Dates, operating days, support shares, price index and loan calendar by calendar year" },
  Construction: { title: "Construction", subtitle: "By month: capex, VAT bridge, fees, interest during construction and funding" },
  Operations: { title: "Operations", subtitle: "Energy, prices, EEG premium, operating costs and receivables by case" },
  Tax: { title: "Tax", subtitle: "Depreciation, decommissioning provision, trade tax and corporate tax by case" },
  Debt: { title: "Debt", subtitle: "Senior loan: annual schedule, lender's sizing check, and the loan by month" },
  Waterfall: { title: "Waterfall", subtitle: "From CFADS to the cash available to equity, by case" },
  Statements: { title: "Statements", subtitle: "Model balance sheet by case (not audited HGB accounts)" },
  Results: { title: "Results", subtitle: "Dated cash flows, returns, LCOE and cover ratios by case" },
  Checks: { title: "Checks", subtitle: "Does the pasted financing still fit, and do the accounts close?" },
  Scenarios: { title: "Scenarios", subtitle: "The workbook's results next to the website's" },
  Sensitivities: { title: "Sensitivities", subtitle: "Tornado and bid calculator of the website, as values" },
  Sources: { title: "Sources", subtitle: "Public sources behind the inputs" },
});

export interface FormulaWorkbook {
  bytes: Uint8Array;
  manifest: ManifestEntry[];
  scalars: Record<string, string>;
  snapshot: ModelSnapshot;
}

/** Builds the workbook for a snapshot of canonical inputs. */
export function buildFormulaWorkbook(
  snapshot: ModelSnapshot,
  extras: WorkbookExtras,
  t: Messages,
  pageUrl: string,
  opts: { withoutCache?: boolean } = {},
): FormulaWorkbook {
  const grid = new Grid();
  const e = makeEnv(snapshot, grid);
  const checks = checksSheet(e);
  const value = (id: string) => {
    const row = checks.rows.find((r) => r.kind === "scalar" && r.id === id);
    return row && row.kind === "scalar" ? row.v : undefined;
  };
  const defs = [
    readmeSheet(e, t, pageUrl, String(value("chk.master") ?? "OK"), Number(value("chk.warnings") ?? 0)),
    inputsSheet(e),
    timingSheet(e),
    constructionSheet(e),
    operationsSheet(e),
    taxSheet(e),
    debtSheet(e),
    waterfallSheet(e),
    statementsSheet(e),
    resultsSheet(e),
    checks,
    scenariosSheet(e),
    sensitivitiesSheet(e, extras, t),
    sourcesSheet(),
  ];
  for (const d of defs) grid.add(d);
  const { sheets, manifest, scalars } = grid.render(titles(snapshot.inputs));
  const bytes = buildWorkbookXlsx({
    sheets,
    props: {
      title: "Wind Farm Investment Calculator",
      subject: t.header.disclaimer,
      creator: "Igor Sabodakha",
      keywords: `engine ${snapshot.engineVersion}; inputs ${snapshot.inputHash}; data ${snapshot.dataAsOf}`,
      description: "Project-finance model of a fictional onshore wind farm in Germany, with live formulas.",
      created: snapshot.dataAsOf,
    },
    headerText: `Wind Farm Investment Calculator · ${t.header.disclaimer}`,
    footerText: `Fictional wind farm · data as of ${snapshot.dataAsOf} · engine ${snapshot.engineVersion} · inputs ${snapshot.inputHash}`,
    withoutCache: opts.withoutCache,
  });
  return { bytes, manifest, scalars, snapshot };
}

/** Everything the download button needs: canonical inputs → snapshot → extras → workbook. */
export function workbookForInputs(inputs: Inputs, t: Messages, pageUrl: string): FormulaWorkbook {
  const canonical = canonicalInputs(inputs);
  return buildFormulaWorkbook(buildSnapshot(canonical), workbookExtras(canonical), t, pageUrl);
}
