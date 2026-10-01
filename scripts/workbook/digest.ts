// The workbooks of an input set as the verification builds them, and a digest of their content. Shared by the
// Excel verification (verify.ts) and the test that keeps its archive current (test/verification.test.ts).
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { buildSnapshot, type Inputs } from "../../src/engine";
import { buildFormulaWorkbook, canonicalInputs, workbookExtras } from "../../src/lib/workbook/build";
import { en } from "../../src/messages/en";

export const PAGE_URL = "https://igorsabodakha.com/wind-farm-calculator/";

/** The workbook with cached results (as downloaded) and its copy with formulas only (for Excel to recalculate). */
export function variantWorkbooks(inputs: Inputs) {
  const canonical = canonicalInputs(inputs);
  const snapshot = buildSnapshot(canonical);
  const extras = workbookExtras(canonical);
  return {
    full: buildFormulaWorkbook(snapshot, extras, en, PAGE_URL),
    bare: buildFormulaWorkbook(snapshot, extras, en, PAGE_URL, { withoutCache: true }),
  };
}

/** SHA-256 over the files inside a workbook, names and contents in name order: independent of the zip packing. */
export function workbookDigest(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const h = createHash("sha256");
  for (const name of Object.keys(files).sort()) {
    h.update(name);
    h.update("\0");
    h.update(files[name]!);
    h.update("\0");
  }
  return h.digest("hex");
}

/** What a full Excel run leaves in verification/excel-run.json. */
export interface ExcelRun {
  date: string;
  excel: string;
  engineVersion: string;
  /** workbookDigest of the base case's formula-only workbook that Excel recalculated. */
  baseWorkbookDigest: string;
  tolerance: { money: number; other: number };
  variants: Record<string, { cells: number; differ: number; cachesDiffer: number }>;
  edits: Record<string, { ok: boolean; note: string }>;
  negativeControls: Record<string, { ok: boolean; note: string }>;
  pairs: { total: number; missing: string[] };
}
